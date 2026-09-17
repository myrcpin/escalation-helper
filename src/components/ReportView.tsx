import { useMemo, useState } from "react";
import { Download, Loader2, Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PatternPanel } from "@/components/PatternPanel";
import { reportNarrative } from "@/lib/ai-triage";
import {
  SEVERITIES,
  formatDateTime,
  gbp,
  inPeriod,
  lastDays,
  periodMetrics,
  rootCauseThemes,
  slaDeadline,
  urgencyOf,
  type Escalation,
  type ReviewAction,
} from "@/lib/escalations";

type Preset = "7" | "30" | "month" | "quarter" | "custom";

const startOfMonth = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
const startOfLastQuarter = (now: number) => {
  const d = new Date(now);
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 - 3, 1).getTime();
};
const endOfLastQuarter = (now: number) => {
  const d = new Date(now);
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).getTime() - 1;
};
const dateInput = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Compact rows for the AI narrative call: no client data beyond what the report already shows. */
const narrativeRows = (list: Escalation[]) =>
  list
    .map(
      (e) =>
        `${e.id} | ${e.client} | ${e.category} | ${e.severity ?? "untriaged"} | ${e.rootCauseTag ?? "untagged"} | ${e.rootCause ?? ""} | ${e.status}`,
    )
    .join("\n");

