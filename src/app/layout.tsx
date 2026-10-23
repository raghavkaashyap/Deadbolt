import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deadbolt | Agent authorization lab",
  description: "Inspect how mandates, policy checks and provenance control a simulated shopping agent before checkout.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white px-6 py-5">
          <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <a href="/" className="text-xl font-extrabold tracking-tight">deadbolt<span className="text-teal-600">.</span></a>
            <a href="https://github.com/raghavkaashyap/Deadbolt" target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-500 hover:text-teal-800">Source & documentation ↗</a>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6">{children}</main>
        <footer className="mt-10 border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-500">Agents act. Deadbolt authorizes. · Simulated catalog, synthetic traces, no payment execution.</footer>
      </body>
    </html>
  );
}
