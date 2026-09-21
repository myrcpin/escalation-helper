import { useState } from "react";
import { Building2, Layers, Repeat, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PATTERN_THRESHOLD,
  PATTERN_WINDOW_DAYS,
  categoryPatterns,
  clientPatterns,
  gbp,
  rootCauseThemes,
  type Escalation,
  type ReviewAction,
} from "@/lib/escalations";

/** Inline form to raise a root cause review against a category or a theme. */
function AssignReview({
  kind,
  subject,
  existing,
  onAssign,
  onComplete,
}: {
  kind: ReviewAction["kind"];
  subject: string;
  existing?: ReviewAction | undefined;
  onAssign: (kind: ReviewAction["kind"], subject: string, owner: string, dueDate: string) => void;
  onComplete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  if (existing)
    return (
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-foreground">
        <UserCheck className="size-3.5 shrink-0" />
        Review with <span className="font-semibold">{existing.owner}</span>, due {existing.dueDate}
        {existing.status === "complete" ? (
          <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success">
            Complete
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onComplete(existing.id)}
            className="rounded bg-card px-1.5 py-0.5 font-medium text-navy underline-offset-2 hover:underline print:hidden"
          >
            Mark complete
          </button>
        )}
      </p>
    );

  if (!open)
    return (
      <Button
        size="sm"
        variant="outline"
        className="mt-2 h-7 bg-card text-[11px] print:hidden"
        onClick={() => setOpen(true)}
      >
        {kind === "client" ? "Assign client review" : "Assign root cause review"}
      </Button>
    );

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-card p-2.5 print:hidden">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`rev-owner-${subject}`} className="text-[11px]">
            Review owner
          </Label>
          <Input
            id={`rev-owner-${subject}`}
            className="h-8 text-xs"
            value={owner}
            placeholder="M. Chen"
            onChange={(e) => setOwner(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rev-due-${subject}`} className="text-[11px]">
            Due by
          </Label>
          <Input
            id={`rev-due-${subject}`}
            type="date"
            className="h-8 text-xs"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 text-[11px]"
          disabled={owner.trim().length < 2 || !due}
          onClick={() => {
            onAssign(kind, subject, owner.trim(), due);
            setOpen(false);
          }}
        >
          Assign
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function PatternPanel({
  items,
  now,
  from,
  reviews,
  onAssignReview,
  onCompleteReview,
  windowLabel = `last ${PATTERN_WINDOW_DAYS} days`,
}: {
  items: Escalation[];
  now: number;
  from?: number;
  reviews: ReviewAction[];
  onAssignReview: (
    kind: ReviewAction["kind"],
    subject: string,
    owner: string,
    dueDate: string,
  ) => void;
  onCompleteReview: (id: string) => void;
  windowLabel?: string;
}) {
  const rows = categoryPatterns(items, now, from);
  const themes = rootCauseThemes(items, now, from);
  const recurring = rows.filter((r) => r.recurring);
  const flaggedThemes = themes.filter((t) => t.flagged);
  const flaggedClients = clientPatterns(items, now, from).filter((c) => c.flagged);
  const confirmedIn = (ids: string[]) =>
    items.filter((e) => ids.includes(e.id) && e.rootCauseConfirmed).length;
  const max = Math.max(PATTERN_THRESHOLD, ...rows.map((r) => r.count));
  const reviewFor = (kind: ReviewAction["kind"], subject: string) =>
    reviews.find((r) => r.kind === kind && r.subject === subject);

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Pattern detection</h2>
        <p className="text-xs text-muted-foreground">
          {PATTERN_THRESHOLD}+ escalations in the {windowLabel}, by category and by underlying cause
        </p>
      </header>

      <div className="space-y-4 p-5">
        {recurring.length === 0 && flaggedThemes.length === 0 && flaggedClients.length === 0 && (
          <p className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-muted-foreground">
            No recurring issues detected in this period.
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
              {r.count} occurrences in the {windowLabel} ({r.open} still open), {gbp(r.cost)} of
              handling cost and credits. Recommend root cause review.
            </p>
            <AssignReview
              kind="category"
              subject={r.category}
              {...(reviewFor("category", r.category)
                ? { existing: reviewFor("category", r.category) }
                : {})}
              onAssign={onAssignReview}
              onComplete={onCompleteReview}
            />
          </div>
        ))}

        {flaggedThemes.map((t) => (
          <div
            key={t.tag}
            data-testid="theme-alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
              <Layers className="size-4 shrink-0" />
              Same cause across categories: {t.tag}
            </p>
            <p className="mt-0.5 text-xs text-foreground">
              {t.count} escalations across {t.categories.length} categories (
              {t.categories.join(", ")}) and {t.clients.length}{" "}
              {t.clients.length === 1 ? "client" : "clients"}, {gbp(t.cost)} of handling cost and
              credits. A category count alone would not show this.
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{t.ids.join(" · ")}</p>
            <p className="text-[10px] text-muted-foreground">
              {confirmedIn(t.ids)} of {t.count} causes confirmed at resolution, the rest are AI
              guesses
            </p>
            <AssignReview
              kind="rootCause"
              subject={t.tag}
              {...(reviewFor("rootCause", t.tag)
                ? { existing: reviewFor("rootCause", t.tag) }
                : {})}
              onAssign={onAssignReview}
              onComplete={onCompleteReview}
            />
          </div>
        ))}

        {flaggedClients.map((c) => (
          <div
            key={c.client}
            data-testid="client-alert"
            className="rounded-md border border-navy/30 bg-navy/5 px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
              <Building2 className="size-4 shrink-0" />
              Repeat client: {c.client}
            </p>
            <p className="mt-0.5 text-xs text-foreground">
              {c.count} escalations in the {windowLabel} ({c.open} still open) across{" "}
              {c.categories.join(", ")}, {gbp(c.cost)} of handling cost and credits. Relationship
              risk: brief the relationship manager before the next service review.
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{c.ids.join(" · ")}</p>
            <AssignReview
              kind="client"
              subject={c.client}
              {...(reviewFor("client", c.client)
                ? { existing: reviewFor("client", c.client) }
                : {})}
              onAssign={onAssignReview}
              onComplete={onCompleteReview}
            />
          </div>
        ))}

        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            By category
          </p>
          <ul className="space-y-2.5" aria-label="Escalations by category">
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
                  <span
                    aria-hidden
                    className="absolute -top-0.5 h-3 w-px bg-foreground/40"
                    style={{ left: `${(PATTERN_THRESHOLD / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            By underlying cause
          </p>
          <ul className="space-y-1.5" aria-label="Escalations by underlying cause">
            {themes.map((t) => (
              <li key={t.tag} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-foreground">
                  {t.tag}
                  {t.crossCategory && (
                    <span className="ml-1.5 rounded bg-secondary px-1 py-px text-[10px] font-medium text-secondary-foreground">
                      {t.categories.length} categories
                    </span>
                  )}
                </span>
                <span className="font-semibold tabular-nums text-foreground">{t.count}</span>
              </li>
            ))}
            {themes.length === 0 && (
              <li className="text-xs text-muted-foreground">Nothing tagged yet.</li>
            )}
          </ul>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Marker shows the threshold ({PATTERN_THRESHOLD}). Amber is a recurring category, red is
          one cause behind several categories.
        </p>
      </div>
    </section>
  );
}
