-- Junta Directiva AI: identidad, límites, compras e historial.
-- Aplicar con Supabase CLI o desde el SQL Editor del proyecto dedicado a esta app.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  marketing_consent boolean not null default false,
  report_credits integer not null default 0 check (report_credits >= 0),
  extra_analysis_credits integer not null default 0 check (extra_analysis_credits >= 0),
  premium_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_usage (
  usage_date date not null default (timezone('utc', now()))::date,
  scope_type text not null check (scope_type in ('user', 'ip', 'device')),
  scope_key text not null,
  used integer not null default 0 check (used >= 0),
  primary key (usage_date, scope_type, scope_key)
);

create table if not exists public.purchases (
  stripe_session_id text primary key,
  stripe_event_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null check (product in ('single', 'bundle', 'extra')),
  credits_granted integer not null check (credits_granted > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.report_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'refunded')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  refunded_at timestamptz
);

create index if not exists report_reservations_user_created_idx
  on public.report_reservations (user_id, created_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid unique references public.report_reservations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  situation text not null,
  verdict text,
  report_text text not null,
  quick_takes jsonb not null default '[]'::jsonb,
  language text not null default 'es' check (language in ('es', 'en')),
  created_at timestamptz not null default now()
);

create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.daily_usage enable row level security;
alter table public.purchases enable row level security;
alter table public.report_reservations enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own purchases" on public.purchases;
create policy "Users read own purchases" on public.purchases
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own reports" on public.reports;
create policy "Users read own reports" on public.reports
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, marketing_consent)
  values (new.id, coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.claim_analysis(
  p_user_id uuid,
  p_ip_hash text,
  p_device_hash text
)
returns table (
  allowed boolean,
  tier text,
  code text,
  free_remaining integer,
  extra_remaining integer
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_day date := (timezone('utc', now()))::date;
  v_user_used integer;
  v_ip_used integer;
  v_device_used integer;
  v_extra integer;
begin
  insert into public.profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform 1 from public.profiles where user_id = p_user_id for update;

  insert into public.daily_usage (usage_date, scope_type, scope_key, used)
  values
    (v_day, 'user', p_user_id::text, 0),
    (v_day, 'ip', p_ip_hash, 0),
    (v_day, 'device', p_device_hash, 0)
  on conflict do nothing;

  select used into v_user_used from public.daily_usage
    where usage_date = v_day and scope_type = 'user' and scope_key = p_user_id::text for update;
  select used into v_ip_used from public.daily_usage
    where usage_date = v_day and scope_type = 'ip' and scope_key = p_ip_hash for update;
  select used into v_device_used from public.daily_usage
    where usage_date = v_day and scope_type = 'device' and scope_key = p_device_hash for update;
  select extra_analysis_credits into v_extra from public.profiles where user_id = p_user_id;

  if v_user_used < 2 and v_ip_used < 4 and v_device_used < 4 then
    update public.daily_usage set used = used + 1
      where usage_date = v_day and (
        (scope_type = 'user' and scope_key = p_user_id::text) or
        (scope_type = 'ip' and scope_key = p_ip_hash) or
        (scope_type = 'device' and scope_key = p_device_hash)
      );
    return query select true, 'free'::text, null::text, 1 - v_user_used, v_extra;
    return;
  end if;

  if v_extra > 0 then
    update public.profiles
      set extra_analysis_credits = extra_analysis_credits - 1, updated_at = now()
      where user_id = p_user_id;
    return query select true, 'extra'::text, null::text, greatest(0, 2 - v_user_used), v_extra - 1;
    return;
  end if;

  return query select false, null::text,
    case
      when v_user_used >= 2 then 'NO_FREE_ANALYSES'
      when v_ip_used >= 4 then 'IP_DAILY_LIMIT'
      else 'DEVICE_DAILY_LIMIT'
    end,
    greatest(0, 2 - v_user_used), v_extra;
end;
$$;

create or replace function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists(select 1 from auth.users where lower(email) = lower(trim(p_email)));
$$;

create or replace function public.grant_stripe_purchase(
  p_user_id uuid,
  p_session_id text,
  p_event_id text,
  p_product text
)
returns table (
  granted boolean,
  report_credits integer,
  extra_analysis_credits integer,
  premium_access boolean
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_credits integer := case when p_product = 'bundle' then 3 else case when p_product = 'single' then 1 else 3 end end;
  v_inserted text;
begin
  if p_product not in ('single', 'bundle', 'extra') then
    raise exception 'INVALID_PRODUCT';
  end if;

  insert into public.profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  insert into public.purchases (stripe_session_id, stripe_event_id, user_id, product, credits_granted)
  values (p_session_id, nullif(p_event_id, ''), p_user_id, p_product, v_credits)
  on conflict do nothing
  returning stripe_session_id into v_inserted;

  if v_inserted is not null then
    if p_product = 'extra' then
      update public.profiles set
        extra_analysis_credits = extra_analysis_credits + v_credits,
        updated_at = now()
      where user_id = p_user_id;
    else
      update public.profiles set
        report_credits = report_credits + v_credits,
        premium_access = true,
        updated_at = now()
      where user_id = p_user_id;
    end if;
  end if;

  return query
    select (v_inserted is not null), p.report_credits, p.extra_analysis_credits, p.premium_access
    from public.profiles p where p.user_id = p_user_id;
end;
$$;

create or replace function public.refund_stale_report_reservations(p_user_id uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  with refunded as (
    update public.report_reservations
      set status = 'refunded', refunded_at = now()
      where user_id = p_user_id and status = 'reserved' and created_at < now() - interval '30 minutes'
      returning 1
  ) select count(*) into v_count from refunded;

  if v_count > 0 then
    update public.profiles
      set report_credits = report_credits + v_count, updated_at = now()
      where user_id = p_user_id;
  end if;
  return v_count;
end;
$$;

create or replace function public.reserve_report_credit(p_user_id uuid)
returns table (allowed boolean, code text, reservation_id uuid, credits_remaining integer)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_credits integer;
  v_reservation uuid;
begin
  perform public.refund_stale_report_reservations(p_user_id);
  insert into public.profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select report_credits into v_credits from public.profiles where user_id = p_user_id for update;
  if v_credits < 1 then
    return query select false, 'NO_REPORT_CREDITS'::text, null::uuid, v_credits;
    return;
  end if;

  update public.profiles set report_credits = report_credits - 1, updated_at = now()
    where user_id = p_user_id;
  insert into public.report_reservations (user_id) values (p_user_id) returning id into v_reservation;
  return query select true, null::text, v_reservation, v_credits - 1;
end;
$$;

create or replace function public.finalize_report_reservation(p_user_id uuid, p_reservation_id uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_updated uuid;
begin
  update public.report_reservations
    set status = 'completed', completed_at = now()
    where id = p_reservation_id and user_id = p_user_id and status = 'reserved'
    returning id into v_updated;
  return v_updated is not null;
end;
$$;

create or replace function public.refund_report_reservation(p_user_id uuid, p_reservation_id uuid)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_updated uuid;
begin
  update public.report_reservations
    set status = 'refunded', refunded_at = now()
    where id = p_reservation_id and user_id = p_user_id and status = 'reserved'
    returning id into v_updated;
  if v_updated is not null then
    update public.profiles set report_credits = report_credits + 1, updated_at = now()
      where user_id = p_user_id;
  end if;
  return v_updated is not null;
end;
$$;

revoke all on function public.claim_analysis(uuid, text, text) from public, anon, authenticated;
revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
revoke all on function public.grant_stripe_purchase(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.refund_stale_report_reservations(uuid) from public, anon, authenticated;
revoke all on function public.reserve_report_credit(uuid) from public, anon, authenticated;
revoke all on function public.finalize_report_reservation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refund_report_reservation(uuid, uuid) from public, anon, authenticated;

grant execute on function public.claim_analysis(uuid, text, text) to service_role;
grant execute on function public.auth_email_exists(text) to service_role;
grant execute on function public.grant_stripe_purchase(uuid, text, text, text) to service_role;
grant execute on function public.refund_stale_report_reservations(uuid) to service_role;
grant execute on function public.reserve_report_credit(uuid) to service_role;
grant execute on function public.finalize_report_reservation(uuid, uuid) to service_role;
grant execute on function public.refund_report_reservation(uuid, uuid) to service_role;
