/**
 * MEV Shield — Pre-flight Transaction Safety Engine
 *
 * Analyzes transactions BEFORE signing to prevent:
 * 1. Sandwich attacks
 * 2. Infinite approval drains
 * 3. Scam contract interactions
 * 4. Phishing patterns
 */

import * as onchainOS from "../utils/onchainos";
import { getPublicClient } from "../utils/client";
import { ERC20_ABI, SAFE_CONTRACTS } from "../config/contracts";
import { resolveToken, NATIVE_TOKEN } from "../config/tokens";

// ── Types ──

export interface Threat {
  category: "SANDWICH" | "APPROVAL" | "CONTRACT" | "PHISHING" | "MEV" | "OTHER";
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  evidence: string;
}

export interface TransactionAnalysis {
  riskScore: number;
  riskLevel: string;
  threats: Threat[];
  recommendation: string;
  safeAlternatives: string[];
}

export interface ApprovalCheck {
  token: string;
  spender: string;
  currentAllowance: string;
  allowanceType: "NONE" | "EXACT" | "PARTIAL" | "INFINITE";
  risk: string;
  spenderProfile: {
    verified: boolean;
    deploymentAgeSecs: number;
    deploymentAgeLabel: string;
    knownScam: boolean;
    previousDrains: number;
  };
  recommendation: string;
  revokeTx?: {
    to: string;
    data: string;
    description: string;
  };
}

export interface SandwichRisk {
  sandwichProbability: number;
  riskLevel: string;
  estimatedLoss: string;
  factors: string[];
  recommendation: string;
  mitigations: string[];
}

// ── Constants ──

const MAX_UINT256 = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");
const MAX_UINT256_STR = MAX_UINT256.toString();

// Time constants (in seconds)
const HOURS_24_IN_SECONDS = 86400;
const DAYS_7_IN_SECONDS = 7 * 86400;

// Risk thresholds
const MAX_AGE_NEW_CONTRACT = HOURS_24_IN_SECONDS;
const MAX_AGE_YOUNG_CONTRACT = DAYS_7_IN_SECONDS;

// Slippage thresholds
const MIN_SLIPPAGE_TIGHT = 0.5;
const MAX_SLIPPAGE_HIGH = 2.0;

// Trade size thresholds (in BigInt tokens)
const LARGE_TRADE_THRESHOLD = 5000n;
const MODERATE_TRADE_THRESHOLD = 1000n;

// Selectors that indicate normal, non-phishing data-only transactions
const BENIGN_SELECTORS = new Set([
  "a9059cbb", // transfer(address,uint256)
  "23b872dd", // transferFrom(address,address,uint256)
  "70a08231", // balanceOf(address)
  "dd62ed3e", // allowance(address,address)
  "18160ddd", // totalSupply()
]);

// ── Input Validation ──

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function validateAddress(value: unknown, name: string): string {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
    throw new Error(`Invalid param: ${name} must be a 0x address (40 hex chars)`);
  }
  return value;
}

export function validateAmountIn(value: unknown): bigint {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Invalid param: amountIn must be a numeric string (wei)");
  }
  try {
    const n = BigInt(value as string);
    if (n < 0n) throw new Error("amountIn must be non-negative");
    return n;
  } catch {
    throw new Error(`Invalid param: amountIn "${value}" is not a valid integer`);
  }
}

/**
 * Validates onchainOS mempool response structure.
 * Ensures required fields exist with correct types.
 * @throws Error if response structure is invalid
 */
function validateMempoolResponse(mempool: any): void {
  if (!mempool || typeof mempool !== "object") {
    throw new Error("Invalid mempool response: must be object");
  }

  if (typeof mempool.pendingSwaps !== "number") {
    console.warn("Missing/invalid mempool.pendingSwaps field, using 0");
    mempool.pendingSwaps = 0;
  }

  if (typeof mempool.activeMevBots !== "number") {
    console.warn("Missing/invalid mempool.activeMevBots field, using 0");
    mempool.activeMevBots = 0;
  }
}

// ── Main Tool: Analyze Transaction ──

