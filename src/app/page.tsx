import Card from "@/components/Card";

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4">
          🚀 Hackathon Starter
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          A minimal, production-ready template with Next.js, TypeScript, and
          Supabase. Go from zero to shipped in minutes.
        </p>
      </section>

      {/* Feature cards */}
      <section>
        <h2 className="text-2xl font-bold mb-6">What&apos;s included</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card title="Next.js 15" description="App Router, TypeScript, Tailwind CSS — everything you need out of the box." />
          <Card title="Supabase" description="Postgres database and Auth pre-configured. Just add your project URL and keys." />
          <Card title="API Routes" description="Health endpoint and a full CRUD example ready at /api/health and /api/items." />
          <Card title="API Client" description="Typed fetch helper in src/lib/apiClient.ts — no boilerplate needed to call your API." />
          <Card title="Vercel Ready" description="Deploy with zero config. Push to GitHub and connect to Vercel." />
          <Card title="Minimal & Fast" description="No unnecessary abstractions. Read the code, understand it, ship it." />
        </div>
      </section>

      {/* Quick start */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Quick Start</h2>
        <div className="rounded-lg bg-gray-900 text-green-400 p-6 font-mono text-sm space-y-1">
          <p><span className="text-gray-500"># 1. Install deps</span></p>
          <p>npm install</p>
          <p className="mt-2"><span className="text-gray-500"># 2. Set env vars</span></p>
          <p>cp .env.example .env.local</p>
          <p className="mt-2"><span className="text-gray-500"># 3. Start dev server</span></p>
          <p>npm run dev</p>
        </div>
      </section>
    </div>
  );
}
