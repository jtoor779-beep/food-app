alter table public.owner_payout_requests
  add column if not exists item_subtotal_amount numeric(12,2) not null default 0,
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists settlement_total_amount numeric(12,2) not null default 0,
  add column if not exists order_count integer not null default 0,
  add column if not exists order_ids text[] not null default '{}',
  add column if not exists batch_orders jsonb not null default '[]'::jsonb,
  add column if not exists settlement_snapshot jsonb not null default '{}'::jsonb;
