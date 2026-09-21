import { Fragment, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CheckCircle2,
  Download,
  History,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  HANDLING_GRADES,
  ROOT_CAUSE_TAGS,
  SEVERITIES,
  SEVERITY_RANK,
  formatDateTime,
  gbp,
  handlingCost,
  slaDeadline,
  type Escalation,
  type HandlingGrade,
  type RootCauseTag,
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
  onPatch,
  onExport,
}: {
  items: Escalation[];
  now: number;
  onResolve: (id: string, tag: RootCauseTag, note: string) => void;
  onReopen: (id: string) => void;
  onSeverityChange: (id: string, s: Severity, reason: string) => void;
  onPatch: (id: string, changes: Partial<Escalation>, action: string, detail?: string) => void;
  onExport: (rows: Escalation[]) => void;
}) {
  const [view, setView] = useState<View>("open");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "deadline", asc: true });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Escalation | null>(null);

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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onExport(rows)}
            className="print:hidden"
          >
            <Download className="size-3.5" /> Export CSV
          </Button>
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
                        <Button size="sm" variant="outline" onClick={() => setResolving(e)}>
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
                        <div
                          className="grid gap-5 lg:grid-cols-[2fr_1.2fr_1fr]"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <div className="space-y-3">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                Issue description
                              </p>
                              <p className="mt-1 text-sm leading-relaxed text-foreground">
                                {e.description}
                              </p>
                            </div>
                            {e.rootCauseTag && (
                              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                Root cause tag
                                <span className="rounded bg-navy/10 px-1.5 py-0.5 font-medium text-navy">
                                  {e.rootCauseTag}
                                </span>
                                {e.rootCauseConfirmed ? (
                                  <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-success">
                                    Confirmed at resolution
                                  </span>
                                ) : (
                                  <span className="rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                                    {e.triageSource === "rules" ? "Rules guess" : "AI guess"},
                                    confirmed when resolved
                                  </span>
                                )}
                                {e.rootCauseConfirmed &&
                                  e.aiRootCauseTag &&
                                  e.aiRootCauseTag !== e.rootCauseTag && (
                                    <span className="text-[11px]">
                                      (AI said {e.aiRootCauseTag})
                                    </span>
                                  )}
                              </p>
                            )}
                            {e.resolutionNote && (
                              <p className="text-xs text-foreground">
                                <span className="text-muted-foreground">Resolution: </span>
                                {e.resolutionNote}
                              </p>
                            )}
                            <EditPanel
                              e={e}
                              onPatch={onPatch}
                              onSeverityChange={onSeverityChange}
                            />
                          </div>

                          <div className="rounded-md border border-border bg-card p-3">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              Cost of this escalation
                            </p>
                            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                              {gbp(handlingCost(e) + e.feeCredit)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {e.handlingHours}h at {e.handlingGrade} rate = {gbp(handlingCost(e))}
                              {e.feeCredit > 0
                                ? ` plus ${gbp(e.feeCredit)} credited to client`
                                : ""}
                            </p>
                          </div>

                          <div className="rounded-md border border-border bg-card p-3">
                            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              <History className="size-3" /> Audit trail
                            </p>
                            <ol className="mt-2 space-y-1.5 text-[11px]">
                              {[...e.history].reverse().map((h, i) => (
                                <li key={`${h.at}-${i}`} className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{h.action}</span>
                                  {h.detail ? ` · ${h.detail}` : ""}
                                  <br />
                                  {formatDateTime(h.at)} · {h.by}
                                </li>
                              ))}
                            </ol>
                          </div>
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
      <ResolveDialog
        e={resolving}
        onClose={() => setResolving(null)}
        onResolve={(id, tag, note) => {
          onResolve(id, tag, note);
          setResolving(null);
        }}
      />
    </section>
  );
}

