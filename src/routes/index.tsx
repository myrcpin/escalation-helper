import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
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
import { SummaryStats } from "@/components/SummaryStats";
import { triageEscalation } from "@/lib/ai-triage";
import {
  seedEscalations,
  SLA_POLICY_HOURS,
  rulesTriage,
  type Escalation,
  type Severity,
} from "@/lib/escalations";

const TITLE = "Escalation Triage · Client Operations";
const DESCRIPTION =
  "Log client escalations, triage them by severity with AI, track SLA deadlines and spot recurring issues.";

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

function Index() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [open, setOpen] = useState(false);
  // Time-dependent UI renders only in the browser (avoids server/client clock mismatch).
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Rebuild seed timestamps relative to the browser's clock.
    setItems(seedEscalations());
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const patch = (id: string, changes: Partial<Escalation>) =>
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));

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
        triageSource: null,
        resolvedAt: null,
        owner: null,
      },
      ...prev,
    ]);
    setOpen(false);

    const res = await triageEscalation({ data: input }).catch(() => ({
      ok: false as const,
      error: "",
    }));
    if (res.ok) {
      patch(id, {
        status: "open",
        severity: res.severity,
        slaHours: res.slaHours,
        rootCause: res.rootCause,
        triageSource: "ai",
      });
      toast.success(`${id} triaged as ${res.severity}`, {
        description: `SLA ${res.slaHours}h · ${res.rootCause}`,
      });
    } else {
      const r = rulesTriage(input.description, input.category);
      patch(id, { status: "open", ...r, triageSource: "rules" });
      toast.warning(`${id} triaged with fallback rules`, {
        description: "AI triage was unavailable. Please check the severity.",
      });
    }
  };

  const resolve = (id: string) => {
    patch(id, { status: "resolved", resolvedAt: new Date().toISOString() });
    toast.success(`${id} resolved`);
  };
  const reopen = (id: string) => patch(id, { status: "open", resolvedAt: null });
  const changeSeverity = (id: string, severity: Severity) => {
    patch(id, { severity, slaHours: SLA_POLICY_HOURS[severity] });
    toast(`${id} set to ${severity}`, {
      description: `SLA reset to ${SLA_POLICY_HOURS[severity]}h policy.`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Escalation Triage</h1>
              <p className="text-xs text-navy-foreground/70">Client Operations · SLA monitoring</p>
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">
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
      </header>

      <main className="mx-auto max-w-[96rem] space-y-5 px-6 py-6">
        {now == null ? (
          <div className="h-96 animate-pulse rounded-lg bg-surface-subtle" aria-label="Loading" />
        ) : (
          <>
            <SummaryStats items={items} now={now} />
            <div className="grid items-start gap-5 xl:grid-cols-[1fr_22rem]">
              <EscalationTable
                items={items}
                now={now}
                onResolve={resolve}
                onReopen={reopen}
                onSeverityChange={changeSeverity}
              />
              <PatternPanel items={items} now={now} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              SLA policy: Critical {SLA_POLICY_HOURS.Critical}h · High {SLA_POLICY_HOURS.High}h ·
              Medium {SLA_POLICY_HOURS.Medium}h · Low {SLA_POLICY_HOURS.Low}h. Amber when under 25%
              of the window (or under 1 hour) remains. Demo data is held in the browser and resets
              on refresh.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
