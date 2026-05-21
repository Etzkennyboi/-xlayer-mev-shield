/**
 * Agent Tool Definitions — MEV Shield interface.
 */

import * as shield from "../services/shield";
import { VALID_DEX_NAMES } from "../config/contracts";

// ── Type Definitions ──

export interface ToolDef {
  name: string;
  description: string;
  category: string;
  parameters: Record<string, any>;
  handler: (params: any) => Promise<any>;
}

interface AnalyzeTransactionParams {
  to: string;
  data?: string;
  value?: string;
  from?: string;
}

interface CheckApprovalRiskParams {
  tokenAddress: string;
  spenderAddress: string;
  ownerAddress: string;
}

interface DetectSandwichRiskParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerance: number;
  dex: "pancakeswap" | "okx-dex";
}

export const tools: ToolDef[] = [
  {
    name: "analyze_transaction",
    description:
      "Pre-flight safety analysis of any transaction before signing. Detects sandwich attack risk, infinite token approvals, unverified contracts, known scams, honeypots, phishing patterns, and reentrancy risk. Returns a risk score (0-100), threat breakdown with evidence, and clear approve/reject recommendation. Uses onchainOS as the primary data source for contract verification, deployment history, and scam reports.",
    category: "safety",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Contract address the transaction is sent to (0x...)",
        },
        data: {
          type: "string",
          description: "Transaction calldata in hex (optional)",
        },
        value: {
          type: "string",
          description: "OKB value sent in wei (optional, omit or '0' if not sending OKB)",
        },
        from: {
          type: "string",
          description: "Your wallet address (optional, for approval history)",
        },
      },
      required: ["to"],
    },
    handler: async (params: AnalyzeTransactionParams) => {
      // Validate required param early — returns a clean 400-level error message
      shield.validateAddress(params?.to, "to");
      const analysis = await shield.analyzeTransaction(
        params.to,
        params.data,
        params.value,
        params.from
      );
      return {
        ...analysis,
        analyzedAt: new Date().toISOString(),
        dataSource: "onchainOS (Contract Data) + Internal Threat DB",
      };
    },
  },

  {
    name: "check_approval_risk",
    description:
      "Deep analysis of token approval safety. Checks current allowance (onchainOS primary, viem on-chain fallback), spender contract verification, deployment age, known scam status, and previous drain history. Returns revoke recommendation with specific transaction data if approval is dangerous.",
    category: "safety",
    parameters: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "Token contract address (0x...)",
        },
        spenderAddress: {
          type: "string",
          description: "Approved spender address (0x...)",
        },
        ownerAddress: {
          type: "string",
          description: "Your wallet address (0x...)",
        },
      },
      required: ["tokenAddress", "spenderAddress", "ownerAddress"],
    },
    handler: async (params: CheckApprovalRiskParams) => {
      const check = await shield.checkApprovalRisk(
        params.tokenAddress,
        params.spenderAddress,
        params.ownerAddress
      );
      return {
        ...check,
        checkedAt: new Date().toISOString(),
        dataSource: "onchainOS (primary) + viem on-chain fallback",
      };
    },
  },

  {
    name: "detect_sandwich_risk",
    description:
      "Analyzes a proposed swap for sandwich attack probability. Considers trade size, slippage tolerance, pool liquidity, mempool congestion, and active MEV bot presence. Returns probability score, estimated loss, risk factors, and specific mitigations (split trade, private RPC, timing). Uses onchainOS for mempool and market data.",
    category: "safety",
    parameters: {
      type: "object",
      properties: {
        tokenIn: {
          type: "string",
          description: "Token you're selling (symbol like USDC or 0x address)",
        },
        tokenOut: {
          type: "string",
          description: "Token you're buying (symbol like WETH or 0x address)",
        },
        amountIn: {
          type: "string",
          description: "Amount in wei (integer string, e.g. '1000000000000000000' for 1 token)",
        },
        slippageTolerance: {
          type: "number",
          description: "Your slippage tolerance % (e.g. 0.5). Must be 0–50.",
        },
        dex: {
          type: "string",
          enum: VALID_DEX_NAMES,
          description: "DEX name: pancakeswap or okx-dex",
        },
      },
      required: ["tokenIn", "tokenOut", "amountIn", "slippageTolerance", "dex"],
    },
    handler: async (params: DetectSandwichRiskParams) => {
      // Validate dex enum (runtime check for API inputs)
      if (!VALID_DEX_NAMES.includes(params?.dex as any)) {
        throw new Error(`Invalid param: dex must be one of: ${VALID_DEX_NAMES.join(", ")}`);
      }
      const risk = await shield.detectSandwichRisk(
        params.tokenIn,
        params.tokenOut,
        params.amountIn,
        params.slippageTolerance,
        params.dex
      );
      return {
        ...risk,
        checkedAt: new Date().toISOString(),
        dataSource: "onchainOS (Market + Mempool Data)",
      };
    },
  },
];

export function getTool(name: string): ToolDef | undefined {
  return tools.find((t) => t.name === name);
}
