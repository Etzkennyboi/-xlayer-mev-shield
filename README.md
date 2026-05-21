# X Layer MEV Shield

> Pre-flight Transaction Safety Shield for X Layer — detects sandwich attacks, infinite approvals, known scams, and phishing before you sign.

## What It Does

This agent skill is a **pre-flight transaction safety engine** — something no existing plugin covers.

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

## Architecture

```
Transaction → Agent Tools → onchainOS CLI (PRIMARY) → Contract Verification
                                    ↓
                            Shield Engine → Threat Detection
                                    ↓
                            Risk Score → Recommendation → Safe Alternatives
```

## Data Sources

| Source | Role | Data |
|--------|------|------|
| **onchainOS** | **PRIMARY** | Contract verification, deployment age, source code |
| **onchainOS** | **PRIMARY** | Token metadata, scam reports, wallet approval history |
| **onchainOS** | **PRIMARY** | Mempool data, pending transactions, gas analysis |

## Tools

| Tool | Description |
|------|-------------|
| `analyze_transaction` | Pre-flight safety check for any transaction |
| `check_approval_risk` | Deep analysis of token approval safety |
| `detect_sandwich_risk` | Will your swap get sandwiched? |

## Threat Categories

1. **Sandwich Attack Risk** — Mempool monitoring, slippage analysis, price impact
2. **Approval Risk** — Infinite approvals, new contracts, unverified spenders
3. **Contract Safety** — Known scams, honeypots, self-destruct, owner privileges
4. **Phishing Patterns** — Sign-only transactions, Permit2 abuse, fake airdrops

## Risk Score Matrix

| Score | Level | Action |
|-------|-------|--------|
| 0-20 | SAFE | Proceed with standard caution |
| 21-40 | LOW | Review, likely safe |
| 41-60 | MEDIUM | Consider alternatives |
| 61-80 | HIGH | Strongly reconsider |
| 81-100 | CRITICAL | REJECT immediately |

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your OKX API credentials

# 3. Install onchainOS CLI
curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh

# 4. Run dev server
npm run dev

# Server starts at http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OKX_API_KEY` | Yes | OKX API key for onchainOS |
| `OKX_SECRET_KEY` | Yes | OKX secret key |
| `OKX_PASSPHRASE` | Yes | OKX passphrase |
| `PORT` | No | Server port (default: 3000) |

## X Layer Context

- **Chain ID**: 196
- **Native Token**: OKB
- **DEXs**: PancakeSwap V3, OKX DEX
- **MEV landscape**: Emerging — fewer bots than Ethereum mainnet, but growing

## License

MIT