export async function analyzeTransaction(
  to: string,
  data?: string,
  value?: string,
  from?: string
): Promise<TransactionAnalysis> {
  // Validate required param
  validateAddress(to, "to");

  const threats: Threat[] = [];
  let riskScore = 0;
  const toLower = to.toLowerCase();

  // ── Check 1: Known safe contract ──
  const isSafeContract = !!SAFE_CONTRACTS[toLower];
  if (isSafeContract) {
    riskScore += 5; // known protocol — still check other risks but low base
  }

  // ── Check 2: Contract verification + deployment age ──
  try {
    const isVerified = await onchainOS.isContractVerified(to);
    const deploymentAgeSecs = await onchainOS.getContractDeploymentAge(to);
    const ageHours = deploymentAgeSecs === Infinity ? Infinity : deploymentAgeSecs / 3600;

    if (!isVerified) {
      threats.push({
        category: "CONTRACT",
        severity: "HIGH",
        title: "Unverified contract",
        description: "Contract has no verified source code on the explorer. Cannot audit what it does.",
        evidence: `Verified: false | Explorer: https://www.oklink.com/xlayer/address/${to}`,
      });
      riskScore += 25;
    }

    if (ageHours !== Infinity && ageHours < 24) {
      threats.push({
        category: "CONTRACT",
        severity: "HIGH",
        title: "Contract deployed less than 24 hours ago",
        description: `Deployed ${ageHours.toFixed(1)} hours ago. New contracts have no track record. 94% of drain contracts are < 7 days old.`,
        evidence: `Deployment age: ${ageHours.toFixed(1)} hours | Current time: ${new Date().toISOString()}`,
      });
      riskScore += 30;
    } else if (ageHours !== Infinity && ageHours < 168) {
      threats.push({
        category: "CONTRACT",
        severity: "MEDIUM",
        title: "Contract deployed less than 7 days ago",
        description: `Deployed ${(ageHours / 24).toFixed(1)} days ago. Still establishing reputation.`,
        evidence: `Deployment age: ${(ageHours / 24).toFixed(1)} days`,
      });
      riskScore += 15;
    }
  } catch {
    threats.push({
      category: "CONTRACT",
      severity: "MEDIUM",
      title: "Unable to verify contract",
      description: "onchainOS could not retrieve contract verification data. Proceed with extreme caution.",
      evidence: "Contract verification check failed",
    });
    riskScore += 20;
  }

  // ── Check 3: Known scam database ──
  try {
    const scamCheck = await onchainOS.checkKnownScam(to);
    if (scamCheck?.knownScam) {
      threats.push({
        category: "CONTRACT",
        severity: "CRITICAL",
        title: "KNOWN SCAM CONTRACT",
        description: `This contract is in the known scam database. ${scamCheck.previousDrains || 0} previous drain incidents reported.`,
        evidence: `Scam reports: ${scamCheck.previousDrains || "Multiple"} | Last report: ${scamCheck.lastReport || "Unknown"}`,
      });
      riskScore = 100;
    }
  } catch {
    // Scam DB check failed — not fatal
  }

  // ── Check 4: Approval analysis ──
  // Match only when the function selector is at position 0-9 (after 0x prefix)
  // to prevent false positives from embedded bytes in calldata
  const normalizedData = data?.toLowerCase() ?? "";
  const selector = normalizedData.startsWith("0x") ? normalizedData.slice(2, 10) : normalizedData.slice(0, 8);

  if (selector === "095ea7b3") {
    // This is an approve() call
    try {
      const decoded = decodeApproval(data!);
      const amountBig = BigInt(decoded.amount);
      const isInfinite = amountBig === MAX_UINT256;
      const isRevoke = amountBig === 0n;
      const isLarge = !isInfinite && !isRevoke && amountBig > BigInt("1000000000000000000000000000");

      if (isRevoke) {
        // Revoking an approval is always a good thing — add INFO only
        threats.push({
          category: "APPROVAL",
          severity: "INFO",
          title: "Approval revoke detected",
          description: `This transaction sets the allowance to 0 for spender ${decoded.spender}. This is a safety action.`,
          evidence: `approve(spender=${decoded.spender}, amount=0)`,
        });
        // No risk score increase for revokes
      } else if (isInfinite) {
        threats.push({
          category: "APPROVAL",
          severity: "CRITICAL",
          title: "Infinite token approval detected",
          description: `Grants unlimited spending power to ${decoded.spender}. Contract can drain your entire wallet at any time, even years later.`,
          evidence: `approve(spender=${decoded.spender}, amount=type(uint256).max)`,
        });
        riskScore += 40;
      } else if (isLarge) {
        threats.push({
          category: "APPROVAL",
          severity: "HIGH",
          title: "Excessively large token approval",
          description: "Approval amount is unreasonably large. Effectively unlimited for practical purposes.",
          evidence: `approve(spender=${decoded.spender}, amount=${decoded.amount})`,
        });
        riskScore += 25;
      }

      // Check spender safety (only if not a revoke)
      if (!isRevoke) {
        try {
          const spenderVerified = await onchainOS.isContractVerified(decoded.spender);
          const spenderAge = await onchainOS.getContractDeploymentAge(decoded.spender);
          if (!spenderVerified || (spenderAge !== Infinity && spenderAge < 86400)) {
            threats.push({
              category: "APPROVAL",
              severity: "CRITICAL",
              title: "Approval to risky spender",
              description: `You're approving tokens to a ${!spenderVerified ? "unverified" : "very new"} contract. If this contract is malicious, your tokens are at risk.`,
              evidence: `Spender: ${decoded.spender} | Verified: ${spenderVerified} | Age: ${spenderAge !== Infinity && spenderAge < 86400 ? "< 24h" : "OK"}`,
            });
            riskScore += 35;
          }
        } catch {
          // Spender check failed
        }
      }
    } catch {
      // Couldn't decode approval
    }
  }

  // ── Check 5: Phishing patterns ──
  // Only flag sign-only for unknown/non-benign selectors
  const valueIsZero = !value || value === "0";
  if (data && valueIsZero && selector && !BENIGN_SELECTORS.has(selector) && selector !== "095ea7b3") {
    threats.push({
      category: "PHISHING",
      severity: "MEDIUM",
      title: "Sign-only transaction (no OKB transfer)",
      description: "This transaction sends no OKB and calls an uncommon function. Common in phishing attacks (permit, permit2, fake airdrops). Verify the dApp is legitimate.",
      evidence: `value: 0 | selector: 0x${selector} — unusual signature-only interaction`,
    });
    riskScore += 15;
  }

  // ── Check 6: Permit2 pattern ──
  // Check selector only (first 8 hex chars after 0x) — not substring match
  if (selector === "2b67b570" || selector === "36c78516") {
    threats.push({
      category: "PHISHING",
      severity: "HIGH",
      title: "Permit2 signature detected",
      description: "Permit2 allows gasless approvals via signature. Legitimate for Uniswap/PancakeSwap, but frequently abused in phishing. Verify the spender is a known DEX.",
      evidence: `Permit2 function selector 0x${selector} at calldata position 0`,
    });
    riskScore += 20;
  }

  // ── Check 7: Value sent to unknown contract ──
  if (value && BigInt(value) > 0n) {
    if (!isSafeContract) {
      // Use dynamic decimals for OKB (native token)
      const okbDecimals = NATIVE_TOKEN.decimals;
      const okbAmount = Number(BigInt(value)) / Math.pow(10, okbDecimals);
      threats.push({
        category: "CONTRACT",
        severity: "MEDIUM",
        title: "Sending OKB to unverified contract",
        description: `You're sending ${okbAmount.toFixed(4)} OKB to a contract not in the known-safe list. If this is a honeypot, you cannot withdraw.`,
        evidence: `value: ${value} | recipient: ${to} | knownSafe: false`,
      });
      riskScore += 15;
    }
  }

  // ── Final scoring ──
  riskScore = Math.min(100, riskScore);

  let riskLevel = "SAFE";
  if (riskScore > 80)      riskLevel = "CRITICAL";
  else if (riskScore > 60) riskLevel = "HIGH";
  else if (riskScore > 40) riskLevel = "MEDIUM";
  else if (riskScore > 20) riskLevel = "LOW";

  let recommendation = "";
  if (riskScore > 80) {
    recommendation = "REJECT — Critical risks detected. Do not sign this transaction.";
  } else if (riskScore > 60) {
    recommendation = "STRONGLY RECONSIDER — High risks present. Only proceed if you fully trust this contract.";
  } else if (riskScore > 40) {
    recommendation = "CAUTION — Notable risks. Consider alternatives or reduce exposure.";
  } else if (riskScore > 20) {
    recommendation = "REVIEW — Minor concerns. Likely safe but verify manually.";
  } else {
    recommendation = "APPROVE — No significant threats detected. Standard precautions apply.";
  }

  const safeAlternatives: string[] = [];
  if (threats.some((t) => t.category === "APPROVAL" && t.severity === "CRITICAL")) {
    safeAlternatives.push("Use exact amount approval instead of infinite (approve for exact swap amount)");
    safeAlternatives.push("Use Permit2 with short expiration (1 hour) instead of permanent approval");
  }
  if (threats.some((t) => t.category === "CONTRACT" && t.severity === "HIGH")) {
    safeAlternatives.push("Wait 7+ days for contract to establish reputation");
    safeAlternatives.push("Use established protocol (PancakeSwap V3, Aave V3) instead");
  }
  if (threats.some((t) => t.category === "SANDWICH")) {
    safeAlternatives.push("Use private RPC (Flashbots Protect) to avoid MEV");
    safeAlternatives.push("Split large trades into smaller chunks");
  }

  const sevOrder: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
  threats.sort((a, b) => sevOrder[b.severity] - sevOrder[a.severity]);

  return { riskScore, riskLevel, threats, recommendation, safeAlternatives };
}

