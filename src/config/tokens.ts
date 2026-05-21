/**
 * X Layer Token Registry
 */

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
}

export const TOKENS: Record<string, TokenInfo> = {
  WETH: {
    address: "0x5a77f1443d16ee5761d310e38b62f77f726bc71c",
    decimals: 18,
    symbol: "WETH",
    name: "Wrapped Ether",
  },
  USDC: {
    address: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
  },
  USDT: {
    address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
    decimals: 6,
    symbol: "USDT",
    name: "Tether USD",
  },
  WBTC: {
    address: "0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1",
    decimals: 8,
    symbol: "WBTC",
    name: "Wrapped BTC",
  },
  DAI: {
    address: "0xC5015b9d9161Dca7e18e32f6f25C4aD850731Fd4",
    decimals: 18,
    symbol: "DAI",
    name: "Dai Stablecoin",
  },
  // ETH alias → WETH address (for swap inputs that say "ETH")
  ETH: {
    address: "0x5a77f1443d16ee5761d310e38b62f77f726bc71c",
    decimals: 18,
    symbol: "WETH",
    name: "Wrapped Ether",
  },
};

export const NATIVE_TOKEN = {
  symbol: "OKB",
  decimals: 18,
  name: "OKB",
};

export function resolveToken(symbolOrAddress: string): TokenInfo | null {
  const upper = symbolOrAddress.toUpperCase();
  if (TOKENS[upper]) return TOKENS[upper];

  const lower = symbolOrAddress.toLowerCase();
  for (const t of Object.values(TOKENS)) {
    if (t.address.toLowerCase() === lower) return t;
  }
  return null;
}

export function getAllTokenAddresses(): string[] {
  return Object.values(TOKENS).map((t) => t.address);
}
