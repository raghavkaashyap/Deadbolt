/**
 * Supabase client setup.
 *
 * Usage:
 *   import { getSupabaseClient } from "@/lib/supabase";
 *   const { data, error } = await getSupabaseClient().from("items").select("*");
 *
 * For server-side admin operations (bypasses Row Level Security),
 * use createAdminClient() with your service role key.
 *
 * To generate full type safety from your Supabase schema, run:
 *   npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
 * Then replace `Database` below with the generated type.
 */
import { createClient } from "@supabase/supabase-js";

// Minimal hand-written schema for the example "items" table.
// Replace with generated types from `supabase gen types typescript` for full safety.
export type Database = {
  public: {
    Tables: {
      items: {
        Row: { id: number; name: string; created_at: string };
        Insert: { name: string; id?: number; created_at?: string | null };
        Update: { name?: string; id?: number; created_at?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

// Browser / client-side Supabase client (lazily created so this module can
// be imported at build time even when env vars are not yet populated).
let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }
    _client = createClient<Database>(url, key);
  }
  return _client;
}

/**
 * Server-side admin client — only use in API routes / Server Actions.
 * Requires SUPABASE_SERVICE_ROLE_KEY environment variable.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
