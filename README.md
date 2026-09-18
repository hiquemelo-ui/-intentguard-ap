# IntentGuard API

A pre-generation intent verification API for AI image agents.

**Problem:** image agents often execute a plausible interpretation rather than the user's literal intent.

**Product:** before rendering, send the user's request and the agent's planned image to IntentGuard. It returns:

- `GO` — aligned; render.
- `FIX` — silently correct the plan, then render.
- `ASK` — only when a real ambiguity changes the outcome.

## Example

POST `/v1/intent-check`

```json
{
  "user_request": "Faça um anúncio minimalista. Destaque entrada de 10% e não coloque mapa.",
  "agent_plan": "Criar anúncio premium com mapa, selo, slogan e preço total em destaque."
}
```

Typical response:

```json
{
  "decision": "FIX",
  "score": 0.58,
  "missing": ["10"],
  "contradictions": ["..."],
  "unnecessary_additions": ["mapa", "selo", "slogan"],
  "corrected_plan": "..."
}
```

## Start free / zero capital

```bash
cp .env.example .env
npm install
npm run dev
```

`TEST_MODE=true` means no payment is required.

## Turn on x402 USDC payments

Set:

```env
TEST_MODE=false
PAY_TO=0xYOUR_BASE_WALLET
X402_NETWORK=eip155:8453
X402_PRICE=$0.003
```

Then deploy to a stable HTTPS origin.

The x402 middleware returns HTTP 402 automatically until the buyer provides a valid payment authorization. Settlement goes to `PAY_TO`.

## Marketplace discovery

Expose:

- `/.well-known/x402`
- `/openapi.json`
- `/health`

After deployment, register the HTTPS origin with an x402 index such as Agent402, or use a facilitator/Bazaar flow that supports automatic discovery.

## Why V1 is deterministic

This version deliberately uses no paid model/API. That keeps marginal cost near zero while validating demand. A later version can add an LLM judge for semantic edge cases after revenue exists.
