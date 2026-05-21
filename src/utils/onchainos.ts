/**
 * onchainOS CLI Wrapper — PRIMARY data source for MEV Shield.
 *
 * Uses execFileSync (not execSync) to prevent shell injection via address params.
 * All CLI args are passed as an array — never interpolated into a shell string.
 */

import { execFileSync } from "child_process";

const CLI_TIMEOUT_MS = 30000;

interface OnchainOSResult {
  success: boolean;
  data?: any;
  error?: string;
}

function runCommand(args: string[]): OnchainOSResult {
  try {
    const output = execFileSync("onchainos", [...args, "--json"], {
      timeout: CLI_TIMEOUT_MS,
      encoding: "utf-8",
      env: {
        ...process.env,
        OKX_API_KEY: process.env.OKX_API_KEY || "",
        OKX_SECRET_KEY: process.env.OKX_SECRET_KEY || "",
        OKX_PASSPHRASE: process.env.OKX_PASSPHRASE || "",
      },
    });
    const parsed = JSON.parse(output);
    return { success: true, data: parsed };
  } catch (err: any) {
    try {
      const errorOutput = err.stdout || err.stderr || err.message;
      const parsed = JSON.parse(errorOutput);
      return { success: false, error: parsed.message || parsed.error || errorOutput };
    } catch {
      return { success: false, error: err.message || "onchainOS CLI command failed" };
    }
  }
}

// ── Contract Verification ──

export async function getContractInfo(address: string): Promise<any> {
  const result = runCommand(["contract", "info", "--address", address.toLowerCase(), "--chain", "xlayer"]);
  if (!result.success) {
    throw new Error(`Failed to fetch contract info: ${result.error}`);
  }
  return result.data;
}

export async function isContractVerified(address: string): Promise<boolean> {
  try {
    const info = await getContractInfo(address);
    return info?.verified === true || info?.sourceCode !== null;
  } catch {
    return false;
  }
}

export async function getContractDeploymentAge(address: string): Promise<number> {
  try {
    const info = await getContractInfo(address);
    const deployedAt = info?.deployedAt || info?.createdAt || info?.timestamp;
    if (!deployedAt) return Infinity;
    return (Date.now() - new Date(deployedAt).getTime()) / 1000;
  } catch {
    return Infinity;
  }
}

// ── Token Data ──

export async function getTokenInfo(address: string): Promise<any> {
  const result = runCommand(["token", "info", "--address", address.toLowerCase(), "--chain", "xlayer"]);
  if (!result.success) {
    throw new Error(`Failed to fetch token info: ${result.error}`);
  }
  return result.data;
}

// ── Wallet Approval History ──

export async function getWalletApprovals(address: string): Promise<any[]> {
  const result = runCommand(["wallet", "approvals", "--address", address, "--chains", "xlayer"]);
  if (!result.success) {
    throw new Error(`Failed to fetch approvals: ${result.error}`);
  }
  return result.data?.data || [];
}

// ── Market / Mempool Data ──

export async function getMempoolStatus(): Promise<any> {
  const result = runCommand(["market", "mempool", "--chain", "xlayer"]);
  if (!result.success) {
    throw new Error(`Failed to fetch mempool: ${result.error}`);
  }
  return result.data;
}

export async function getPoolLiquidity(tokenA: string, tokenB: string, dex: string): Promise<any> {
  const result = runCommand([
    "market", "liquidity",
    "--token-a", tokenA.toLowerCase(),
    "--token-b", tokenB.toLowerCase(),
    "--dex", dex,
    "--chain", "xlayer",
  ]);
  if (!result.success) {
    throw new Error(`Failed to fetch liquidity: ${result.error}`);
  }
  return result.data;
}

// ── Scam Database ──

export async function checkKnownScam(address: string): Promise<any> {
  const result = runCommand(["contract", "safety", "--address", address.toLowerCase(), "--chain", "xlayer"]);
  if (!result.success) {
    return { knownScam: false, reason: "Check failed" };
  }
  return result.data;
}
