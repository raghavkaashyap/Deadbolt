# 🚀 Hackathon Starter Template

A minimal, production-ready Next.js + Supabase starter kit.

## What's Included

- **Next.js 15** — App Router, TypeScript, Tailwind CSS
- **Supabase** — Postgres database + Auth, pre-configured browser & server clients
- **API Routes** — Health check (`/api/health`) and full CRUD example (`/api/items`)
- **Typed API Client** — `src/lib/apiClient.ts` with `get`, `post`, `put`, `del` helpers
- **Reusable Components** — `Card` component to get you started
- **Vercel Ready** — Zero-config deployment

---

## Prerequisites

- Node.js 18+
- npm
- [Supabase account](https://supabase.com)

---

## Setup

```bash
# 1. Clone or download
git clone https://github.com/your-org/hackathon-template.git
cd hackathon-template

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Then open .env.local and fill in your Supabase keys (see below)

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your app.

---

## Connecting Supabase

1. Go to [app.supabase.com](https://app.supabase.com) → your project → **Project Settings → API**
2. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. *(Optional)* Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (for server-side admin ops)

### Create the `items` table (for the example API)

Run this in the Supabase **SQL Editor**:

```sql
create table items (
  id         bigint generated always as identity primary key,
  name       text not null,
  created_at timestamptz default now()
);
alter table items enable row level security;
create policy "Allow all" on items for all using (true);
```

---

## Project Structure

```
├── .env.example              # Environment variable template
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # Tailwind CSS configuration
├── postcss.config.mjs        # PostCSS configuration
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/route.ts   # GET /api/health
│   │   │   └── items/route.ts    # GET + POST /api/items (Supabase CRUD)
│   │   ├── globals.css           # Global styles + Tailwind directives
│   │   ├── layout.tsx            # Root layout with header/footer
│   │   └── page.tsx              # Homepage
│   ├── components/
│   │   └── Card.tsx              # Reusable card component
│   └── lib/
│       ├── supabase.ts           # Supabase browser + admin clients
│       └── apiClient.ts          # Typed fetch helpers (get/post/put/del)
```

---

## API Endpoints

| Method | Endpoint       | Description                        |
|--------|----------------|------------------------------------|
| GET    | `/api/health`  | Health check — returns `{ status: "ok", timestamp }` |
| GET    | `/api/items`   | List all items from Supabase       |
| POST   | `/api/items`   | Create a new item `{ name: string }` |

### Example usage with the API client

```ts
import { get, post } from "@/lib/apiClient";

const items = await get<Item[]>("/api/items");
const newItem = await post<Item>("/api/items", { name: "My item" });
```

---

## Deploying to Vercel

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. Add your environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) in the Vercel project settings
4. Click **Deploy** — done!

Your app will be live at `https://your-project.vercel.app`.

---

## Adding Supabase Auth

Supabase Auth is already available through the configured client. To add authentication:

1. Enable your desired auth providers in Supabase Dashboard → **Authentication → Providers**
2. Use `supabase.auth.signInWithOAuth(...)`, `supabase.auth.signInWithPassword(...)`, etc.
3. See the [Supabase Auth docs](https://supabase.com/docs/guides/auth) for full details

---

## Key Scripts

| Command         | Description                        |
|-----------------|------------------------------------|
| `npm run dev`   | Start development server on :3000  |
| `npm run build` | Build for production               |
| `npm run start` | Start production server            |
| `npm run lint`  | Run ESLint                         |