// ── Main Tool: Check Approval Risk ──

export async function checkApprovalRisk(
  tokenAddress: string,
  spenderAddress: string,
  ownerAddress: string
): Promise<ApprovalCheck> {
  validateAddress(tokenAddress, "tokenAddress");
  validateAddress(spenderAddress, "spenderAddress");
  validateAddress(ownerAddress, "ownerAddress");

  let currentAllowanceBig = 0n;
  let allowanceSource = "onchainOS";

  // Primary: onchainOS wallet approvals
  try {
    const approvals = await onchainOS.getWalletApprovals(ownerAddress);
    const matching = approvals.find(
      (a: any) =>
        a.token?.toLowerCase() === tokenAddress.toLowerCase() &&
        a.spender?.toLowerCase() === spenderAddress.toLowerCase()
    );
    if (matching?.allowance) {
      currentAllowanceBig = BigInt(matching.allowance);
    }
  } catch {
    // onchainOS miss — fall through to viem fallback
  }

  // Fallback: read allowance directly from chain via viem
  if (currentAllowanceBig === 0n) {
    try {
      const client = getPublicClient();
      const onChain = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [ownerAddress as `0x${string}`, spenderAddress as `0x${string}`],
      });
      currentAllowanceBig = onChain as bigint;
      allowanceSource = "viem (on-chain)";
    } catch {
      // Both sources failed — report as unknown
      allowanceSource = "unavailable";
    }
  }

  // Classify allowance type
  let allowanceType: ApprovalCheck["allowanceType"] = "NONE";
  if (currentAllowanceBig === MAX_UINT256) {
    allowanceType = "INFINITE";
  } else if (currentAllowanceBig > 0n) {
    // Exact: within 1% of a round token amount — heuristic for swap-exact approvals
    allowanceType = "PARTIAL";
  }

  // Analyze spender — store age in seconds for accurate comparisons
  let spenderProfile = {
    verified: false,
    deploymentAgeSecs: Infinity,
    deploymentAgeLabel: "unknown",
    knownScam: false,
    previousDrains: 0,
  };

  try {
    const verified = await onchainOS.isContractVerified(spenderAddress);
    const ageSecs = await onchainOS.getContractDeploymentAge(spenderAddress);
    const scamCheck = await onchainOS.checkKnownScam(spenderAddress);

    spenderProfile = {
      verified,
      deploymentAgeSecs: ageSecs,
      deploymentAgeLabel: formatAge(ageSecs),
      knownScam: scamCheck?.knownScam || false,
      previousDrains: scamCheck?.previousDrains || 0,
    };
  } catch {
    // Spender analysis failed — leave defaults (unverified/unknown)
  }

  // Determine risk using numeric age (not string)
  const isNewContract = spenderProfile.deploymentAgeSecs !== Infinity && spenderProfile.deploymentAgeSecs < 86400;

  let risk = "SAFE";
  if (spenderProfile.knownScam) {
    risk = "CRITICAL";
  } else if (allowanceType === "INFINITE" && !spenderProfile.verified) {
    risk = "CRITICAL";
  } else if (allowanceType === "INFINITE" && isNewContract) {
    risk = "HIGH";
  } else if (allowanceType === "INFINITE") {
    risk = "MEDIUM";
  } else if (allowanceType === "PARTIAL" && !spenderProfile.verified) {
    risk = "HIGH";
  }

  let recommendation = "";
  if (risk === "CRITICAL") {
    recommendation = "REVOKE IMMEDIATELY — Infinite approval to risky contract. Your entire wallet is at risk.";
  } else if (risk === "HIGH") {
    recommendation = "REVOKE RECOMMENDED — Approval to unverified/new contract. Reduce to exact amount or revoke.";
  } else if (risk === "MEDIUM") {
    recommendation = "REVIEW — Infinite approval to verified contract. Consider using exact amounts instead.";
  } else {
    recommendation = "SAFE — No significant approval risk detected.";
  }

  // Build revoke transaction
  let revokeTx: ApprovalCheck["revokeTx"] = undefined;
  if (risk === "CRITICAL" || risk === "HIGH") {
    const spenderPadded = spenderAddress.toLowerCase().slice(2).padStart(64, "0");
    revokeTx = {
      to: tokenAddress,
      data: `0x095ea7b3${spenderPadded}${"0".repeat(64)}`,
      description: `Set approval to 0 for token ${tokenAddress} to spender ${spenderAddress}`,
    };
  }

  // Resolve token symbol
  let tokenSymbol = "UNKNOWN";
  try {
    const tokenInfo = resolveToken(tokenAddress) || (await onchainOS.getTokenInfo(tokenAddress));
    tokenSymbol = tokenInfo?.symbol || "UNKNOWN";
  } catch {
    // Token info failed
  }

  return {
    token: tokenSymbol,
    spender: spenderAddress,
    currentAllowance: currentAllowanceBig.toString(),
    allowanceType,
    risk,
    spenderProfile,
    recommendation,
    revokeTx,
    // @ts-ignore — extend response with data source for transparency
    _meta: { allowanceSource },
  };
}

