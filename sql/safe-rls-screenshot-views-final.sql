-- Final careful RLS patch for the last remaining screenshot items:
-- - restaurants_public
-- - menu_items_public
-- - delivery_latest_location
--
-- Safe approach:
-- 1. Protect the base tables the views depend on.
-- 2. Switch the views to security_invoker so they respect caller permissions.
--
-- This file also adds RLS to:
-- - menu_items
-- - delivery_events
--
-- It does NOT change app code or remove old logic.

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
declare
  owner_expr text := 'false';
  public_restaurant_expr text := 'true';
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'menu_items'
      and c.relkind = 'r'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'owner_user_id'
    ) then
      owner_expr := owner_expr || ' or auth.uid() = r.owner_user_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'owner_id'
    ) then
      owner_expr := owner_expr || ' or auth.uid() = r.owner_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'user_id'
    ) then
      owner_expr := owner_expr || ' or auth.uid() = r.user_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'approval_status'
    ) then
      public_restaurant_expr := public_restaurant_expr || ' and lower(coalesce(r.approval_status, '''')) = ''approved''';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'is_approved'
    ) then
      public_restaurant_expr := public_restaurant_expr || ' and coalesce(r.is_approved, true)';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'approved'
    ) then
      public_restaurant_expr := public_restaurant_expr || ' and coalesce(r.approved, true)';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'is_enabled'
    ) then
      public_restaurant_expr := public_restaurant_expr || ' and coalesce(r.is_enabled, true)';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'is_disabled'
    ) then
      public_restaurant_expr := public_restaurant_expr || ' and not coalesce(r.is_disabled, false)';
    end if;

    execute 'alter table public.menu_items enable row level security';

    execute 'drop policy if exists menu_items_public_or_owner_read on public.menu_items';
    execute 'drop policy if exists menu_items_owner_or_admin_insert on public.menu_items';
    execute 'drop policy if exists menu_items_owner_or_admin_update on public.menu_items';
    execute 'drop policy if exists menu_items_owner_or_admin_delete on public.menu_items';

    execute format($policy$
      create policy menu_items_public_or_owner_read
      on public.menu_items
      for select
      to anon, authenticated
      using (
        public.is_admin_like()
        or exists (
          select 1
          from public.restaurants r
          where r.id = menu_items.restaurant_id
            and (
              (%s)
              or (%s)
            )
        )
      )
    $policy$, public_restaurant_expr, owner_expr);

    execute format($policy$
      create policy menu_items_owner_or_admin_insert
      on public.menu_items
      for insert
      to authenticated
      with check (
        public.is_admin_like()
        or exists (
          select 1
          from public.restaurants r
          where r.id = menu_items.restaurant_id
            and (%s)
        )
      )
    $policy$, owner_expr);

    execute format($policy$
      create policy menu_items_owner_or_admin_update
      on public.menu_items
      for update
      to authenticated
      using (
        public.is_admin_like()
        or exists (
          select 1
          from public.restaurants r
          where r.id = menu_items.restaurant_id
            and (%s)
        )
      )
      with check (
        public.is_admin_like()
        or exists (
          select 1
          from public.restaurants r
          where r.id = menu_items.restaurant_id
            and (%s)
        )
      )
    $policy$, owner_expr, owner_expr);

    execute format($policy$
      create policy menu_items_owner_or_admin_delete
      on public.menu_items
      for delete
      to authenticated
      using (
        public.is_admin_like()
        or exists (
          select 1
          from public.restaurants r
          where r.id = menu_items.restaurant_id
            and (%s)
        )
      )
    $policy$, owner_expr);
  end if;
end $$;

do $$
declare
  order_user_expr text := 'false';
  order_store_expr text := 'false';
  grocery_user_expr text := 'false';
  grocery_store_expr text := 'false';
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'delivery_events'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.delivery_events enable row level security';

    execute 'drop policy if exists delivery_events_participant_read on public.delivery_events';
    execute 'drop policy if exists delivery_events_driver_insert on public.delivery_events';
    execute 'drop policy if exists delivery_events_admin_manage on public.delivery_events';
    execute 'drop policy if exists delivery_events_admin_delete on public.delivery_events';

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
    ) then
      order_user_expr := order_user_expr || ' or auth.uid() = o.user_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_user_id'
    ) then
      order_user_expr := order_user_expr || ' or auth.uid() = o.customer_user_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_user_id'
    ) then
      order_user_expr := order_user_expr || ' or auth.uid() = o.delivery_user_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'owner_user_id'
    ) then
      order_store_expr := order_store_expr || ' or auth.uid() = r.owner_user_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'owner_id'
    ) then
      order_store_expr := order_store_expr || ' or auth.uid() = r.owner_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'user_id'
    ) then
      order_store_expr := order_store_expr || ' or auth.uid() = r.user_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'grocery_orders' and column_name = 'user_id'
    ) then
      grocery_user_expr := grocery_user_expr || ' or auth.uid() = go.user_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'grocery_orders' and column_name = 'customer_user_id'
    ) then
      grocery_user_expr := grocery_user_expr || ' or auth.uid() = go.customer_user_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'grocery_orders' and column_name = 'delivery_user_id'
    ) then
      grocery_user_expr := grocery_user_expr || ' or auth.uid() = go.delivery_user_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'grocery_stores' and column_name = 'owner_user_id'
    ) then
      grocery_store_expr := grocery_store_expr || ' or auth.uid() = gs.owner_user_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'grocery_stores' and column_name = 'owner_id'
    ) then
      grocery_store_expr := grocery_store_expr || ' or auth.uid() = gs.owner_id';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'grocery_stores' and column_name = 'user_id'
    ) then
      grocery_store_expr := grocery_store_expr || ' or auth.uid() = gs.user_id';
    end if;

    execute format($policy$
      create policy delivery_events_participant_read
      on public.delivery_events
      for select
      to authenticated
      using (
        public.is_admin_like()
        or delivery_user_id = auth.uid()
        or exists (
          select 1
          from public.orders o
          left join public.restaurants r on r.id = o.restaurant_id
          where o.id = delivery_events.order_id
            and (
              (%s)
              or (%s)
            )
        )
        or exists (
          select 1
          from public.grocery_orders go
          left join public.grocery_stores gs on gs.id = go.store_id
          where go.id = delivery_events.order_id
            and (
              (%s)
              or (%s)
            )
        )
      )
    $policy$, order_user_expr, order_store_expr, grocery_user_expr, grocery_store_expr);

    execute $policy$
      create policy delivery_events_driver_insert
      on public.delivery_events
      for insert
      to authenticated
      with check (
        public.is_admin_like()
        or delivery_user_id = auth.uid()
      )
    $policy$;

    execute $policy$
      create policy delivery_events_admin_manage
      on public.delivery_events
      for update
      to authenticated
      using (public.is_admin_like())
      with check (public.is_admin_like())
    $policy$;

    execute $policy$
      create policy delivery_events_admin_delete
      on public.delivery_events
      for delete
      to authenticated
      using (public.is_admin_like())
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
      and c.relname = 'restaurants_public'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.restaurants_public set (security_invoker = true)';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'menu_items_public'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.menu_items_public set (security_invoker = true)';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'delivery_latest_location'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.delivery_latest_location set (security_invoker = true)';
  end if;
end $$;
