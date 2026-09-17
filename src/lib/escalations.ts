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

/** Fixed set so cross-category patterns are countable, not free text. */
export const ROOT_CAUSE_TAGS = [
  "Static or reference data",
  "Batch or cut-off failure",
  "Manual handoff",
  "Screening or sanctions hold",
  "Data mapping",
  "Approval bottleneck",
  "Third party or vendor",
  "System defect",
  "Client-side issue",
  "Unclassified",
] as const;
export type RootCauseTag = (typeof ROOT_CAUSE_TAGS)[number];

/** Grades that handle escalations, with the hourly cost used for handling cost. */
export const HANDLING_GRADES = ["Analyst", "Senior Analyst", "AVP", "VP"] as const;
export type HandlingGrade = (typeof HANDLING_GRADES)[number];
export const GRADE_RATES: Record<HandlingGrade, number> = {
  Analyst: 22,
  "Senior Analyst": 28,
  AVP: 35,
  VP: 45,
};

/** Default handling assumptions per severity, editable per escalation. */
export const DEFAULT_HANDLING: Record<Severity, { hours: number; grade: HandlingGrade }> = {
  Critical: { hours: 6, grade: "VP" },
  High: { hours: 4, grade: "AVP" },
  Medium: { hours: 2, grade: "Senior Analyst" },
  Low: { hours: 0.5, grade: "Analyst" },
};

export const SEVERITY_RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/** A category appearing this many times within the window is flagged as recurring. */
export const PATTERN_THRESHOLD = 3;
export const PATTERN_WINDOW_DAYS = 30;

export type TriageSource = "ai" | "rules";

/** One line of the audit trail. Append only. */
export type AuditEntry = {
  at: string;
  by: string;
  action: string;
  detail?: string;
};

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
  rootCauseTag: RootCauseTag | null;
  handlingHours: number;
  handlingGrade: HandlingGrade;
  feeCredit: number;
  history: AuditEntry[];
};

/** A root cause review raised off a recurring category or a cross-category theme. */
export type ReviewAction = {
  id: string;
  kind: "category" | "rootCause";
  subject: string;
  owner: string;
  dueDate: string;
  createdAt: string;
  createdBy: string;
  status: "open" | "complete";
  note: string | null;
};

export const audit = (by: string, action: string, detail?: string): AuditEntry => ({
  at: new Date().toISOString(),
  by,
  ...(detail ? { action, detail } : { action }),
});

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

/* ---------- commercial value ---------- */

export const handlingCost = (e: Escalation) =>
  Math.round(e.handlingHours * GRADE_RATES[e.handlingGrade]);

/** Handling cost plus any money credited back to the client. */
export const totalCost = (e: Escalation) => handlingCost(e) + e.feeCredit;

export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);

/* ---------- pattern detection ---------- */

export type CategoryCount = {
  category: Category;
  count: number;
  open: number;
  cost: number;
  recurring: boolean;
};

/** Escalations received inside a window (open and resolved alike). */
export const inPeriod = (items: Escalation[], from: number, to: number) =>
  items.filter((e) => {
    const t = new Date(e.receivedAt).getTime();
    return t >= from && t <= to;
  });

export const lastDays = (days: number, now = Date.now()) => now - days * 24 * HOUR;

/** Counts escalations per category in a window. Defaults to the last 30 days. */
export function categoryPatterns(
  items: Escalation[],
  now = Date.now(),
  from = lastDays(PATTERN_WINDOW_DAYS, now),
): CategoryCount[] {
  const recent = inPeriod(items, from, now);
  return CATEGORIES.map((category) => {
    const inCat = recent.filter((e) => e.category === category);
    return {
      category,
      count: inCat.length,
      open: inCat.filter((e) => e.status !== "resolved").length,
      cost: inCat.reduce((s, e) => s + totalCost(e), 0),
      recurring: inCat.length >= PATTERN_THRESHOLD,
    };
  }).sort((a, b) => b.count - a.count);
}

export type RootCauseTheme = {
  tag: RootCauseTag;
  count: number;
  categories: Category[];
  clients: string[];
  cost: number;
  ids: string[];
  /** Different categories, same underlying cause: the pattern a category count hides. */
  crossCategory: boolean;
  flagged: boolean;
};

