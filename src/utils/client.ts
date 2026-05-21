/**
 * Viem Public Client — fallback for direct on-chain reads.
 *
 * Used as a fallback when onchainOS cannot confirm an allowance:
 * reads the ERC-20 allowance(owner, spender) view function directly.
 */

import { createPublicClient, http, type PublicClient, type Chain } from "viem";

const xLayerChain = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.XLAYER_RPC_URL || "https://xlayer.drpc.org"] },
    public:  { http: [process.env.XLAYER_RPC_URL || "https://xlayer.drpc.org"] },
  },
} as Chain;

let _client: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  if (!_client) {
    _client = createPublicClient({
      chain: xLayerChain,
      transport: http(),
    });
  }
  return _client;
}
