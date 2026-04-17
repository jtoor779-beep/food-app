create table if not exists public.owner_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  expo_push_token text not null,
  device_platform text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists owner_push_tokens_user_token_idx
  on public.owner_push_tokens (user_id, expo_push_token);

create index if not exists owner_push_tokens_user_id_idx
  on public.owner_push_tokens (user_id);

alter table public.owner_push_tokens enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_push_tokens'
      and policyname = 'owner push tokens select own'
  ) then
    create policy "owner push tokens select own"
      on public.owner_push_tokens
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_push_tokens'
      and policyname = 'owner push tokens insert own'
  ) then
    create policy "owner push tokens insert own"
      on public.owner_push_tokens
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'owner_push_tokens'
      and policyname = 'owner push tokens update own'
  ) then
    create policy "owner push tokens update own"
      on public.owner_push_tokens
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.touch_owner_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_owner_push_tokens_updated_at on public.owner_push_tokens;

create trigger trg_owner_push_tokens_updated_at
before update on public.owner_push_tokens
for each row
execute function public.touch_owner_push_tokens_updated_at();
