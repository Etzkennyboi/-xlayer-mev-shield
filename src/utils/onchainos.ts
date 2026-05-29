/**
 * onchainOS CLI Wrapper — PRIMARY data source for MEV Shield.
 *
 * Uses execFileSync (not execSync) to prevent shell injection via address params.
 * All CLI args are passed as an array — never interpolated into a shell string.
 */

import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

const CLI_TIMEOUT_MS = 30000;

interface OnchainOSResult {
  success: boolean;
  data?: any;
  error?: string;
}

const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache to avoid stale mempool data

async function runCommand(args: string[]): Promise<OnchainOSResult> {
  const cacheKey = args.join("|");
  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return { success: true, data: cached.data };
  }

  try {
    const { stdout } = await execFileAsync("onchainos", [...args, "--json"], {
      timeout: CLI_TIMEOUT_MS,
      env: {
        ...process.env,
        OKX_API_KEY: process.env.OKX_API_KEY || "",
        OKX_SECRET_KEY: process.env.OKX_SECRET_KEY || "",
        OKX_PASSPHRASE: process.env.OKX_PASSPHRASE || "",
      },
    });
    const parsed = JSON.parse(stdout);
    
    // Cache successful reads to reduce RPC/CLI overhead
    cache.set(cacheKey, { data: parsed, expiry: Date.now() + CACHE_TTL_MS });
    
    return { success: true, data: parsed };
  } catch (err: any) {
    try {
      const errorOutput = err.stdout?.toString() || err.stderr?.toString() || err.message;
      const parsed = JSON.parse(errorOutput);
      return { success: false, error: parsed.message || parsed.error || errorOutput };
    } catch {
      return { success: false, error: err.message || "onchainOS CLI command failed" };
    }
  }
}

// ── Contract Verification ──

export async function getContractInfo(address: string): Promise<any> {
  const result = await runCommand(["contract", "info", "--address", address.toLowerCase(), "--chain", "xlayer"]);
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
  const result = await runCommand(["token", "info", "--address", address.toLowerCase(), "--chain", "xlayer"]);
  if (!result.success) {
    throw new Error(`Failed to fetch token info: ${result.error}`);
  }
  return result.data;
}

// ── Wallet Approval History ──

export async function getWalletApprovals(address: string): Promise<any[]> {
  const result = await runCommand(["wallet", "approvals", "--address", address, "--chains", "xlayer"]);
  if (!result.success) {
    throw new Error(`Failed to fetch approvals: ${result.error}`);
  }
  return result.data?.data || [];
}

// ── Market / Mempool Data ──

export async function getMempoolStatus(): Promise<any> {
  const result = await runCommand(["market", "mempool", "--chain", "xlayer"]);
  if (!result.success) {
    throw new Error(`Failed to fetch mempool: ${result.error}`);
  }
  return result.data;
}

export async function getPoolLiquidity(tokenA: string, tokenB: string, dex: string): Promise<any> {
  const result = await runCommand([
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
  const result = await runCommand(["contract", "safety", "--address", address.toLowerCase(), "--chain", "xlayer"]);
  if (!result.success) {
    return { knownScam: false, reason: "Check failed" };
  }
  return result.data;
}
