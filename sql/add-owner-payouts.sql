create table if not exists public.owner_payout_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  owner_role text not null,
  store_id uuid null,
  account_holder_name text not null,
  bank_name text not null,
  account_number_last4 text null,
  account_number_full text null,
  routing_code_last4 text null,
  routing_code_full text null,
  country text null default 'US',
  currency text null default 'USD',
  status text not null default 'pending_verification',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists owner_payout_bank_accounts_owner_role_uidx
  on public.owner_payout_bank_accounts(owner_user_id, owner_role);

create table if not exists public.owner_payout_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  owner_role text not null,
  store_id uuid null,
  bank_account_id uuid null references public.owner_payout_bank_accounts(id) on delete set null,
  amount numeric(12,2) not null default 0,
  note text null,
  status text not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_payout_requests_owner_idx
  on public.owner_payout_requests(owner_user_id, owner_role, created_at desc);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owner_payout_bank_accounts_set_updated_at on public.owner_payout_bank_accounts;
create trigger owner_payout_bank_accounts_set_updated_at
before update on public.owner_payout_bank_accounts
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists owner_payout_requests_set_updated_at on public.owner_payout_requests;
create trigger owner_payout_requests_set_updated_at
before update on public.owner_payout_requests
for each row execute function public.set_updated_at_timestamp();

alter table public.owner_payout_bank_accounts enable row level security;
alter table public.owner_payout_requests enable row level security;

drop policy if exists "Owners can manage their bank account" on public.owner_payout_bank_accounts;
create policy "Owners can manage their bank account"
on public.owner_payout_bank_accounts
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "Owners can manage their payout requests" on public.owner_payout_requests;
create policy "Owners can manage their payout requests"
on public.owner_payout_requests
for all
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());