/**
 * Groups a window by root cause tag rather than category, so "different issues, same
 * underlying cause" surfaces. Flagged at the same threshold as categories.
 */
export function rootCauseThemes(
  items: Escalation[],
  now = Date.now(),
  from = lastDays(PATTERN_WINDOW_DAYS, now),
): RootCauseTheme[] {
  const recent = inPeriod(items, from, now).filter((e) => e.rootCauseTag);
  const byTag = new Map<RootCauseTag, Escalation[]>();
  for (const e of recent) {
    const tag = e.rootCauseTag as RootCauseTag;
    byTag.set(tag, [...(byTag.get(tag) ?? []), e]);
  }
  return [...byTag.entries()]
    .map(([tag, list]) => {
      const categories = [...new Set(list.map((e) => e.category))];
      return {
        tag,
        count: list.length,
        categories,
        clients: [...new Set(list.map((e) => e.client))],
        cost: list.reduce((s, e) => s + totalCost(e), 0),
        ids: list.map((e) => e.id),
        crossCategory: categories.length > 1,
        flagged: list.length >= PATTERN_THRESHOLD && categories.length > 1,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/* ---------- reporting ---------- */

export type PeriodMetrics = {
  total: number;
  open: number;
  resolved: number;
  breached: number;
  slaMetRate: number | null;
  bySeverity: Record<Severity, number>;
  handlingCost: number;
  feeCredits: number;
  cost: number;
  avgResolutionHours: number | null;
};

const resolvedWithinSla = (e: Escalation) =>
  e.resolvedAt != null &&
  e.slaHours != null &&
  new Date(e.resolvedAt).getTime() - new Date(e.receivedAt).getTime() <= e.slaHours * HOUR;

/** Every number the report quotes, for one window. */
export function periodMetrics(items: Escalation[], from: number, to: number): PeriodMetrics {
  const list = inPeriod(items, from, to);
  const resolved = list.filter((e) => e.status === "resolved");
  const breachedResolved = resolved.filter((e) => !resolvedWithinSla(e));
  const breachedOpen = list.filter(
    (e) => e.status !== "resolved" && urgencyOf(e, to) === "overdue",
  );
  const durations = resolved
    .filter((e) => e.resolvedAt)
    .map(
      (e) => (new Date(e.resolvedAt as string).getTime() - new Date(e.receivedAt).getTime()) / HOUR,
    );
  return {
    total: list.length,
    open: list.filter((e) => e.status !== "resolved").length,
    resolved: resolved.length,
    breached: breachedResolved.length + breachedOpen.length,
    slaMetRate: resolved.length
      ? (resolved.length - breachedResolved.length) / resolved.length
      : null,
    bySeverity: SEVERITIES.reduce(
      (acc, s) => ({ ...acc, [s]: list.filter((e) => e.severity === s).length }),
      {} as Record<Severity, number>,
    ),
    handlingCost: list.reduce((s, e) => s + handlingCost(e), 0),
    feeCredits: list.reduce((s, e) => s + e.feeCredit, 0),
    cost: list.reduce((s, e) => s + totalCost(e), 0),
    avgResolutionHours: durations.length
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : null,
  };
}

/** Escalations in the window as CSV, for a service review pack. */
export function toCsv(items: Escalation[]) {
  const head = [
    "Ref",
    "Client",
    "Category",
    "Severity",
    "Root cause",
    "Root cause tag",
    "Triaged by",
    "Received",
    "SLA hours",
    "SLA deadline",
    "Status",
    "Resolved",
    "Owner",
    "Handling hours",
    "Grade",
    "Handling cost (GBP)",
    "Fee credit (GBP)",
  ];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = items.map((e) =>
    [
      e.id,
      e.client,
      e.category,
      e.severity ?? "",
      e.rootCause ?? "",
      e.rootCauseTag ?? "",
      e.triageSource ?? "",
      e.receivedAt,
      e.slaHours ?? "",
      slaDeadline(e) ? new Date(slaDeadline(e) as number).toISOString() : "",
      e.status,
      e.resolvedAt ?? "",
      e.owner ?? "",
      e.handlingHours,
      e.handlingGrade,
      handlingCost(e),
      e.feeCredit,
    ]
      .map(cell)
      .join(","),
  );
  return [head.map(cell).join(","), ...rows].join("\n");
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
  const tagByCategory: Record<Category, RootCauseTag> = {
    "Cash Processing Delay": "Batch or cut-off failure",
    "Reporting Error": "Data mapping",
    "Reconciliation Discrepancy": "Static or reference data",
    "Payment Failure": "Static or reference data",
    Other: "Unclassified",
  };
  const rootCause: Record<Category, string> = {
    "Cash Processing Delay": "Likely a processing queue or cut-off timing issue.",
    "Reporting Error": "Likely a data mapping or report configuration issue.",
    "Reconciliation Discrepancy": "Likely a timing or static data mismatch between systems.",
    "Payment Failure": "Likely invalid beneficiary details or a screening hold.",
    Other: "Needs manual review to identify the cause.",
  };
  return {
    severity,
    slaHours: SLA_POLICY_HOURS[severity],
    rootCause: rootCause[category],
    rootCauseTag: tagByCategory[category],
  };
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
  tag: RootCauseTag,
  opts: { resolvedHoursAgo?: number; owner?: string; feeCredit?: number; hours?: number } = {},
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
  rootCauseTag: tag,
  handlingHours: opts.hours ?? DEFAULT_HANDLING[severity].hours,
  handlingGrade: DEFAULT_HANDLING[severity].grade,
  feeCredit: opts.feeCredit ?? 0,
  history: [
    { at: ago(receivedHoursAgo), by: "Client services", action: "Logged" },
    {
      at: ago(receivedHoursAgo),
      by: "AI triage",
      action: `Triaged as ${severity}`,
      detail: `SLA ${SLA_POLICY_HOURS[severity]}h · ${tag}`,
    },
    ...(opts.owner
      ? [{ at: ago(receivedHoursAgo), by: "Client services", action: `Assigned to ${opts.owner}` }]
      : []),
    ...(opts.resolvedHoursAgo != null
      ? [
          {
            at: ago(opts.resolvedHoursAgo),
            by: opts.owner ?? "Client services",
            action: "Resolved",
          },
        ]
      : []),
  ],
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
    "Third party or vendor",
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
    "Manual handoff",
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
    "Static or reference data",
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
    "Approval bottleneck",
  ),
  seed(
    5,
    "Kestrel Asset Management",
    "Reporting Error",
    "Medium",
    3,
    "Quarterly performance report shows incorrect benchmark returns for two share classes.",
    "Benchmark reference data still points at a retired index series.",
    "Static or reference data",
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
    "Batch or cut-off failure",
  ),
  seed(
    7,
    "Oakhurst Endowment",
    "Payment Failure",
    "High",
    30,
    "Outbound EUR payment returned by the beneficiary bank citing an invalid IBAN.",
    "Beneficiary static data captured with a transposed IBAN digit.",
    "Static or reference data",
    { resolvedHoursAgo: 26, owner: "S. Patel", feeCredit: 500 },
  ),
  seed(
    8,
    "Northgate Capital Partners",
    "Cash Processing Delay",
    "Critical",
    96,
    "Redemption proceeds of £30m not paid on value date, client facing late payment penalties.",
    "Cut-off missed after an overnight batch failure in the cash platform.",
    "Batch or cut-off failure",
    { resolvedHoursAgo: 88, owner: "J. Okoro", feeCredit: 8500, hours: 9 },
  ),
  seed(
    9,
    "Sterling Row Investments",
    "Payment Failure",
    "Medium",
    240,
    "Standing order to a supplier failed twice this week with a generic rejection code.",
    "Payment held by sanctions screening due to a partial name match.",
    "Screening or sanctions hold",
    { resolvedHoursAgo: 205, owner: "A. Brennan", feeCredit: 250 },
  ),
  seed(
    10,
    "Lindqvist Wealth",
    "Cash Processing Delay",
    "Medium",
    410,
    "Dividend cash from a Swedish holding not reflected in the client's cash balance.",
    "Foreign income pending FX conversion instruction.",
    "Manual handoff",
    { resolvedHoursAgo: 398, owner: "M. Chen" },
  ),
];
