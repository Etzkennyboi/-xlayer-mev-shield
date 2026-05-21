import dotenv from "dotenv";
dotenv.config();

import { createServer } from "./agent/endpoint";

const PORT = parseInt(process.env.PORT || "3000", 10);
const app = createServer();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  X Layer MEV Shield v1.0.0                             ║
╠══════════════════════════════════════════════════════════╣
║  Chain: X Layer (Chain ID: 196)                          ║
║  Data Source: onchainOS (PRIMARY)                         ║
║  Focus: Pre-flight transaction safety                  ║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║  GET  /health      — Health check                        ║
║  GET  /agent.json  — Agent Card (A2A discovery)           ║
║  GET  /tools       — List all capabilities               ║
║  POST /execute     — Run a tool                          ║
╠══════════════════════════════════════════════════════════╣
║  Server: http://localhost:${String(PORT).padEnd(5)}                        ║
╚══════════════════════════════════════════════════════════╝
  `);
});
