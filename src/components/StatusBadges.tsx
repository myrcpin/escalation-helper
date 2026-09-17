import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDot, Clock, Loader2 } from "lucide-react";
import {
  formatDuration,
  slaDeadline,
  slaUsed,
  urgencyOf,
  type Escalation,
  type Severity,
  type Urgency,
} from "@/lib/escalations";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<Severity, string> = {
  Critical: "bg-critical text-white",
  High: "bg-destructive/10 text-destructive ring-1 ring-destructive/25",
  Medium: "bg-warning/15 text-warning-strong ring-1 ring-warning/30",
  Low: "bg-secondary text-secondary-foreground ring-1 ring-border",
};

export function SeverityBadge({ severity }: { severity: Severity | null }) {
  if (!severity)
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Triaging
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold",
        SEVERITY_STYLE[severity],
      )}
    >
      {severity === "Critical" && <AlertOctagon className="size-3" />}
      {severity}
    </span>
  );
}

/** Red / amber / green SLA state. Always icon + text, never colour alone. */
const URGENCY: Record<Urgency, { label: string; text: string; bar: string; icon: typeof Clock }> = {
  overdue: {
    label: "Overdue",
    text: "text-destructive",
    bar: "bg-destructive",
    icon: AlertTriangle,
  },
  approaching: {
    label: "Due soon",
    text: "text-warning-strong",
    bar: "bg-warning",
    icon: Clock,
  },
  healthy: { label: "On track", text: "text-success", bar: "bg-success", icon: CircleDot },
  resolved: {
    label: "Resolved",
    text: "text-muted-foreground",
    bar: "bg-muted-foreground/40",
    icon: CheckCircle2,
  },
  pending: {
    label: "Awaiting triage",
    text: "text-muted-foreground",
    bar: "bg-border",
    icon: Loader2,
  },
};

export function SlaIndicator({ e, now }: { e: Escalation; now: number }) {
  const u = urgencyOf(e, now);
  const s = URGENCY[u];
  const deadline = slaDeadline(e);
  const Icon = s.icon;
  let detail = "";
  if (u === "overdue" && deadline) detail = `by ${formatDuration(now - deadline)}`;
  else if ((u === "approaching" || u === "healthy") && deadline)
    detail = `${formatDuration(deadline - now)} left`;
  else if (u === "resolved" && e.resolvedAt && deadline)
    detail = new Date(e.resolvedAt).getTime() <= deadline ? "within SLA" : "SLA breached";

  return (
    <div className="min-w-36" data-urgency={u}>
      <p className={cn("flex items-center gap-1.5 text-xs font-semibold", s.text)}>
        <Icon className={cn("size-3.5", u === "pending" && "animate-spin")} />
        {s.label}
        <span className="font-normal text-muted-foreground">{detail}</span>
      </p>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle"
        role="progressbar"
        aria-label="Share of SLA time used"
        aria-valuenow={Math.round(slaUsed(e, now) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", s.bar)}
          style={{ width: `${Math.max(4, slaUsed(e, now) * 100)}%` }}
        />
      </div>
    </div>
  );
}
