/**
 * X Layer Contract Addresses + ABIs
 */

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Known safe contract addresses on X Layer (checksummed)
export const SAFE_CONTRACTS: Record<string, string> = {
  "0x1b81d678ffb9c0263b24a97847620c99d213eb14": "PancakeSwap V3 Router",
  "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865": "PancakeSwap V3 Factory",
  "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364": "PancakeSwap V3 PositionManager",
  "0xb048bbc1ee6b733fffcfb9e9cef7375518e25997": "PancakeSwap V3 Quoter",
  // OKX DEX Aggregation Router — verify on https://www.oklink.com/xlayer before mainnet use
  "0xda4e7a8b5a96eb6a4c81af7b67b37c21f8d32bcf": "OKX DEX Aggregation Router",
};

// DEX router addresses — used for display/info only
export const KNOWN_DEX_ROUTERS: Record<string, string> = {
  pancakeswap: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
  "okx-dex":   "0xDa4e7a8b5a96EB6A4C81Af7B67B37C21F8D32bCf",
};

// Valid DEX names accepted by detect_sandwich_risk
export const VALID_DEX_NAMES = ["pancakeswap", "okx-dex"] as const;
export type DexName = typeof VALID_DEX_NAMES[number];
