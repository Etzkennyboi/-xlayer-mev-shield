---
name: xlayer-mev-shield
description: >
  Pre-flight Transaction Safety Shield for X Layer (OKX zkEVM). Analyzes any 
  transaction before execution to detect sandwich attack risk, infinite token 
  approvals, known scam contracts, phishing patterns, and MEV extraction. 
  Uses onchainOS as the primary data source for contract verification, token 
  metadata, and wallet history. Use when user asks about "is this transaction 
  safe", "should I sign this", "sandwich risk", "approval check", "contract 
  safety", "phishing detection", "MEV protection", or "transaction verification" 
  on X Layer.
---

# X Layer MEV Shield

## What This Does

This skill is a **pre-flight transaction safety engine** — something no existing plugin covers.

**The Problem:** Every transaction you sign could be:
- A **sandwich attack** where you lose 1-5% to MEV bots
- An **infinite token approval** that drains your entire wallet
- A **phishing contract** disguised as a legitimate dApp
- A **honeypot** that lets you buy but not sell

**What This Skill Does:**
1. Analyzes any transaction before you sign it (onchainOS PRIMARY for contract data)
2. Detects **sandwich attack probability** from mempool analysis
3. Flags **dangerous approval patterns** (infinite, new contracts, unverified)
4. Checks against **known scam database** (onchainOS contract verification)
5. Simulates execution outcome to catch honeypots and reverts

## Threat Categories

### 1. Sandwich Attack Risk
- **Mempool monitoring**: Is your swap being front-run?
- **Slippage analysis**: Is your slippage tolerance exploitable?
- **Price impact**: Large trades attract sandwich bots
- **DEX venue risk**: Some DEXs have higher MEV extraction

### 2. Approval Risk
- **Infinite approval**: `type(uint256).max` — full wallet drain risk
- **New contract**: Deployed <24 hours ago, no verified source
- **Unverified contract**: No source code on explorer
- **Upgradeable proxy**: Admin can change logic anytime
- **Previous approvals**: How much have you already approved?

### 3. Contract Safety
- **Known scam**: In database of reported drain contracts
- **Honeypot**: Buy function works, sell function reverts
- **Self-destruct**: Contract can be destroyed with your funds inside
- **Owner privileges**: Can the owner steal your tokens?
- **Reentrancy risk**: Classic attack pattern in contract code

### 4. Phishing Patterns
- **Sign-only transactions**: No ETH transfer, just a signature — classic drain
- **Permit2 abuse**: Legitimate protocol used for malicious approvals
- **Fake airdrop**: "Claim" requires signing, not sending — wallet drain
- **Domain spoofing**: Contract name mimics legitimate protocol

## Data Sources

| Source | Role | Data |
|--------|------|------|
| **onchainOS** | **PRIMARY** | Contract verification status, deployment age, source code |
| **onchainOS** | **PRIMARY** | Token metadata, scam reports, wallet approval history |
| **onchainOS** | **PRIMARY** | Mempool data, pending transactions, gas analysis |
| **Hyperliquid API** | Supplemental | Perp-specific safety checks |

## Tools

### 1. `analyze_transaction`

Pre-flight safety check for any transaction.

**Triggers:**
- "is this transaction safe"
- "should I sign this"
- "analyze this tx"
- "check before I sign"
- "transaction safety"
- "pre-flight check"

**Parameters:**
- `to` (string): Contract address
- `data` (string, optional): Transaction calldata (hex)
- `value` (string, optional): ETH/OKB value sent
- `from` (string, optional): Your wallet address

**Output:**
```json
{
  "riskScore": 72,
  "riskLevel": "HIGH",
  "threats": [
    {
      "category": "APPROVAL",
      "severity": "CRITICAL",
      "title": "Infinite token approval detected",
      "description": "This transaction grants unlimited spending power to 0xabcd... Contract can drain your entire wallet.",
      "evidence": "approve(spender=0xabcd..., amount=115792089237316195423570985008687907853269984665640564039457584007913129639935)"
    },
    {
      "category": "CONTRACT",
      "severity": "HIGH",
      "title": "Unverified contract deployed 3 hours ago",
      "description": "Contract has no verified source code and was deployed very recently. 94% of similar contracts are drains.",
      "evidence": "Deployment: 2026-05-21 02:15 UTC | Verified: false | Source: unavailable"
    }
  ],
  "recommendation": "REJECT — Critical approval risk + unverified contract. Do not sign.",
  "safeAlternatives": [
    "Use exact amount approval instead of infinite",
    "Wait 7 days for contract to establish reputation",
    "Use established DEX (PancakeSwap V3) instead"
  ]
}
```

