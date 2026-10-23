-- Deadbolt schema. Run in the Supabase SQL Editor.
-- All tables have RLS enabled and no policies: only the server (service role key) can read or write.

create table if not exists mandates (
  mandate_id        text primary key,
  version           int  not null,
  parent_mandate_id text references mandates(mandate_id),
  superseded_by     text,
  principal         text not null,
  agent_id          text not null,
  instruction       text not null,
  intent            jsonb not null,
  constraints       jsonb not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

create table if not exists authorizations (
  authorization_id text primary key,
  mandate_id       text not null references mandates(mandate_id),
  agent_id         text not null,
  transaction      jsonb not null,
  provenance       jsonb not null default '[]'::jsonb,
  result           jsonb not null,
  status           text not null check (status in ('AUTHORIZED','PENDING_APPROVAL','APPROVED','DENIED','BLOCKED')),
  approval         jsonb,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create table if not exists capabilities (
  capability_id    text primary key,
  authorization_id text not null references authorizations(authorization_id),
  payload          jsonb not null,
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists payments (
  payment_id       text primary key,
  capability_id    text not null references capabilities(capability_id),
  authorization_id text not null references authorizations(authorization_id),
  paypal_order_id  text,
  status           text not null check (status in ('CREATED','APPROVAL_PENDING','COMPLETED','FAILED')),
  amount           numeric(12,2) not null,
  currency         text not null,
  approve_url      text,
  raw              jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists authorizations_mandate_idx on authorizations(mandate_id);
create index if not exists authorizations_status_idx on authorizations(status);
create index if not exists payments_authorization_idx on payments(authorization_id);

alter table mandates       enable row level security;
alter table authorizations enable row level security;
alter table capabilities   enable row level security;
alter table payments       enable row level security;
