-- Safe RLS patch for the exact screenshot tables we agreed are safe to lock now:
-- - home_featured_items
-- - coupons
-- - coupons_ui
-- - driver_push_tokens
--
-- Intentionally NOT included here:
-- - restaurants
-- - restaurants_public
-- - menu_items_public
-- - coupon_redemptions
-- - delivery_latest_location
--
-- Reason:
-- those need separate, more careful handling because they are either:
-- - used broadly by public/customer/owner flows, or
-- - views, or
-- - tied to live order/location logic.

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(
    coalesce(
      (
        select p.role
        from public.profiles p
        where p.user_id = auth.uid()
        limit 1
      ),
      ''
    )
  );
$$;

create or replace function public.is_admin_like()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'sub_admin');
$$;

grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.is_admin_like() to anon, authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'home_featured_items'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.home_featured_items enable row level security';

    execute 'drop policy if exists home_featured_items_public_read on public.home_featured_items';
    execute 'drop policy if exists home_featured_items_admin_manage on public.home_featured_items';

    execute $policy$
      create policy home_featured_items_public_read
      on public.home_featured_items
      for select
      to anon, authenticated
      using (true)
    $policy$;

    execute $policy$
      create policy home_featured_items_admin_manage
      on public.home_featured_items
      for all
      to authenticated
      using (public.is_admin_like())
      with check (public.is_admin_like())
    $policy$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'coupons'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.coupons enable row level security';

    execute 'drop policy if exists coupons_public_read on public.coupons';
    execute 'drop policy if exists coupons_admin_manage on public.coupons';

    execute $policy$
      create policy coupons_public_read
      on public.coupons
      for select
      to anon, authenticated
      using (true)
    $policy$;

    execute $policy$
      create policy coupons_admin_manage
      on public.coupons
      for all
      to authenticated
      using (public.is_admin_like())
      with check (public.is_admin_like())
    $policy$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'coupons_ui'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.coupons_ui enable row level security';

    execute 'drop policy if exists coupons_ui_admin_manage on public.coupons_ui';

    execute $policy$
      create policy coupons_ui_admin_manage
      on public.coupons_ui
      for all
      to authenticated
      using (public.is_admin_like())
      with check (public.is_admin_like())
    $policy$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'driver_push_tokens'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.driver_push_tokens enable row level security';

    execute 'drop policy if exists driver_push_tokens_own_manage on public.driver_push_tokens';

    execute $policy$
      create policy driver_push_tokens_own_manage
      on public.driver_push_tokens
      for all
      to authenticated
      using (
        auth.uid() = user_id
        or public.is_admin_like()
      )
      with check (
        auth.uid() = user_id
        or public.is_admin_like()
      )
    $policy$;
  end if;
end $$;
