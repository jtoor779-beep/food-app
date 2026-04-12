alter table public.restaurants
  add column if not exists opens_at_time text,
  add column if not exists closes_at_time text,
  add column if not exists timezone text,
  add column if not exists manual_next_open_at timestamptz;

alter table public.grocery_stores
  add column if not exists opens_at_time text,
  add column if not exists closes_at_time text,
  add column if not exists timezone text,
  add column if not exists manual_next_open_at timestamptz;

comment on column public.restaurants.opens_at_time is 'Daily opening time in HH:MM format.';
comment on column public.restaurants.closes_at_time is 'Daily closing time in HH:MM format.';
comment on column public.restaurants.timezone is 'IANA timezone used for open/close messaging.';
comment on column public.restaurants.manual_next_open_at is 'Optional temporary reopen timestamp after a manual close.';

comment on column public.grocery_stores.opens_at_time is 'Daily opening time in HH:MM format.';
comment on column public.grocery_stores.closes_at_time is 'Daily closing time in HH:MM format.';
comment on column public.grocery_stores.timezone is 'IANA timezone used for open/close messaging.';
comment on column public.grocery_stores.manual_next_open_at is 'Optional temporary reopen timestamp after a manual close.';
