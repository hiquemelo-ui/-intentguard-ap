import "dotenv/config";
import express from "express";
import { z } from "zod";
import { checkIntent } from "./engine.js";

const app = express();
app.use(express.json({ limit: "256kb" }));

const PORT = Number(process.env.PORT ?? 4021);
const TEST_MODE = String(process.env.TEST_MODE ?? "true") === "true";
const PAY_TO = process.env.PAY_TO ?? "";
const NETWORK = process.env.X402_NETWORK ?? "eip155:8453";
const PRICE = process.env.X402_PRICE ?? "$0.003";
const FACILITATOR = process.env.X402_FACILITATOR ?? "https://x402.org/facilitator";

const schema = z.object({
  user_request: z.string().min(3).max(12000),
  agent_plan: z.string().min(3).max(12000),
  reference_notes: z.array(z.string().max(2000)).max(20).optional()
});

app.get("/health", (_req, res) => res.json({
  ok: true,
  product: "IntentGuard",
  version: "0.1.0",
  paid: !TEST_MODE,
  price: TEST_MODE ? "$0 test mode" : PRICE
}));

app.get("/.well-known/x402", (_req, res) => res.json({
  name: "IntentGuard",
  description: "Pre-generation intent verification for AI image agents. Returns GO, FIX or ASK before image generation.",
  endpoints: [{
    method: "POST",
    path: "/v1/intent-check",
    price: TEST_MODE ? "$0" : PRICE,
    network: NETWORK
  }]
}));

app.get("/openapi.json", (_req, res) => res.json({
  openapi: "3.1.0",
  info: { title: "IntentGuard API", version: "0.1.0", description: "Verify that an image-generation agent's plan matches the user's actual request before rendering." },
  paths: {
    "/v1/intent-check": {
      post: {
        summary: "Check visual intent alignment",
        requestBody: { required: true, content: { "application/json": { schema: {
          type: "object", required: ["user_request", "agent_plan"], properties: {
            user_request: { type: "string" }, agent_plan: { type: "string" }, reference_notes: { type: "array", items: { type: "string" } }
          }
        } } } },
        responses: { "200": { description: "GO, FIX or ASK decision" }, "402": { description: "Payment required" } }
      }
    }
  }
}));

async function enableX402() {
  if (TEST_MODE) return;
  if (!PAY_TO) throw new Error("PAY_TO is required when TEST_MODE=false");

  const { paymentMiddleware } = await import("@x402/express");
  const { x402ResourceServer, HTTPFacilitatorClient } = await import("@x402/core/server");
  const { registerExactEvmScheme } = await import("@x402/evm/exact/server");

  const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR });
  const resourceServer = new x402ResourceServer(facilitatorClient);
  registerExactEvmScheme(resourceServer);

  app.use(paymentMiddleware({
    "POST /v1/intent-check": {
      accepts: [{ scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO }],
      description: "Check whether an AI image agent's planned render matches the user's request; returns GO, FIX, or ASK.",
      mimeType: "application/json"
    }
  }, resourceServer));
}

await enableX402();

app.post("/v1/intent-check", (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  return res.json(checkIntent(parsed.data));
});

app.listen(PORT, () => {
  console.log(`IntentGuard running on :${PORT} (${TEST_MODE ? "TEST" : "PAID"})`);
});
