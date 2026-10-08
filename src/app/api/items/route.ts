/**
 * /api/items — Example CRUD route using Supabase.
 *
 * GET  /api/items        → list all items
 * POST /api/items        → create a new item  { name: string }
 *
 * Supabase table schema (run in SQL editor):
 *   create table items (
 *     id   bigint generated always as identity primary key,
 *     name text not null,
 *     created_at timestamptz default now()
 *   );
 *   alter table items enable row level security;
 *   create policy "Allow all" on items for all using (true);
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/items — fetch all items
export async function GET() {
  const { data, error } = await getSupabaseClient()
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/items — create a new item
export async function POST(request: NextRequest) {
  const body = await request.json() as { name?: string };

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseClient()
    .from("items")
    .insert({ name: body.name })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
