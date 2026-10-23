begin;
-- Apply after schema.sql. Single-purchase tasks include every mandate revision.
-- Invoker rights + explicit grants: never callable by browser/anonymous roles.
create unique index if not exists capabilities_authorization_unique on public.capabilities(authorization_id);
create unique index if not exists payments_capability_unique on public.payments(capability_id);
alter table public.payments add column if not exists task_id text references public.mandates(mandate_id);
-- Backfill existing reservations; duplicates intentionally make this script fail
-- rather than silently restoring spending authority for an already-used task.
with recursive ancestry as (
  select mandate_id, mandate_id as root_id from public.mandates where parent_mandate_id is null
  union all select m.mandate_id, a.root_id from public.mandates m join ancestry a on m.parent_mandate_id=a.mandate_id
)
update public.payments p set task_id=x.root_id from public.authorizations a join ancestry x on x.mandate_id=a.mandate_id
where p.authorization_id=a.authorization_id and p.task_id is null;
alter table public.payments alter column task_id set not null;
create unique index if not exists payments_task_unique on public.payments(task_id);

create or replace function public.deadbolt_transition(operation text, data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  m public.mandates;
  a public.authorizations;
  c public.capabilities;
  p public.payments;
  root_id text;
  mandate_key text := data->>'mandate_id';
  cap jsonb := data->'capability';
  new_m public.mandates;
begin
  if operation in ('approve', 'reserve', 'capture') then
    select * into a from public.authorizations where authorization_id = data->>'authorization_id';
    if not found then raise exception 'Authorization not found'; end if;
    mandate_key := a.mandate_id;
  end if;
  -- Ancestors are immutable. All transitions for one task lock its root first.
  with recursive ancestors as (
    select mandate_id, parent_mandate_id from public.mandates where mandate_id = mandate_key
    union all
    select parent.mandate_id, parent.parent_mandate_id from public.mandates parent join ancestors x on parent.mandate_id=x.parent_mandate_id
  ) select mandate_id into root_id from ancestors where parent_mandate_id is null;
  if root_id is null then raise exception 'Mandate not found'; end if;
  perform 1 from public.mandates where mandate_id=root_id for update;
  select * into m from public.mandates where mandate_id=mandate_key for update;
  if m.superseded_by is not null or m.expires_at <= clock_timestamp() then
    raise exception 'Mandate expired or superseded';
  end if;

  if operation = 'revise' then
    if exists(select 1 from public.payments where task_id=root_id) then
      raise exception 'Task already reserved for payment; revision cannot reopen it';
    end if;
    new_m := jsonb_populate_record(null::public.mandates, data->'mandate');
    if new_m.parent_mandate_id is distinct from m.mandate_id or new_m.version <> m.version+1
      or new_m.agent_id is distinct from m.agent_id or new_m.principal is distinct from m.principal
      or new_m.superseded_by is not null or new_m.expires_at <= clock_timestamp() then
      raise exception 'Invalid revision';
    end if;
    insert into public.mandates select new_m.*;
    update public.mandates set superseded_by=new_m.mandate_id where mandate_id=m.mandate_id;
    return to_jsonb(new_m);
  elsif operation = 'authorize' then
    a := jsonb_populate_record(null::public.authorizations, data->'authorization');
    if a.mandate_id is distinct from m.mandate_id or a.agent_id is distinct from m.agent_id then
      raise exception 'Authorization scope mismatch';
    end if;
    if exists(select 1 from public.payments where task_id=root_id) then raise exception 'Task already reserved'; end if;
    if a.status not in ('AUTHORIZED', 'PENDING_APPROVAL', 'BLOCKED') then raise exception 'Invalid initial authorization status'; end if;
    insert into public.authorizations select a.*;
  elsif operation = 'approve' then
    select * into a from public.authorizations where authorization_id=a.authorization_id for update;
    if a.status <> 'PENDING_APPROVAL' then raise exception 'Authorization already resolved'; end if;
    if data->>'status' not in ('APPROVED','DENIED') then raise exception 'Invalid approval'; end if;
    if exists(select 1 from public.payments where task_id=root_id) then raise exception 'Task already reserved'; end if;
    update public.authorizations set status=data->>'status', approval=data->'approval', resolved_at=clock_timestamp()
      where authorization_id=a.authorization_id returning * into a;
  elsif operation in ('reserve','capture') then
    if a.agent_id is distinct from m.agent_id or a.status not in ('AUTHORIZED','APPROVED') then
      raise exception 'Authorization is not executable';
    end if;
    select * into c from public.capabilities where capability_id=data->>'capability_id' for update;
    if not found or c.authorization_id is distinct from a.authorization_id then raise exception 'Capability not found'; end if;
    if operation = 'reserve' then
      if c.expires_at <= clock_timestamp() then raise exception 'Capability expired'; end if;
      select * into p from public.payments where capability_id=c.capability_id;
      if found then return to_jsonb(p); end if; -- durable idempotent retry, same order id
      if c.consumed_at is not null then raise exception 'Capability consumed'; end if;
      if exists(select 1 from public.payments where task_id=root_id) then raise exception 'Task already reserved'; end if;
      if data->>'agent_id' is distinct from m.agent_id then raise exception 'Agent mismatch'; end if;
      insert into public.payments(payment_id,capability_id,authorization_id,status,amount,currency,task_id)
      values(data->>'payment_id',c.capability_id,a.authorization_id,'CREATED',
        (a.transaction->>'amount')::numeric,upper(a.transaction->>'currency'),root_id) returning * into p;
      update public.capabilities set consumed_at=clock_timestamp() where capability_id=c.capability_id;
    else
      select * into p from public.payments where payment_id=data->>'payment_id' and capability_id=c.capability_id;
      if not found or p.task_id is distinct from root_id then raise exception 'Payment not found'; end if;
      if p.status not in ('APPROVAL_PENDING','COMPLETED') then raise exception 'Payment cannot be captured'; end if;
    end if;
    return to_jsonb(p);
  else
    raise exception 'Unknown transition';
  end if;

  -- Capability issuance and authorization state commit or roll back together.
  if a.status in ('AUTHORIZED','APPROVED') then
    if cap is null or cap->>'authorization_id' is distinct from a.authorization_id
      or cap->>'mandate_id' is distinct from m.mandate_id or cap->>'agent_id' is distinct from m.agent_id
      or (cap->>'expires_at')::timestamptz > m.expires_at
      or not ((cap->>'expires_at')::timestamptz > clock_timestamp()) then
      raise exception 'Invalid capability scope or expiry';
    end if;
    insert into public.capabilities(capability_id,authorization_id,payload,expires_at)
      values(cap->>'capability_id',a.authorization_id,cap,(cap->>'expires_at')::timestamptz);
  elsif cap is not null and cap <> 'null'::jsonb then
    raise exception 'Capability cannot be issued for this decision';
  end if;
  return to_jsonb(a);
end;
$$;
revoke all on function public.deadbolt_transition(text,jsonb) from public, anon, authenticated;
grant execute on function public.deadbolt_transition(text,jsonb) to service_role;

grant select, insert, update on public.mandates, public.authorizations, public.capabilities, public.payments to service_role;
commit;