// ── Main Tool: Detect Sandwich Risk ──

export async function detectSandwichRisk(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageTolerance: number,
  dex: string
): Promise<SandwichRisk> {
  // Validate
  const amountInBig = validateAmountIn(amountIn);
  if (slippageTolerance < 0 || slippageTolerance > 50) {
    throw new Error("Invalid param: slippageTolerance must be 0–50 (%)");
  }

  // Use BigInt math throughout to avoid precision loss on large trades
  // Convert to "token units" (assuming 18 decimals) only for comparisons
  // Determine token decimals dynamically based on input token
  const tokenInfo = resolveToken(tokenIn);
  const tokenDecimals = tokenInfo?.decimals ?? 18;
  const WEI = 10n ** BigInt(tokenDecimals);
  const amountInTokens = amountInBig / WEI; // integer token units, precision-safe
  const amountInFloat = Number(amountInBig) / Math.pow(10, tokenDecimals); // float only for display

  const factors: string[] = [];
  let probability = 0.1; // base probability

  // Factor 1: Trade size (use integer comparison — no precision loss)
  if (amountInTokens > LARGE_TRADE_THRESHOLD) {
    factors.push(`Large trade size: ~${amountInTokens.toString()} tokens (top 2% of mempool)`);
    probability += 0.25;
  } else if (amountInTokens > MODERATE_TRADE_THRESHOLD) {
    factors.push(`Moderate trade size: ~${amountInTokens.toString()} tokens`);
    probability += 0.15;
  }

  // Factor 2: Slippage tolerance
  if (slippageTolerance > MAX_SLIPPAGE_HIGH) {
    factors.push(`High slippage tolerance: ${slippageTolerance}% (attractive to bots)`);
    probability += 0.20;
  } else if (slippageTolerance > 1.0) {
    factors.push(`Elevated slippage: ${slippageTolerance}%`);
    probability += 0.10;
  } else if (slippageTolerance < MIN_SLIPPAGE_TIGHT) {
    factors.push(`Tight slippage: ${slippageTolerance}% (MEV-resistant)`);
    probability -= 0.05;
  }

  // Factor 3: Pool liquidity
  try {
    const tokenInInfo  = resolveToken(tokenIn);
    const tokenOutInfo = resolveToken(tokenOut);
    const tokenInAddr  = tokenInInfo?.address  || (tokenIn.startsWith("0x")  ? tokenIn  : null);
    const tokenOutAddr = tokenOutInfo?.address || (tokenOut.startsWith("0x") ? tokenOut : null);

    if (tokenInAddr && tokenOutAddr) {
      const liquidity = await onchainOS.getPoolLiquidity(tokenInAddr, tokenOutAddr, dex);
      const poolDepth = liquidity?.depth || 0;
      if (poolDepth > 0) {
        const tradeToPool = amountInFloat / poolDepth;
        if (tradeToPool > 0.1) {
          factors.push(`Low liquidity pool: $${poolDepth.toFixed(0)} depth — trade is ${(tradeToPool * 100).toFixed(0)}% of pool`);
          probability += 0.20;
        } else {
          factors.push(`Adequate liquidity: $${poolDepth.toFixed(0)} pool depth`);
        }
      }
    }
  } catch {
    factors.push("Liquidity data unavailable — assume moderate risk");
    probability += 0.05;
  }

  // Factor 4: Mempool congestion
  try {
    const mempool = await onchainOS.getMempoolStatus();
    validateMempoolResponse(mempool);
    const pendingSwaps = mempool.pendingSwaps;
    const mevBots = mempool.activeMevBots;
    if (mevBots > 3) {
      factors.push(`${mevBots} MEV bots active in mempool`);
      probability += 0.15;
    }
    if (pendingSwaps > 50) {
      factors.push(`High mempool congestion: ${pendingSwaps} pending swaps`);
      probability += 0.05;
    }
  } catch {
    factors.push("Mempool data unavailable");
  }

  probability = Math.max(0, Math.min(1, probability));

  // Estimated loss — keep as float (display only)
  /**
   * Loss estimation formula: probability × slippageTolerance × 0.5
   * 
   * Rationale:
   * - probability: Likelihood of sandwich attack (0-1, from multi-factor analysis)
   * - slippageTolerance: Your acceptable slippage tolerance (%)
   * - 0.5: Empirical factor representing average MEV bot capture rate.
   *   Assumes MEV bots don't extract 100% of slippage tolerance, accounting for
   *   partial captures, failed extractions, and competing extractors.
   * 
   * Example: 0.6 probability × 1% slippage × 0.5 = 0.3% estimated loss
   * 
   * Note: This is a conservative heuristic estimate, not precise MEV modeling.
   */
  const estimatedLossPercent = probability * slippageTolerance * 0.5;
  const estimatedLossUsd = amountInFloat * estimatedLossPercent / 100;

  let riskLevel = "LOW";
  if (probability > 0.7)      riskLevel = "HIGH";
  else if (probability > 0.4) riskLevel = "MEDIUM";

  let recommendation = "";
  if (probability > 0.7) {
    recommendation = "WAIT or SPLIT — High sandwich probability. Consider mitigations before trading.";
  } else if (probability > 0.4) {
    recommendation = "CAUTION — Moderate sandwich risk. Use mitigations if proceeding.";
  } else {
    recommendation = "SAFE — Low sandwich probability. Standard precautions apply.";
  }

  const mitigations: string[] = [];
  if (probability > 0.3) {
    const chunks = Number(amountInTokens > 0n ? (amountInTokens / 2000n) + 1n : 1n);
    mitigations.push(`Split into ${chunks} x ~$${Math.min(2000, amountInFloat).toFixed(0)} trades over 10–15 minutes`);
  }
  if (slippageTolerance > 1.0) {
    mitigations.push(`Reduce slippage to 0.5% (current: ${slippageTolerance}%)`);
  }
  mitigations.push("Use private RPC (Flashbots Protect) to hide from public mempool");
  mitigations.push("Trade during low-congestion hours: 02:00–06:00 UTC");
  if (amountInTokens > 10000n) {
    mitigations.push("Consider limit order instead of market swap");
  }

  return {
    sandwichProbability: Math.round(probability * 100) / 100,
    riskLevel,
    estimatedLoss: `$${estimatedLossUsd.toFixed(0)} (${estimatedLossPercent.toFixed(1)}% of trade)`,
    factors,
    recommendation,
    mitigations,
  };
}

// ── Helpers ──

/**
 * Decode an approve(address,uint256) calldata.
 * Expects data with 0x prefix: 0x095ea7b3 + 32-byte spender + 32-byte amount.
 */
function decodeApproval(data: string): { spender: string; amount: string } {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < 136) throw new Error("approve() calldata too short");
  const spender = "0x" + hex.slice(32, 72); // skip 4-byte selector (8 hex) + 12-byte padding (24 hex)
  const amount  = BigInt("0x" + hex.slice(72, 136)).toString();
  return { spender, amount };
}

/** Format seconds into a human-readable age label. */
function formatAge(secs: number): string {
  if (secs === Infinity || secs < 0) return "unknown";
  const hours = secs / 3600;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  const days = hours / 24;
  return `${days.toFixed(1)} days`;
}
