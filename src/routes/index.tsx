import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Escalation Triage" },
      {
        name: "description",
        content:
          "Escalation Triage — a focused workspace for triaging and resolving escalations.",
      },
      { property: "og:title", content: "Escalation Triage" },
      {
        property: "og:description",
        content:
          "A focused workspace for triaging and resolving escalations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-svh flex-col">
      <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Ready to build
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Escalation Triage
        </h1>
        <p className="mt-4 max-w-md text-balance text-sm text-muted-foreground sm:text-base">
          A focused workspace for triaging and resolving escalations. This is a
          starting shell — add your queue, priorities, and workflows next.
        </p>
      </section>
    </main>
  );
}
