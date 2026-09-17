/* ---------- reference data ---------- */

export const CATEGORIES = [
  "Cash Processing Delay",
  "Reporting Error",
  "Reconciliation Discrepancy",
  "Payment Failure",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Maximum hours allowed to resolve, by severity (the SLA policy). */
export const SLA_POLICY_HOURS: Record<Severity, number> = {
  Critical: 4,
  High: 8,
  Medium: 24,
  Low: 72,
};

export const SEVERITY_RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** A category appearing this many times within the window is flagged as recurring. */
export const PATTERN_THRESHOLD = 3;
export const PATTERN_WINDOW_DAYS = 30;

export type TriageSource = "ai" | "rules";

export type Escalation = {
  id: string;
  client: string;
  description: string;
  category: Category;
  receivedAt: string; // ISO timestamp
  status: "triaging" | "open" | "resolved";
  severity: Severity | null;
  slaHours: number | null;
  rootCause: string | null;
  triageSource: TriageSource | null;
  resolvedAt: string | null;
  owner: string | null;
};

/* ---------- SLA and urgency ---------- */

const HOUR = 3_600_000;

export const slaDeadline = (e: Escalation) =>
  e.slaHours == null ? null : new Date(e.receivedAt).getTime() + e.slaHours * HOUR;

export type Urgency = "overdue" | "approaching" | "healthy" | "resolved" | "pending";

/** Amber once 75% of the SLA window is used, or with under an hour left. */
export function urgencyOf(e: Escalation, now = Date.now()): Urgency {
  if (e.status === "resolved") return "resolved";
  const deadline = slaDeadline(e);
  if (deadline == null) return "pending";
  const left = deadline - now;
  if (left <= 0) return "overdue";
  const window = (e.slaHours ?? 1) * HOUR;
  if (left <= Math.max(window * 0.25, 0) || left <= HOUR) return "approaching";
  return "healthy";
}

/** Share of the SLA window already used, 0 to 1 (capped). */
export function slaUsed(e: Escalation, now = Date.now()) {
  const deadline = slaDeadline(e);
  if (deadline == null || !e.slaHours) return 0;
  const end = e.resolvedAt ? new Date(e.resolvedAt).getTime() : now;
  return Math.min(1, Math.max(0, (end - new Date(e.receivedAt).getTime()) / (e.slaHours * HOUR)));
}

export function formatDuration(ms: number) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / (24 * HOUR));
  const h = Math.floor((abs % (24 * HOUR)) / HOUR);
  const m = Math.floor((abs % HOUR) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const formatDateTime = (iso: string | number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/* ---------- pattern detection ---------- */

export type CategoryCount = { category: Category; count: number; open: number; recurring: boolean };

/** Counts escalations per category received in the last 30 days (open and resolved). */
export function categoryPatterns(items: Escalation[], now = Date.now()): CategoryCount[] {
  const since = now - PATTERN_WINDOW_DAYS * 24 * HOUR;
  const recent = items.filter((e) => new Date(e.receivedAt).getTime() >= since);
  return CATEGORIES.map((category) => {
    const inCat = recent.filter((e) => e.category === category);
    return {
      category,
      count: inCat.length,
      open: inCat.filter((e) => e.status !== "resolved").length,
      recurring: inCat.length >= PATTERN_THRESHOLD,
    };
  }).sort((a, b) => b.count - a.count);
}

/* ---------- rules-based fallback triage ---------- */

/**
 * Used only when the AI service is unavailable, so a logged issue is never left untriaged.
 * Keyword rules are deliberately conservative (they err towards higher severity).
 */
export function rulesTriage(description: string, category: Category) {
  const t = description.toLowerCase();
  let severity: Severity = "Medium";
  if (/(regulat|fca|breach|fraud|sanction|all clients|system down|outage|payroll)/.test(t))
    severity = "Critical";
  else if (
    /(fail|rejected|returned|missed|deadline|urgent|£\s?\d{1,3}(,\d{3}){2,}|million)/.test(t)
  )
    severity = "High";
  else if (/(typo|cosmetic|format|query|question|minor)/.test(t)) severity = "Low";
  if (category === "Payment Failure" && severity !== "Critical") severity = "High";
  const rootCause: Record<Category, string> = {
    "Cash Processing Delay": "Likely a processing queue or cut-off timing issue.",
    "Reporting Error": "Likely a data mapping or report configuration issue.",
    "Reconciliation Discrepancy": "Likely a timing or static data mismatch between systems.",
    "Payment Failure": "Likely invalid beneficiary details or a screening hold.",
    Other: "Needs manual review to identify the cause.",
  };
  return { severity, slaHours: SLA_POLICY_HOURS[severity], rootCause: rootCause[category] };
}

/* ---------- seed data ---------- */

const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const seed = (
  n: number,
  client: string,
  category: Category,
  severity: Severity,
  receivedHoursAgo: number,
  description: string,
  rootCause: string,
  opts: { resolvedHoursAgo?: number; owner?: string } = {},
): Escalation => ({
  id: `ESC-${1040 + n}`,
  client,
  description,
  category,
  receivedAt: ago(receivedHoursAgo),
  status: opts.resolvedHoursAgo != null ? "resolved" : "open",
  severity,
  slaHours: SLA_POLICY_HOURS[severity],
  rootCause,
  triageSource: "ai",
  resolvedAt: opts.resolvedHoursAgo != null ? ago(opts.resolvedHoursAgo) : null,
  owner: opts.owner ?? null,
});

export const seedEscalations = (): Escalation[] => [
  seed(
    1,
    "Harbourside Pension Trust",
    "Payment Failure",
    "Critical",
    5.5,
    "Monthly pension payroll batch of £4.2m rejected by the clearing bank at 07:00. 1,800 members due to be paid today.",
    "Batch file format rejected after a clearing bank schema change.",
    { owner: "S. Patel" },
  ),
  seed(
    2,
    "Northgate Capital Partners",
    "Cash Processing Delay",
    "High",
    9.25,
    "Subscription monies of £12m received yesterday still not credited to the fund account. Client cannot place trades.",
    "Incoming funds held in suspense awaiting manual reference matching.",
    { owner: "J. Okoro" },
  ),
  seed(
    3,
    "Aldridge Family Office",
    "Reconciliation Discrepancy",
    "High",
    6.5,
    "Custody position for a US Treasury holding differs by 250,000 units between our books and the custodian statement.",
    "Probable unbooked corporate action or late trade settlement.",
    { owner: "M. Chen" },
  ),
  seed(
    4,
    "Meridian Charitable Foundation",
    "Cash Processing Delay",
    "Medium",
    8,
    "Grant disbursement cash transfer requested on Monday has not been released. Client chasing for confirmation.",
    "Transfer awaiting second-level approval in the payments queue.",
  ),
  seed(
    5,
    "Kestrel Asset Management",
    "Reporting Error",
    "Medium",
    3,
    "Quarterly performance report shows incorrect benchmark returns for two share classes.",
    "Benchmark data feed mapped to the wrong index series.",
    { owner: "L. Duarte" },
  ),
  seed(
    6,
    "Brightwater Insurance Ltd",
    "Cash Processing Delay",
    "Low",
    20,
    "Client asked why yesterday's interest credit posted a day later than usual. No financial impact reported.",
    "Interest run moved to next-day batch after the calendar update.",
  ),
  seed(
    7,
    "Oakhurst Endowment",
    "Payment Failure",
    "High",
    30,
    "Outbound EUR payment returned by the beneficiary bank citing an invalid IBAN.",
    "Beneficiary static data captured with a transposed IBAN digit.",
    { resolvedHoursAgo: 26, owner: "S. Patel" },
  ),
  seed(
    8,
    "Northgate Capital Partners",
    "Cash Processing Delay",
    "Critical",
    96,
    "Redemption proceeds of £30m not paid on value date, client facing late payment penalties.",
    "Cut-off missed after an overnight batch failure in the cash platform.",
    { resolvedHoursAgo: 93, owner: "J. Okoro" },
  ),
  seed(
    9,
    "Sterling Row Investments",
    "Payment Failure",
    "Medium",
    240,
    "Standing order to a supplier failed twice this week with a generic rejection code.",
    "Payment held by sanctions screening due to a partial name match.",
    { resolvedHoursAgo: 228, owner: "A. Brennan" },
  ),
  seed(
    10,
    "Lindqvist Wealth",
    "Cash Processing Delay",
    "Medium",
    410,
    "Dividend cash from a Swedish holding not reflected in the client's cash balance.",
    "Foreign income pending FX conversion instruction.",
    { resolvedHoursAgo: 398, owner: "M. Chen" },
  ),
];
