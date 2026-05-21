# Quick Fix Guide - Priority Patches

## 🔴 CRITICAL FIXES (Do First)

### Fix #1: Add Basic Authentication Middleware
**File:** src/agent/endpoint.ts
**Time:** 15 minutes
**Impact:** Prevents unauthorized access

```typescript
import crypto from 'crypto';

const VALID_API_KEYS = new Set([
  process.env.API_KEY_1 || 'dev-key-1',
]);

function authMiddleware(req: Request, res: Response, next: Function) {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey || !VALID_API_KEYS.has(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Apply to sensitive endpoints:
app.post('/execute', authMiddleware, async (req, res) => { ... });
```

---

### Fix #2: Add Request Validation for onchainOS Response
**File:** src/services/shield.ts  
**Time:** 20 minutes
**Impact:** Prevents silent failures from API schema changes

```typescript
// Add schema validation function:
function validateMempoolResponse(mempool: any): void {
  if (!mempool || typeof mempool !== 'object') {
    throw new Error('Invalid mempool response: must be object');
  }
  
  // These fields should exist:
  if (typeof mempool.pendingSwaps !== 'number') {
    console.warn('Missing/invalid mempool.pendingSwaps field, using 0');
    mempool.pendingSwaps = 0;
  }
  
  if (typeof mempool.activeMevBots !== 'number') {
    console.warn('Missing/invalid mempool.activeMevBots field, using 0');
    mempool.activeMevBots = 0;
  }
}

// Use in detectSandwichRisk():
const mempool = await onchainOS.getMempoolStatus();
validateMempoolResponse(mempool);
const pendingSwaps = mempool.pendingSwaps;
const mevBots = mempool.activeMevBots;
```

---

### Fix #3: Add Rate Limiting Middleware
**File:** src/agent/endpoint.ts
**Time:** 20 minutes
**Impact:** Prevents DOS attacks

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const executeRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute window
  max: 30,                   // 30 requests per minute per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,     // Return rate limit info in headers
  skipSuccessfulRequests: false,
});

app.post('/execute', executeRateLimiter, async (req, res) => { ... });
```

---

### Fix #4: Add Request Logging
**File:** src/agent/endpoint.ts
**Time:** 25 minutes
**Impact:** Audit trail for debugging

```bash
npm install winston uuid
```

```typescript
import { v4 as uuid } from 'uuid';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/agent.log' }),
  ],
});

app.use((req, res, next) => {
  const requestId = uuid();
  res.setHeader('X-Request-ID', requestId);
  
  res.on('finish', () => {
    logger.info('Tool executed', {
      requestId,
      tool: req.body?.tool,
      status: res.statusCode,
      ip: req.ip,
      timestamp: new Date().toISOString(),
      duration: res.get('X-Response-Time'),
    });
  });
  
  next();
});
```

---

## 🟡 RECOMMENDED FIXES (Do Soon)

### Fix #5: Replace Magic Numbers with Constants
**File:** src/services/shield.ts
**Time:** 10 minutes
**Impact:** Code clarity and maintainability

```typescript
// At top of shield.ts:
const HOURS_24_IN_SECONDS = 86400;
const DAYS_7_IN_SECONDS = 7 * 86400;
const MAX_AGE_NEW_CONTRACT = HOURS_24_IN_SECONDS;
const MAX_AGE_YOUNG_CONTRACT = DAYS_7_IN_SECONDS;
const MIN_SLIPPAGE_TIGHT = 0.5;
const MAX_SLIPPAGE_HIGH = 2.0;
const LARGE_TRADE_THRESHOLD = 5000n; // tokens
const MODERATE_TRADE_THRESHOLD = 1000n; // tokens

// Then replace:
if (ageHours < 24) -> if (ageSecs < MAX_AGE_NEW_CONTRACT)
if (ageHours < 168) -> if (ageSecs < MAX_AGE_YOUNG_CONTRACT)
if (amountInTokens > 5000n) -> if (amountInTokens > LARGE_TRADE_THRESHOLD)
```

---

### Fix #6: Document Loss Estimation Formula
**File:** src/services/shield.ts
**Time:** 5 minutes
**Impact:** Code clarity

```typescript
// Before this line:
const estimatedLossPercent = probability * slippageTolerance * 0.5;

// Add this comment:
/**
 * Loss estimation formula: probability × slippageTolerance × 0.5
 * 
 * Rationale:
 * - probability: Likelihood of sandwich attack (0-1)
 * - slippageTolerance: Your acceptable slippage tolerance (%)
 * - 0.5: Empirical factor representing average MEV bot capture rate
 *   (assumes MEV bots don't extract 100% of slippage, accounting for
 *    partial captures and failed extraction attempts)
 * 
 * Example: 0.6 probability × 1% slippage × 0.5 = 0.3% estimated loss
 */
const estimatedLossPercent = probability * slippageTolerance * 0.5;
```

---

### Fix #7: Type the Tool Parameters Properly
**File:** src/agent/tools.ts
**Time:** 15 minutes
**Impact:** Type safety

```typescript
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

// Replace:
handler: async (params: any) => {

// With:
handler: async (params: AnalyzeTransactionParams) => {
```

---

## 📋 Verification Checklist

After applying fixes, run:

```bash
# 1. Rebuild and check for TypeScript errors
npm run build

# 2. Test with authentication required
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "analyze_transaction", "params": {"to": "0x..."}}' 
# Expected: 401 Unauthorized

# 3. Test with valid API key
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key-1" \
  -d '{"tool": "analyze_transaction", "params": {"to": "0x1b81d678ffb9c0263b24a97847620c99d213eb14"}}'
# Expected: 200 OK with risk analysis

# 4. Check rate limiting (make 31 requests in 60 seconds)
for i in {1..31}; do
  curl -X GET http://localhost:3000/health \
    -H "X-API-Key: dev-key-1" &
done
# Last request should get 429 Too Many Requests

# 5. Verify logging
cat logs/agent.log | head -20
# Should show request details with IDs
```

---

## Estimated Time to Production

| Phase | Tasks | Time | Priority |
|-------|-------|------|----------|
| **Phase 1: Security** | Fixes #1, #2, #3, #4 | 1.5 hours | CRITICAL |
| **Phase 2: Polish** | Fixes #5, #6, #7 | 0.5 hours | HIGH |
| **Phase 3: Testing** | Verification checklist | 1 hour | HIGH |
| **Phase 4: Detection Expansion** | Add missing threat categories | 8 hours | MEDIUM |
| **Total to Production** | All above | **11 hours** | — |

---

## Environment Setup for Fixes

Create `.env` with:
```
PORT=3000
XLAYER_RPC_URL=https://xlayer.drpc.org
OKX_API_KEY=your_key_here
OKX_SECRET_KEY=your_secret_here
OKX_PASSPHRASE=your_passphrase_here
API_KEY_1=dev-key-1
NODE_ENV=development
```

Install additional dependencies:
```bash
npm install express-rate-limit winston uuid
npm install --save-dev @types/uuid
```

---

*Priority fixes ready to implement - estimated 2 hours to secure + test*
