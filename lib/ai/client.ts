import Anthropic from "@anthropic-ai/sdk";

// Direct Anthropic API access (no gateway). The key stays server-side.
// Model and effort are configurable; defaults chosen from current Anthropic docs.

export const AI_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
export const AI_EFFORT = (process.env.ANTHROPIC_EFFORT?.trim() || "medium") as "low" | "medium" | "high";

// Server-side refusal fallback: on a policy decline the API reruns on a routed model
// inside the same call. response.model records which model actually answered.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

// Published per-million-token prices used for cost *estimates* only.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export const emptyUsage = (): Usage => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

export function addUsage(total: Usage, u: Partial<Record<keyof Usage, number | null>> | null | undefined): Usage {
  return {
    input_tokens: total.input_tokens + (u?.input_tokens ?? 0),
    output_tokens: total.output_tokens + (u?.output_tokens ?? 0),
    cache_read_input_tokens: total.cache_read_input_tokens + (u?.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: total.cache_creation_input_tokens + (u?.cache_creation_input_tokens ?? 0),
  };
}

/** Estimated USD cost; null when the model's price is not in the table. */
export function estimateCostUsd(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (
    (u.input_tokens * p.input + u.cache_creation_input_tokens * p.input * 1.25 + u.cache_read_input_tokens * p.cacheRead + u.output_tokens * p.output) /
    1_000_000
  );
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!aiConfigured()) throw new AiUnavailableError("not_configured");
  // One transient retry; per-request timeouts are set by callers from their deadline.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), maxRetries: 1, timeout: 60_000 });
  return client;
}

export class AiUnavailableError extends Error {
  constructor(public category: string) {
    super(`AI unavailable: ${category}`);
  }
}

/** Maps SDK errors to safe categories (never raw messages). */
export function aiErrorCategory(err: unknown): string {
  if (err instanceof AiUnavailableError) return err.category;
  if (err instanceof Anthropic.AuthenticationError) return "authentication";
  if (err instanceof Anthropic.PermissionDeniedError) return "permission_denied";
  if (err instanceof Anthropic.NotFoundError) return "model_not_found";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.BadRequestError) return "bad_request";
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.APIConnectionError) return "connection";
  if (err instanceof Anthropic.InternalServerError) return "provider_error";
  if (err instanceof Anthropic.APIError) return `api_error_${err.status ?? "unknown"}`;
  return "unexpected";
}