export function ReportView({
  items,
  now,
  reviews,
  onAssignReview,
  onCompleteReview,
  onExport,
}: {
  items: Escalation[];
  now: number;
  reviews: ReviewAction[];
  onAssignReview: (
    kind: ReviewAction["kind"],
    subject: string,
    owner: string,
    dueDate: string,
  ) => void;
  onCompleteReview: (id: string) => void;
  onExport: (rows: Escalation[], label: string) => void;
}) {
  const [preset, setPreset] = useState<Preset>("30");
  const [customFrom, setCustomFrom] = useState(dateInput(lastDays(30, now)));
  const [customTo, setCustomTo] = useState(dateInput(now));
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const { from, to, label } = useMemo(() => {
    switch (preset) {
      case "7":
        return { from: lastDays(7, now), to: now, label: "Last 7 days" };
      case "month":
        return { from: startOfMonth(now), to: now, label: "This month to date" };
      case "quarter":
        return { from: startOfLastQuarter(now), to: endOfLastQuarter(now), label: "Last quarter" };
      case "custom":
        return {
          from: new Date(`${customFrom}T00:00:00`).getTime(),
          to: new Date(`${customTo}T23:59:59`).getTime(),
          label: `${customFrom} to ${customTo}`,
        };
      default:
        return { from: lastDays(30, now), to: now, label: "Last 30 days" };
    }
  }, [preset, customFrom, customTo, now]);

  const list = inPeriod(items, from, to);
  const m = periodMetrics(items, from, to);
  const themes = rootCauseThemes(items, to, from);
  const crossCategory = themes.filter((t) => t.crossCategory);
  const worst = [...list]
    .filter((e) => e.status === "resolved" && e.resolvedAt && e.slaHours != null)
    .map((e) => ({
      e,
      over: new Date(e.resolvedAt as string).getTime() - (slaDeadline(e) as number),
    }))
    .filter((x) => x.over > 0)
    .sort((a, b) => b.over - a.over)
    .slice(0, 5);
  const dueSoon = list.filter(
    (e) => e.status !== "resolved" && ["overdue", "approaching"].includes(urgencyOf(e, to)),
  );
  const periodLabel = `${label} (${formatDateTime(from)} to ${formatDateTime(to)})`;

  const generate = async () => {
    setLoading(true);
    setError(null);
    const res = await reportNarrative({
      data: { period: periodLabel, rows: narrativeRows(list) },
    }).catch(() => ({ ok: false as const, error: "Request failed." }));
    setLoading(false);
    if (res.ok) setNarrative(res.narrative);
    else setError(res.error);
  };

  const Metric = ({ label: l, value, hint }: { label: string; value: string; hint?: string }) => (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{l}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* controls: hidden when printing */}
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <div className="space-y-1.5">
          <Label className="text-xs">Reporting period</Label>
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-surface-subtle p-0.5 text-xs">
            {(
              [
                ["7", "Last 7 days"],
                ["30", "Last 30 days"],
                ["month", "This month"],
                ["quarter", "Last quarter"],
                ["custom", "Custom"],
              ] as [Preset, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPreset(k)}
                aria-pressed={preset === k}
                className={`rounded px-3 py-1.5 font-medium transition-colors ${
                  preset === k
                    ? "bg-navy text-navy-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="from" className="text-xs">
                From
              </Label>
              <Input
                id="from"
                type="date"
                className="h-9 w-40 text-xs"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs">
                To
              </Label>
              <Input
                id="to"
                type="date"
                className="h-9 w-40 text-xs"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => onExport(list, label)}>
            <Download className="size-4" /> Export CSV
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print or save as PDF
          </Button>
        </div>
      </section>

      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Escalation report: {label}
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(from)} to {formatDateTime(to)} · {list.length} escalations received ·
          generated {formatDateTime(now)}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Period summary">
        <Metric
          label="Escalations received"
          value={String(m.total)}
          hint={`${m.open} still open`}
        />
        <Metric
          label="Resolved within SLA"
          value={m.slaMetRate == null ? "–" : `${Math.round(m.slaMetRate * 100)}%`}
          hint={`of ${m.resolved} resolved in period`}
        />
        <Metric
          label="Cost of escalations"
          value={gbp(m.cost)}
          hint={`${gbp(m.handlingCost)} handling, ${gbp(m.feeCredits)} credits`}
        />
        <Metric
          label="SLA breaches"
          value={String(m.breached)}
          hint="resolved late, plus open and overdue"
        />
        <Metric
          label="Average time to resolve"
          value={m.avgResolutionHours == null ? "–" : `${m.avgResolutionHours}h`}
          hint={`${m.resolved} resolved in period`}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          By severity
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {SEVERITIES.map((s) => (
            <li key={s} className="text-muted-foreground">
              {s}{" "}
              <span className="font-semibold tabular-nums text-foreground">{m.bySeverity[s]}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_22rem]">
        <section className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Themes and root causes</h3>
                <p className="text-xs text-muted-foreground">
                  Written by AI from the escalations in this period. Edit freely before sharing.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={generate}
                disabled={loading || list.length === 0}
                className="print:hidden"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {narrative ? "Regenerate" : "Generate"}
              </Button>
            </div>

            {error && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {error} You can still write the themes yourself below.
              </p>
            )}

            {/* print shows the full text; the editor would clip it at its fixed height */}
            <div className="mt-3 hidden whitespace-pre-wrap text-sm leading-relaxed text-foreground print:block">
              {narrative}
            </div>
            <Textarea
              aria-label="Themes and root causes"
              className="mt-3 min-h-40 text-sm leading-relaxed print:hidden"
              value={narrative}
              placeholder={
                list.length === 0
                  ? "No escalations in this period."
                  : "Generate a draft, or write the themes yourself."
              }
              onChange={(e) => setNarrative(e.target.value)}
            />

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="commentary" className="text-xs">
                Analyst commentary (yours, always kept)
              </Label>
              <div className="hidden whitespace-pre-wrap text-sm leading-relaxed text-foreground print:block">
                {comment}
              </div>
              <Textarea
                id="commentary"
                className="min-h-24 text-sm leading-relaxed print:hidden"
                value={comment}
                placeholder="Context the data does not show, actions agreed, what you want the forum to decide."
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>

          {crossCategory.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">
                One cause behind several categories
              </h3>
              <ul className="mt-2 space-y-2 text-xs">
                {crossCategory.map((t) => (
                  <li key={t.tag} className="border-l-2 border-destructive/50 pl-3">
                    <p className="font-semibold text-foreground">
                      {t.tag} · {t.count} escalations · {gbp(t.cost)}
                    </p>
                    <p className="text-muted-foreground">
                      {t.categories.join(", ")} · {t.clients.join(", ")}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {t.ids.join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Worst SLA breaches</h3>
            {worst.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No resolved escalation breached its SLA in this period.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {worst.map(({ e, over }) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="text-foreground">
                      <span className="font-mono text-[11px] text-muted-foreground">{e.id}</span>{" "}
                      {e.client} · {e.category}
                    </span>
                    <span className="shrink-0 font-medium text-destructive">
                      {Math.round(over / 3_600_000)}h over
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">
              Open items overdue or due soon ({dueSoon.length})
            </h3>
            {dueSoon.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Nothing at risk in this period.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {dueSoon.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="text-foreground">
                      <span className="font-mono text-[11px] text-muted-foreground">{e.id}</span>{" "}
                      {e.client} · {e.severity}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {e.owner ?? "Unassigned"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Root cause reviews raised</h3>
            {reviews.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                None raised. Assign one from the pattern panel.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {reviews.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-foreground">
                      {r.subject}{" "}
                      <span className="text-muted-foreground">
                        ({r.kind === "category" ? "category" : "underlying cause"})
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {r.owner} · due {r.dueDate} ·{" "}
                      <span
                        className={r.status === "complete" ? "text-success" : "text-warning-strong"}
                      >
                        {r.status === "complete" ? "complete" : "open"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <PatternPanel
          items={items}
          now={to}
          from={from}
          reviews={reviews}
          onAssignReview={onAssignReview}
          onCompleteReview={onCompleteReview}
          windowLabel={label.toLowerCase()}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Costs are handling hours at the grade recorded on each escalation, plus any fee credits
        given. Figures cover escalations received in the period.
      </p>
    </div>
  );
}
