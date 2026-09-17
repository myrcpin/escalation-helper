import { createServerFn } from "@tanstack/react-start";
import { CATEGORIES, SEVERITIES, SLA_POLICY_HOURS, type Severity } from "@/lib/escalations";

export type TriageResult =
  | { ok: true; severity: Severity; slaHours: number; rootCause: string }
  | { ok: false; error: string };

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You triage client escalations for the client operations team of a bank (custody, cash and payments).
Read the issue and return:
- severity:
  Critical = regulatory exposure, large-scale client money impact, many end-clients affected, or a payment deadline already missed with penalties.
  High = a single client's money or trading is blocked, a failed or returned payment, or a material position break.
  Medium = a client-facing error or delay with limited financial impact.
  Low = a query, cosmetic error or minor delay with no financial impact.
- slaHours: hours allowed to resolve. Policy maximums: Critical ${SLA_POLICY_HOURS.Critical}, High ${SLA_POLICY_HOURS.High}, Medium ${SLA_POLICY_HOURS.Medium}, Low ${SLA_POLICY_HOURS.Low}. Use the maximum unless the text shows an earlier hard deadline (for example "payment due by 3pm today").
- rootCause: one short sentence (max 15 words) naming the likely root cause category, e.g. "Likely a static data error in beneficiary details."
Reply with JSON only: {"severity":"...","slaHours":number,"rootCause":"..."}`;

/**
 * Server-side so the key stays secret. Needs the ANTHROPIC_API_KEY secret;
 * ANTHROPIC_MODEL and ANTHROPIC_BASE_URL are optional overrides.
 */
export const triageEscalation = createServerFn({ method: "POST" })
  .inputValidator((input: { client: string; description: string; category: string }) => ({
    client: String(input?.client ?? "").slice(0, 200),
    description: String(input?.description ?? "").slice(0, 4000),
    category: (CATEGORIES as readonly string[]).includes(input?.category)
      ? input.category
      : "Other",
  }))
  .handler(async ({ data }): Promise<TriageResult> => {
    const key = process.env["ANTHROPIC_API_KEY"];
    if (!key)
      return { ok: false, error: "AI triage is not configured (missing ANTHROPIC_API_KEY)." };
    try {
      const base = process.env["ANTHROPIC_BASE_URL"] || "https://api.anthropic.com";
      const res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env["ANTHROPIC_MODEL"] || DEFAULT_MODEL,
          max_tokens: 200,
          system: SYSTEM,
          messages: [
            {
              role: "user",
              content: `Client: ${data.client}\nCategory: ${data.category}\n\nIssue:\n${data.description}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        console.error("Anthropic API error", res.status, await res.text());
        return { ok: false, error: `AI service returned ${res.status}.` };
      }
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = body.content?.find((c) => c.type === "text")?.text ?? "";
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<
        string,
        unknown
      >;
      const severity = json["severity"] as Severity;
      if (!(SEVERITIES as readonly string[]).includes(severity))
        return { ok: false, error: "AI response was not understood." };
      const max = SLA_POLICY_HOURS[severity];
      const hours = Number(json["slaHours"]);
      // Never allow the AI to exceed policy; allow a tighter deadline if the text implies one.
      const slaHours =
        Number.isFinite(hours) && hours > 0 ? Math.min(max, Math.max(0.5, hours)) : max;
      return {
        ok: true,
        severity,
        slaHours,
        rootCause: String(json["rootCause"] ?? "").slice(0, 160) || "Root cause not identified.",
      };
    } catch (err) {
      console.error("AI triage failed", err);
      return { ok: false, error: "AI triage failed." };
    }
  });
