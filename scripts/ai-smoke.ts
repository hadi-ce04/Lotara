import { readFileSync } from "node:fs";
import { AI_MODEL, aiErrorCategory, FALLBACK_BETA, getAnthropic } from "../lib/ai/client";

// Small real API check: one text call and one vision call on the synthetic label.
// Prints model, stop reason, usage and short outputs only (never the key).
async function main() {
  const client = getAnthropic();
  try {
    const started = Date.now();
    const r = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
    });
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    console.log(`text: model=${r.model} stop=${r.stop_reason} out="${text.trim()}" in=${r.usage.input_tokens} out_tokens=${r.usage.output_tokens} ${Date.now() - started}ms`);

    const t2 = Date.now();
    const img = readFileSync("public/demo/synthetic-label-K100.png").toString("base64");
    const v = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low" },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: img } },
        { type: "text", text: "Transcribe only the lot code printed on this label." },
      ] }],
    });
    const vt = v.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    console.log(`vision: model=${v.model} stop=${v.stop_reason} out="${vt.trim().slice(0, 80)}" in=${v.usage.input_tokens} out_tokens=${v.usage.output_tokens} ${Date.now() - t2}ms`);
  } catch (err) {
    console.error(`AI smoke test failed: ${aiErrorCategory(err)}`);
    process.exitCode = 1;
  }
}

main();
