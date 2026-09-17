import { Repeat } from "lucide-react";
import {
  PATTERN_THRESHOLD,
  PATTERN_WINDOW_DAYS,
  categoryPatterns,
  type Escalation,
} from "@/lib/escalations";

export function PatternPanel({ items, now }: { items: Escalation[]; now: number }) {
  const rows = categoryPatterns(items, now);
  const recurring = rows.filter((r) => r.recurring);
  const max = Math.max(PATTERN_THRESHOLD, ...rows.map((r) => r.count));

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Pattern detection</h2>
        <p className="text-xs text-muted-foreground">
          Categories with {PATTERN_THRESHOLD}+ escalations in the last {PATTERN_WINDOW_DAYS} days
        </p>
      </header>

      <div className="space-y-3 p-5">
        {recurring.length === 0 && (
          <p className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-muted-foreground">
            No recurring issues detected.
          </p>
        )}
        {recurring.map((r) => (
          <div
            key={r.category}
            data-testid="recurring-alert"
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warning-strong">
              <Repeat className="size-4 shrink-0" />
              Recurring issue: {r.category}
            </p>
            <p className="mt-0.5 text-xs text-foreground">
              {r.count} occurrences in the last {PATTERN_WINDOW_DAYS} days ({r.open} still open).
              Recommend root cause review.
            </p>
          </div>
        ))}

        <ul className="space-y-2.5 pt-2" aria-label="Escalations by category, last 30 days">
          {rows.map((r) => (
            <li key={r.category} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-foreground">{r.category}</span>
                <span className="font-semibold tabular-nums text-foreground">{r.count}</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-surface-subtle">
                <div
                  className={`h-2 rounded-full ${r.recurring ? "bg-warning" : "bg-navy/70"}`}
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
                {/* threshold marker */}
                <span
                  aria-hidden
                  className="absolute -top-0.5 h-3 w-px bg-foreground/40"
                  style={{ left: `${(PATTERN_THRESHOLD / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Marker shows the recurring threshold ({PATTERN_THRESHOLD}). Amber bars are flagged.
        </p>
      </div>
    </section>
  );
}
