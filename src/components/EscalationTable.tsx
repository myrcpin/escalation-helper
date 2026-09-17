import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, CheckCircle2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SeverityBadge, SlaIndicator } from "@/components/StatusBadges";
import {
  SEVERITIES,
  SEVERITY_RANK,
  formatDateTime,
  slaDeadline,
  type Escalation,
  type Severity,
} from "@/lib/escalations";
import { cn } from "@/lib/utils";

type SortKey = "severity" | "deadline";
type View = "open" | "resolved" | "all";

export function EscalationTable({
  items,
  now,
  onResolve,
  onReopen,
  onSeverityChange,
}: {
  items: Escalation[];
  now: number;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onSeverityChange: (id: string, s: Severity) => void;
}) {
  const [view, setView] = useState<View>("open");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "deadline", asc: true });
  const [expanded, setExpanded] = useState<string | null>(null);

  const counts = {
    open: items.filter((e) => e.status !== "resolved").length,
    resolved: items.filter((e) => e.status === "resolved").length,
    all: items.length,
  };

  const rows = items
    .filter((e) =>
      view === "all" ? true : view === "open" ? e.status !== "resolved" : e.status === "resolved",
    )
    .sort((a, b) => {
      const dir = sort.asc ? 1 : -1;
      if (sort.key === "severity") {
        const d =
          (SEVERITY_RANK[a.severity ?? "Low"] ?? 9) - (SEVERITY_RANK[b.severity ?? "Low"] ?? 9);
        if (d) return d * dir;
        return (slaDeadline(a) ?? Infinity) - (slaDeadline(b) ?? Infinity);
      }
      return ((slaDeadline(a) ?? Infinity) - (slaDeadline(b) ?? Infinity)) * dir;
    });

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: true }));

  const SortHeader = ({ k, children }: { k: SortKey; children: string }) => {
    const active = sort.key === k;
    const Arrow = sort.asc ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        aria-sort={active ? (sort.asc ? "ascending" : "descending") : "none"}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {children}
        {active ? <Arrow className="size-3" /> : <ArrowDown className="size-3 opacity-30" />}
      </button>
    );
  };

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Escalations</h2>
          <p className="text-xs text-muted-foreground">
            Sorted by {sort.key === "severity" ? "severity" : "SLA deadline"}. Click a row for
            details.
          </p>
        </div>
        <div
          className="inline-flex rounded-md border border-border bg-surface-subtle p-0.5 text-xs"
          role="tablist"
        >
          {(["open", "resolved", "all"] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded px-3 py-1.5 font-medium capitalize transition-colors",
                view === v
                  ? "bg-navy text-navy-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v} <span className="tabular-nums opacity-70">{counts[v]}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle text-left text-[11px] font-medium text-muted-foreground">
              <th className="w-8 px-3 py-2.5" />
              <th className="px-3 py-2.5 uppercase tracking-wider">Ref / client</th>
              <th className="px-3 py-2.5 uppercase tracking-wider">Category</th>
              <th className="px-3 py-2.5">
                <SortHeader k="severity">Severity</SortHeader>
              </th>
              <th className="px-3 py-2.5 uppercase tracking-wider">Likely root cause</th>
              <th className="px-3 py-2.5 uppercase tracking-wider">Received</th>
              <th className="px-3 py-2.5">
                <SortHeader k="deadline">SLA deadline</SortHeader>
              </th>
              <th className="px-3 py-2.5 uppercase tracking-wider">SLA status</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const deadline = slaDeadline(e);
              const open = expanded === e.id;
              return (
                <Fragment key={e.id}>
                  <tr
                    data-testid={`row-${e.id}`}
                    onClick={() => setExpanded(open ? null : e.id)}
                    className={cn(
                      "cursor-pointer border-b border-border align-top transition-colors hover:bg-surface-subtle/70",
                      e.status === "resolved" && "text-muted-foreground",
                    )}
                  >
                    <td className="px-3 py-3">
                      <ChevronRight
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          open && "rotate-90",
                        )}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-[11px] text-muted-foreground">{e.id}</p>
                      <p className="font-medium text-foreground">{e.client}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">{e.category}</td>
                    <td className="px-3 py-3">
                      <SeverityBadge severity={e.severity} />
                    </td>
                    <td className="max-w-64 px-3 py-3 text-xs">
                      {e.rootCause ?? <span className="text-muted-foreground">Analysing…</span>}
                      {e.triageSource && (
                        <span
                          title={
                            e.triageSource === "ai"
                              ? "Triaged by AI"
                              : "AI unavailable, rules-based triage"
                          }
                          className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-navy/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-navy"
                        >
                          {e.triageSource === "ai" ? <Sparkles className="size-2.5" /> : null}
                          {e.triageSource === "ai" ? "AI" : "Rules"}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums">
                      {formatDateTime(e.receivedAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums">
                      {deadline ? formatDateTime(deadline) : "–"}
                      {e.slaHours != null && (
                        <p className="text-[11px] text-muted-foreground">{e.slaHours}h SLA</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <SlaIndicator e={e} now={now} />
                    </td>
                    <td className="px-3 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                      {e.status === "open" && (
                        <Button size="sm" variant="outline" onClick={() => onResolve(e.id)}>
                          <CheckCircle2 className="size-3.5" /> Resolve
                        </Button>
                      )}
                      {e.status === "resolved" && (
                        <Button size="sm" variant="ghost" onClick={() => onReopen(e.id)}>
                          <RotateCcw className="size-3.5" /> Reopen
                        </Button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border bg-surface-subtle/60">
                      <td />
                      <td colSpan={8} className="px-3 pb-4 pt-2">
                        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              Issue description
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-foreground">
                              {e.description}
                            </p>
                          </div>
                          <dl
                            className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <dt className="text-muted-foreground">Owner</dt>
                            <dd className="text-foreground">{e.owner ?? "Unassigned"}</dd>
                            <dt className="text-muted-foreground">Resolved</dt>
                            <dd className="text-foreground">
                              {e.resolvedAt ? formatDateTime(e.resolvedAt) : "–"}
                            </dd>
                            <dt className="self-center text-muted-foreground">Severity</dt>
                            <dd>
                              {e.severity && e.status !== "triaging" ? (
                                <Select
                                  value={e.severity}
                                  onValueChange={(v) => onSeverityChange(e.id, v as Severity)}
                                >
                                  <SelectTrigger
                                    className="h-8 w-32 bg-card text-xs"
                                    aria-label="Change severity"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SEVERITIES.map((s) => (
                                      <SelectItem key={s} value={s}>
                                        {s}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                "–"
                              )}
                            </dd>
                          </dl>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  No {view === "all" ? "" : view} escalations.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
