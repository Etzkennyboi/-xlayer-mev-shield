/**
 * Agent HTTP Endpoint — A2A-compatible agent server.
 */

import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuid } from "uuid";
import winston from "winston";
import { tools, getTool } from "./tools";

// ── Logger Setup ──
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "xlayer-mev-shield" },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/agent.log" }),
  ],
});

// ── Authentication ──
const VALID_API_KEYS = new Set([
  process.env.API_KEY_1 || "dev-key-1",
  process.env.API_KEY_2 || "",
]);

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey || !VALID_API_KEYS.has(apiKey) || apiKey === "") {
    logger.warn("Unauthorized access attempt", {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
    });
    res.status(401).json({ error: "Unauthorized. Provide X-API-Key header." });
    return;
  }

  next();
}

// ── Rate Limiting ──
const executeRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: "Too many requests, please try again later",
  standardHeaders: true,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip || "unknown",
});

// ── Request ID & Logging ──
function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = uuid();
  res.setHeader("X-Request-ID", requestId);
  (req as any).requestId = requestId;

  const startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger.info("Request completed", {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
  });

  next();
}

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      agent: "xlayer-mev-shield",
      version: "1.0.0",
      chain: "X Layer",
      chainId: 196,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/agent.json", (_req: Request, res: Response) => {
    res.json({
      name: "X Layer MEV Shield",
      description:
        "Pre-flight transaction safety shield that analyzes any transaction before execution to detect sandwich attacks, infinite token approvals, known scam contracts, phishing patterns, and MEV extraction. Uses onchainOS as the primary data source for contract verification, token metadata, and wallet history.",
      version: "1.0.0",
      capabilities: [
        "transaction_safety_analysis",
        "approval_risk_check",
        "sandwich_risk_detection",
        "scam_contract_detection",
        "phishing_pattern_detection",
      ],
      protocols: ["X Layer DeFi", "PancakeSwap V3", "OKX DEX"],
      chain: "X Layer",
      chainId: 196,
      interfaces: {
        tools: "/tools",
        execute: "/execute",
        health: "/health",
      },
      dataSource: "onchainOS (primary) + viem on-chain fallback",
    });
  });

  app.get("/tools", (_req: Request, res: Response) => {
    const toolList = tools.map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      parameters: t.parameters,
    }));
    res.json({ tools: toolList, count: toolList.length });
  });

  app.post("/execute", authMiddleware, executeRateLimiter, async (req: Request, res: Response) => {
    const { tool: toolName, params } = req.body;
    const requestId = (req as any).requestId;

    if (!toolName) {
      logger.warn("Missing tool parameter", { requestId, ip: req.ip });
      res.status(400).json({ error: "Missing 'tool' field" });
      return;
    }

    const tool = getTool(toolName);
    if (!tool) {
      logger.warn("Unknown tool requested", { requestId, tool: toolName, ip: req.ip });
      res.status(404).json({
        error: `Unknown tool: ${toolName}`,
        available: tools.map((t) => t.name),
      });
      return;
    }

    logger.info("Tool execution started", { requestId, tool: toolName, ip: req.ip });

    try {
      const startTime = Date.now();
      const result = await tool.handler(params || {});
      const durationMs = Date.now() - startTime;

      logger.info("Tool execution succeeded", {
        requestId,
        tool: toolName,
        duration: durationMs,
        ip: req.ip,
      });

      res.json({
        tool: toolName,
        result,
        meta: {
          requestId,
          durationMs,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      // Distinguish validation errors (400) from runtime errors (500)
      const isValidation = err.message?.startsWith("Invalid param:");
      logger.error("Tool execution failed", {
        requestId,
        tool: toolName,
        error: err.message,
        isValidation,
        ip: req.ip,
      });
      res.status(isValidation ? 400 : 500).json({
        error: err.message || "Tool execution failed",
        tool: toolName,
        requestId,
      });
    }
  });

  return app;
}
