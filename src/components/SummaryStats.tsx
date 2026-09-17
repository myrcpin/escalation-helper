import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, Inbox } from "lucide-react";
import { urgencyOf, type Escalation } from "@/lib/escalations";
import { cn } from "@/lib/utils";

export function SummaryStats({ items, now }: { items: Escalation[]; now: number }) {
  const open = items.filter((e) => e.status !== "resolved");
  const overdue = open.filter((e) => urgencyOf(e, now) === "overdue").length;
  const soon = open.filter((e) => urgencyOf(e, now) === "approaching").length;
  const critical = open.filter((e) => e.severity === "Critical").length;
  const resolved = items.filter((e) => e.status === "resolved");
  const inSla = resolved.filter(
    (e) =>
      e.resolvedAt &&
      e.slaHours != null &&
      new Date(e.resolvedAt).getTime() - new Date(e.receivedAt).getTime() <= e.slaHours * 3_600_000,
  ).length;

  const tiles = [
    { label: "Open escalations", value: open.length, icon: Inbox, tone: "text-foreground" },
    {
      label: "Overdue",
      value: overdue,
      icon: AlertTriangle,
      tone: overdue ? "text-destructive" : "text-foreground",
    },
    {
      label: "Due soon",
      value: soon,
      icon: Clock,
      tone: soon ? "text-warning-strong" : "text-foreground",
    },
    {
      label: "Critical open",
      value: critical,
      icon: AlertOctagon,
      tone: critical ? "text-critical" : "text-foreground",
    },
    {
      label: "Resolved within SLA",
      value: resolved.length ? `${Math.round((inSla / resolved.length) * 100)}%` : "–",
      hint: `${inSla} of ${resolved.length} resolved`,
      icon: CheckCircle2,
      tone: "text-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]"
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <t.icon className="size-3.5" /> {t.label}
          </p>
          <p className={cn("mt-2 text-3xl font-semibold tabular-nums tracking-tight", t.tone)}>
            {t.value}
          </p>
          {"hint" in t && t.hint && <p className="text-xs text-muted-foreground">{t.hint}</p>}
        </div>
      ))}
    </div>
  );
}
