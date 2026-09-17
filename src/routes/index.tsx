import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, ListChecks, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EscalationTable } from "@/components/EscalationTable";
import { LogEscalationForm, type NewEscalation } from "@/components/LogEscalationForm";
import { PatternPanel } from "@/components/PatternPanel";
import { ReportView } from "@/components/ReportView";
import { SummaryStats } from "@/components/SummaryStats";
import { triageEscalation } from "@/lib/ai-triage";
import {
  DEFAULT_HANDLING,
  SLA_POLICY_HOURS,
  audit,
  rulesTriage,
  seedEscalations,
  toCsv,
  type Escalation,
  type ReviewAction,
  type Severity,
} from "@/lib/escalations";

const TITLE = "Escalation Triage · Client Operations";
const DESCRIPTION =
  "Log client escalations, triage them by severity with AI, track SLA deadlines, cost and recurring root causes.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Index,
});

const TICK_MS = 30_000;
/** Stands in for the signed-in user until the app has accounts. */
const CURRENT_USER = "M. Didara";

type Tab = "queue" | "report";

function Index() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [reviews, setReviews] = useState<ReviewAction[]>([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  // Time-dependent UI renders only in the browser (avoids server/client clock mismatch).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setItems(seedEscalations());
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  /** Every change to an escalation goes through here, so nothing escapes the audit trail. */
  const patch = (id: string, changes: Partial<Escalation>, action: string, detail?: string) =>
    setItems((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              ...changes,
              history: [
                ...e.history,
                audit(changes.triageSource ? "AI triage" : CURRENT_USER, action, detail),
              ],
            }
          : e,
      ),
    );

  const logEscalation = async (input: NewEscalation) => {
    const n = Math.max(1040, ...items.map((e) => Number(e.id.replace(/\D/g, "")) || 0)) + 1;
    const id = `ESC-${n}`;
    setItems((prev) => [
      {
        id,
        ...input,
        status: "triaging",
        severity: null,
        slaHours: null,
        rootCause: null,
        rootCauseTag: null,
        triageSource: null,
        resolvedAt: null,
        owner: null,
        handlingHours: 0,
        handlingGrade: "Analyst",
        feeCredit: 0,
        history: [audit(CURRENT_USER, "Logged", input.category)],
      },
      ...prev,
    ]);
    setOpen(false);

    const res = await triageEscalation({ data: input }).catch(() => ({
      ok: false as const,
      error: "",
    }));
    const applied = res.ok
      ? { ...res, triageSource: "ai" as const }
      : { ...rulesTriage(input.description, input.category), triageSource: "rules" as const };
    patch(
      id,
      {
        status: "open",
        severity: applied.severity,
        slaHours: applied.slaHours,
        rootCause: applied.rootCause,
        rootCauseTag: applied.rootCauseTag,
        triageSource: applied.triageSource,
        handlingHours: DEFAULT_HANDLING[applied.severity].hours,
        handlingGrade: DEFAULT_HANDLING[applied.severity].grade,
      },
      res.ok ? `Triaged as ${applied.severity}` : `Rules triage as ${applied.severity}`,
      `SLA ${applied.slaHours}h · ${applied.rootCauseTag}`,
    );
    if (res.ok)
      toast.success(`${id} triaged as ${applied.severity}`, {
        description: `SLA ${applied.slaHours}h · ${applied.rootCause}`,
      });
    else
      toast.warning(`${id} triaged with fallback rules`, {
        description: "AI triage was unavailable. Please check the severity.",
      });
  };

  const resolve = (id: string) => {
    patch(id, { status: "resolved", resolvedAt: new Date().toISOString() }, "Resolved");
    toast.success(`${id} resolved`);
  };

  const reopen = (id: string) => patch(id, { status: "open", resolvedAt: null }, "Reopened");

  const changeSeverity = (id: string, severity: Severity, reason: string) => {
    const before = items.find((e) => e.id === id)?.severity;
    patch(
      id,
      { severity, slaHours: SLA_POLICY_HOURS[severity] },
      `Severity changed from ${before} to ${severity}`,
      `SLA reset to ${SLA_POLICY_HOURS[severity]}h · reason: ${reason}`,
    );
    toast(`${id} set to ${severity}`, { description: "Change recorded in the audit trail." });
  };

  const assignReview = (
    kind: ReviewAction["kind"],
    subject: string,
    owner: string,
    dueDate: string,
  ) => {
    setReviews((prev) => [
      ...prev.filter((r) => !(r.kind === kind && r.subject === subject)),
      {
        id: `RCR-${prev.length + 101}`,
        kind,
        subject,
        owner,
        dueDate,
        createdAt: new Date().toISOString(),
        createdBy: CURRENT_USER,
        status: "open",
        note: null,
      },
    ]);
    toast.success("Root cause review assigned", {
      description: `${subject} · ${owner} by ${dueDate}`,
    });
  };

  const completeReview = (id: string) =>
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status: "complete" } : r)));

  const exportCsv = (rows: Escalation[], label = "escalations") => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `escalations-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${rows.length} escalations exported`);
  };

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "queue", label: "Live queue", icon: ListChecks },
    { id: "report", label: "Report", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-navy text-navy-foreground print:bg-white print:text-foreground">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20 print:hidden">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Escalation Triage</h1>
              <p className="text-xs text-navy-foreground/70 print:text-muted-foreground">
                Client Operations · SLA monitoring
              </p>
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="print:hidden">
                <Plus className="size-4" /> Log escalation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Log a client escalation</DialogTitle>
                <DialogDescription>Capture the issue as reported by the client.</DialogDescription>
              </DialogHeader>
              <LogEscalationForm onSubmit={logEscalation} />
            </DialogContent>
          </Dialog>
        </div>

        <nav aria-label="Views" className="mx-auto max-w-[96rem] px-6 print:hidden">
          <ul className="flex gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === id
                      ? "bg-background text-foreground"
                      : "text-navy-foreground/75 hover:bg-white/10 hover:text-navy-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[96rem] space-y-5 px-6 py-6">
        {now == null ? (
          <div className="h-96 animate-pulse rounded-lg bg-surface-subtle" aria-label="Loading" />
        ) : tab === "queue" ? (
          <>
            <SummaryStats items={items} now={now} />
            <div className="grid items-start gap-5 xl:grid-cols-[1fr_22rem]">
              <EscalationTable
                items={items}
                now={now}
                onResolve={resolve}
                onReopen={reopen}
                onSeverityChange={changeSeverity}
                onPatch={patch}
                onExport={(rows) => exportCsv(rows, "live-queue")}
              />
              <PatternPanel
                items={items}
                now={now}
                reviews={reviews}
                onAssignReview={assignReview}
                onCompleteReview={completeReview}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              SLA policy: Critical {SLA_POLICY_HOURS.Critical}h · High {SLA_POLICY_HOURS.High}h ·
              Medium {SLA_POLICY_HOURS.Medium}h · Low {SLA_POLICY_HOURS.Low}h. Amber when under 25%
              of the window (or under 1 hour) remains. Demo data is held in the browser and resets
              on refresh.
            </p>
          </>
        ) : (
          <ReportView
            items={items}
            now={now}
            reviews={reviews}
            onAssignReview={assignReview}
            onCompleteReview={completeReview}
            onExport={exportCsv}
          />
        )}
      </main>
    </div>
  );
}
