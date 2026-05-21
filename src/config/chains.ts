/**
 * X Layer Chain Configuration
 */

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const xLayer: ChainConfig = {
  id: 196,
  name: "X Layer",
  rpcUrl: process.env.XLAYER_RPC_URL || "https://xlayer.drpc.org",
  explorerUrl: "https://www.oklink.com/xlayer",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18,
  },
};

export type SupportedChain = typeof xLayer;
