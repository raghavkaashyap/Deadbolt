"use client";

import { useState } from "react";
import type { AgentRun, ScenarioId } from "@/lib/deadbolt/agent/simulator";
import type { Decision, Mandate } from "@/lib/deadbolt/types";

type Scenario = { id: ScenarioId; title: string; description: string };
type Simulation = AgentRun & { mandate: Mandate };
const labels: Record<Decision, string> = { AUTHORIZED: "Authorized", REQUIRES_APPROVAL: "Needs review", BLOCKED: "Blocked" };
const colors: Record<Decision, string> = {
  AUTHORIZED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  REQUIRES_APPROVAL: "border-amber-200 bg-amber-50 text-amber-900",
  BLOCKED: "border-rose-200 bg-rose-50 text-rose-800",
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function ScenarioExplorer({ scenarios }: { scenarios: Scenario[] }) {
  const [scenario, setScenario] = useState<ScenarioId>("prompt_injection");
  const [strict, setStrict] = useState(false);
  const [run, setRun] = useState<Simulation | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const option = scenarios.find((s) => s.id === scenario)!;
  const attempt = run?.attempts[selected];

  async function simulate() {
    setBusy(true);
    setError("");
    setRun(null);
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, block_on_untrusted_influence: strict }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Simulation could not run. Please try again.");
      const result: Simulation = await response.json();
      setRun(result);
      setSelected(0);
    } catch {
      setError("Simulation could not run. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-8 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Agent authorization lab</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">Intent becomes a boundary.</h1>
          <p className="mt-4 text-base leading-7 text-slate-600">Follow a shopping agent from the user&apos;s request to checkout. See what Deadbolt allows, what it questions, and what it stops.</p>
        </div>
        <span className="self-start rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-semibold text-teal-800 md:self-auto">Offline simulation · No money moves</span>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">01 / Set the scene</p>
          <label htmlFor="scenario" className="mb-2 mt-6 block text-sm font-semibold">Scenario</label>
          <select id="scenario" value={scenario} disabled={busy} onChange={(event) => { setScenario(event.target.value as ScenarioId); setRun(null); setError(""); }} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600">
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <p className="mt-4 text-sm leading-6 text-slate-600">{option.description}</p>
          <label className="mt-6 flex cursor-pointer items-start gap-3 border-t border-slate-100 pt-5 text-sm">
            <input type="checkbox" checked={strict} disabled={busy} onChange={(event) => { setStrict(event.target.checked); setRun(null); }} className="mt-1 h-4 w-4 accent-teal-700" />
            <span><span className="block font-semibold">Block untrusted field changes</span><span className="mt-1 block text-xs leading-5 text-slate-500">Escalation becomes a hard block when untrusted content touches a protected field.</span></span>
          </label>
          <button type="button" disabled={busy} onClick={simulate} className="mt-6 w-full rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50">{busy ? "Evaluating…" : "Run scenario"}</button>
          {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
          <p className="mt-5 text-xs leading-5 text-slate-500">Uses a scripted agent and a keyword heuristic for intent. The authenticated API uses a separate semantic check and requires operator review of client-reported provenance.</p>
        </aside>

        <section aria-label="Simulation results" aria-busy={busy} className="min-w-0 space-y-5">
          <p className="sr-only" role="status">{busy ? "Running simulation" : run ? `Simulation complete: ${run.attempts.length} attempts` : "Choose a scenario and run it"}</p>
          {!run ? (
            <div className="flex min-h-80 flex-col justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10">
              <span className="mb-5 font-mono text-sm text-teal-700">REQUEST → EVALUATE → DECIDE</span>
              <h2 className="text-2xl font-semibold tracking-tight">Every checkout has a story.</h2>
              <p className="mt-3 max-w-lg leading-7 text-slate-500">Run a scenario to compare the mandate with each proposed purchase, inspect the checks, and trace the content that influenced the agent.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-slate-950 p-6 text-white">
                <p className="text-xs font-bold uppercase tracking-widest text-teal-300">The user&apos;s mandate</p>
                <h2 className="mt-3 text-xl font-medium">&ldquo;{run.mandate.instruction}&rdquo;</h2>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
                  <span>Limit <strong className="text-white">{money(run.mandate.constraints.max_amount)}</strong></span>
                  <span>Quantity <strong className="text-white">{run.mandate.intent.quantity}</strong></span>
                  <span>{run.mandate.constraints.recurring ? "Recurring permitted" : "One-time purchase"}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3" aria-label="Run summary">
                {[ ["Attempts", run.attempts.length], ["Blocked", run.attempts.filter((a) => a.result.decision === "BLOCKED").length], ["For review", run.attempts.filter((a) => a.result.decision === "REQUIRES_APPROVAL").length] ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">02 / Purchase attempts</h2><p className="text-xs text-slate-500">{run.outcome === "authorized" ? "A qualifying purchase was authorized in simulation" : run.outcome === "awaiting_approval" ? "Agent paused for review" : "No purchase authorized"}</p></div>
                <div className="space-y-2">
                  {run.attempts.map((a, index) => (
                    <button key={index} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)} className={`flex w-full flex-col items-start gap-3 rounded-xl border p-4 text-left sm:flex-row sm:items-center sm:justify-between ${selected === index ? "border-teal-600 bg-teal-50/40 ring-1 ring-teal-600" : "border-slate-200 hover:bg-slate-50"}`}>
                      <span><span className="text-xs text-slate-500">Attempt {index + 1} · {money(a.transaction.amount)}</span><span className="mt-1 block text-sm font-semibold">{a.transaction.product}</span><span className="mt-1 block text-xs text-slate-500">{a.transaction.merchant}</span></span>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${colors[a.result.decision]}`}>{labels[a.result.decision]}</span>
                    </button>
                  ))}
                </div>
              </div>
              {attempt && <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4"><h2 className="font-semibold">03 / Why this decision?</h2><span className="font-mono text-xs text-slate-500">Risk {Math.round(attempt.result.risk_score * 100)} / 100</span></div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600">{attempt.result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
                  <details className="mt-5 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-sm font-semibold text-teal-800">Policy checks ({attempt.result.checks.length})</summary>
                    <ul className="mt-4 divide-y divide-slate-100">{attempt.result.checks.map((check) => <li key={check.name} className="py-3 text-sm"><span className={`mr-2 font-semibold ${check.passed ? "text-emerald-700" : "text-rose-700"}`}>{check.passed ? "Passed" : check.severity === "block" ? "Blocked" : "Review"}</span><span className="font-mono text-xs text-slate-600">{check.name}</span><p className="mt-1 text-slate-500">{check.detail}</p></li>)}</ul>
                  </details>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                  <h2 className="font-semibold">04 / Execution provenance</h2>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Synthetic trace for the selected attempt. Trust labels describe the scenario, not independently verified evidence.</p>
                  <ol className="mt-6 space-y-3">{attempt.provenance.map((event) => (
                    <li key={event.step} className={`rounded-xl border p-4 ${event.trust === "untrusted" ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold"><span className="mr-3 font-mono text-xs text-slate-400">{String(event.step).padStart(2, "0")}</span>{event.tool}</span><span className="text-xs text-slate-500">{event.trust.replaceAll("_", " ")}</span></div>
                      <p className="mt-2 break-words font-mono text-xs text-slate-500">{event.source}</p>
                      {(event.input || event.output || event.changed_fields) && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-teal-800">Inspect event</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-600">{[event.input, event.output, event.changed_fields && JSON.stringify(event.changed_fields, null, 2)].filter(Boolean).join("\n\n")}</pre></details>}
                    </li>
                  ))}</ol>
                </div>
              </>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