### 2. `check_approval_risk`

Deep analysis of token approval safety.

**Triggers:**
- "check my approvals"
- "approval risk"
- "token allowance check"
- "who can spend my tokens"
- "revoke approval"

**Parameters:**
- `tokenAddress` (string): Token contract
- `spenderAddress` (string): Approved spender
- `ownerAddress` (string): Your wallet

**Output:**
```json
{
  "token": "USDC",
  "spender": "0xabcd...",
  "currentAllowance": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
  "allowanceType": "INFINITE",
  "risk": "CRITICAL",
  "spenderProfile": {
    "verified": false,
    "deploymentAge": "3 hours",
    "knownScam": true,
    "previousDrains": 2
  },
  "recommendation": "REVOKE IMMEDIATELY — Infinite approval to known scam contract",
  "revokeTx": {
    "to": "0x74b7f16337b8972027f6196a17a631ac6de26d22",
    "data": "0x095ea7b3000000000000000000000000abcd...00000000000000000000000000000000",
    "description": "Set approval to 0 for USDC to 0xabcd..."
  }
}
```

### 3. `detect_sandwich_risk`

Will your swap get sandwiched?

**Triggers:**
- "sandwich risk"
- "will I get frontrun"
- "MEV protection"
- "slippage check"
- "safe to swap"

**Parameters:**
- `tokenIn` (string): Token you're selling
- `tokenOut` (string): Token you're buying
- `amountIn` (string): Amount in wei
- `slippageTolerance` (number): Your slippage % (e.g. 0.5)
- `dex` (string): DEX name (pancakeswap, okx-dex)

**Output:**
```json
{
  "sandwichProbability": 0.78,
  "riskLevel": "HIGH",
  "estimatedLoss": "$127 (2.1% of trade)",
  "factors": [
    "Large trade size: $6,000 (top 2% of mempool)",
    "High slippage tolerance: 2.0% (attractive to bots)",
    "Low liquidity pool: $45K depth",
    "3 sandwich bots active in mempool"
  ],
  "recommendation": "WAIT or SPLIT — High sandwich probability. Consider:",
  "mitigations": [
    "Split into 3 x $2,000 trades over 10 minutes",
    "Use private RPC (Flashbots Protect)",
    "Reduce slippage to 0.5%",
    "Trade during low-congestion hours (02:00-06:00 UTC)"
  ]
}
```

## Principles

1. **onchainOS-first**: All contract verification, deployment data, scam reports from onchainOS
2. **Never auto-execute**: Only analyze and warn — user decides to sign or reject
3. **Evidence-based**: Every warning includes specific evidence from on-chain data
4. **Actionable**: Every risk includes specific mitigation steps
5. **Pre-flight only**: Analyze BEFORE signing, not after
6. **Zero trust**: Assume every unknown contract is malicious until proven otherwise

## Risk Score Matrix

| Score | Level | Meaning | Action |
|-------|-------|---------|--------|
| 0-20 | SAFE | No threats detected | Proceed with standard caution |
| 21-40 | LOW | Minor concerns | Review, likely safe |
| 41-60 | MEDIUM | Notable risks | Consider alternatives |
| 61-80 | HIGH | Significant dangers | Strongly reconsider |
| 81-100 | CRITICAL | Likely scam or drain | REJECT immediately |

## X Layer Context

- **Chain ID**: 196
- **Native Token**: OKB
- **DEXs**: PancakeSwap V3, OKX DEX
- **MEV landscape**: Emerging — fewer bots than Ethereum mainnet, but growing

## Example Conversation Flows

**User:** "Is this transaction safe?"
→ `analyze_transaction` with tx details
→ Show risk score + threat breakdown
→ Give clear reject/approve recommendation

**User:** "Check my token approvals"
→ `check_approval_risk` for each active approval
→ Flag infinite approvals to unknown contracts
→ Provide revoke transactions

**User:** "Will my swap get sandwiched?"
→ `detect_sandwich_risk` with trade details
→ Show probability + estimated loss
→ Suggest mitigations (split, private RPC, timing)