/** Owner, severity override with a reason, and the handling cost inputs. */
function EditPanel({
  e,
  onPatch,
  onSeverityChange,
}: {
  e: Escalation;
  onPatch: (id: string, changes: Partial<Escalation>, action: string, detail?: string) => void;
  onSeverityChange: (id: string, s: Severity, reason: string) => void;
}) {
  const [owner, setOwner] = useState(e.owner ?? "");
  const [hours, setHours] = useState(String(e.handlingHours));
  const [credit, setCredit] = useState(String(e.feeCredit));
  const [pending, setPending] = useState<Severity | null>(null);
  const [reason, setReason] = useState("");

  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`owner-${e.id}`} className="text-xs">
          Owner
        </Label>
        <Input
          id={`owner-${e.id}`}
          className="h-8 bg-card text-xs"
          value={owner}
          placeholder="Unassigned"
          onChange={(ev) => setOwner(ev.target.value)}
          onBlur={() => {
            const v = owner.trim() || null;
            if (v !== e.owner)
              onPatch(e.id, { owner: v }, v ? `Assigned to ${v}` : "Owner cleared");
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Severity</Label>
        {e.severity && e.status !== "triaging" ? (
          <Select value={pending ?? e.severity} onValueChange={(v) => setPending(v as Severity)}>
            <SelectTrigger className="h-8 bg-card text-xs" aria-label="Change severity">
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
          <p className="text-xs text-muted-foreground">Awaiting triage</p>
        )}
      </div>

      {pending && pending !== e.severity && (
        <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-2.5 sm:col-span-2">
          <Label htmlFor={`reason-${e.id}`} className="text-xs">
            Why is {e.severity} wrong? (recorded in the audit trail)
          </Label>
          <div className="flex gap-2">
            <Input
              id={`reason-${e.id}`}
              className="h-8 bg-card text-xs"
              value={reason}
              placeholder="Client confirmed funds received, impact lower than reported"
              onChange={(ev) => setReason(ev.target.value)}
            />
            <Button
              size="sm"
              disabled={reason.trim().length < 3}
              onClick={() => {
                onSeverityChange(e.id, pending, reason.trim());
                setPending(null);
                setReason("");
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`hours-${e.id}`} className="text-xs">
          Handling hours
        </Label>
        <div className="flex gap-2">
          <Input
            id={`hours-${e.id}`}
            type="number"
            min={0}
            step={0.5}
            className="h-8 bg-card text-xs"
            value={hours}
            onChange={(ev) => setHours(ev.target.value)}
            onBlur={() => {
              const v = num(hours);
              if (v !== e.handlingHours)
                onPatch(e.id, { handlingHours: v }, "Handling hours updated", `${v}h`);
            }}
          />
          <Select
            value={e.handlingGrade}
            onValueChange={(v) =>
              onPatch(e.id, { handlingGrade: v as HandlingGrade }, "Handling grade updated", v)
            }
          >
            <SelectTrigger className="h-8 w-36 bg-card text-xs" aria-label="Handling grade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HANDLING_GRADES.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Staff time spent resolving this escalation, and the grade doing most of it.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`credit-${e.id}`} className="text-xs">
          Fee credit given (£)
        </Label>
        <Input
          id={`credit-${e.id}`}
          type="number"
          min={0}
          step={50}
          className="h-8 bg-card text-xs"
          value={credit}
          onChange={(ev) => setCredit(ev.target.value)}
          onBlur={() => {
            const v = num(credit);
            if (v !== e.feeCredit) onPatch(e.id, { feeCredit: v }, "Fee credit updated", gbp(v));
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Money given back to the client: fees waived, penalties reimbursed or compensation paid.
          Leave at 0 if none.
        </p>
      </div>
    </div>
  );
}

/** Resolving confirms or corrects the root cause and records what was done. */
function ResolveDialog({
  e,
  onClose,
  onResolve,
}: {
  e: Escalation | null;
  onClose: () => void;
  onResolve: (id: string, tag: RootCauseTag, note: string) => void;
}) {
  const [tag, setTag] = useState<RootCauseTag>("Unclassified");
  const [note, setNote] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);

  // Reset the form whenever a different escalation is opened.
  if (e && e.id !== lastId) {
    setLastId(e.id);
    setTag(e.rootCauseTag ?? "Unclassified");
    setNote("");
  }

  return (
    <Dialog open={e !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve {e?.id}</DialogTitle>
          <DialogDescription>
            Confirm the underlying cause now that you know it. Patterns and reports use confirmed
            causes, so a correction here makes the cross-category flags more accurate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Confirmed root cause</Label>
            <Select value={tag} onValueChange={(v) => setTag(v as RootCauseTag)}>
              <SelectTrigger aria-label="Confirmed root cause">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOT_CAUSE_TAGS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {e?.rootCauseTag && (
              <p className="text-[11px] text-muted-foreground">
                {e.triageSource === "rules" ? "Rules" : "AI"} suggested: {e.rootCauseTag}
                {tag !== e.rootCauseTag ? " (you are correcting it, this is recorded)" : ""}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resolution-note" className="text-xs">
              What was done to resolve it
            </Label>
            <Textarea
              id="resolution-note"
              rows={3}
              value={note}
              placeholder="Static data corrected, payment re-sent, client confirmed receipt."
              onChange={(ev) => setNote(ev.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={note.trim().length < 5}
            onClick={() => e && onResolve(e.id, tag, note.trim())}
          >
            <CheckCircle2 className="size-4" /> Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
