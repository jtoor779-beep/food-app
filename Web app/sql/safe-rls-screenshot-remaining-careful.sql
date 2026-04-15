-- Careful RLS patch for the remaining screenshot tables that are safe to protect now:
-- - coupon_redemptions
-- - restaurants
--
-- Intentionally NOT changed here:
-- - restaurants_public
-- - menu_items_public
-- - delivery_latest_location
--
-- Reason:
-- those 3 are views, and changing them safely depends on their exact definitions.
-- They should be handled in a dedicated next pass after we inspect/recreate the views properly.

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
      and c.relname = 'coupon_redemptions'
      and c.relkind = 'r'
  ) then
    execute 'alter table public.coupon_redemptions enable row level security';

    execute 'drop policy if exists coupon_redemptions_public_read on public.coupon_redemptions';
    execute 'drop policy if exists coupon_redemptions_insert_own on public.coupon_redemptions';
    execute 'drop policy if exists coupon_redemptions_admin_manage on public.coupon_redemptions';

    execute $policy$
      create policy coupon_redemptions_public_read
      on public.coupon_redemptions
      for select
      to anon, authenticated
      using (true)
    $policy$;

    execute $policy$
      create policy coupon_redemptions_insert_own
      on public.coupon_redemptions
      for insert
      to authenticated
      with check (
        public.is_admin_like()
        or coalesce(user_id, auth.uid()) = auth.uid()
      )
    $policy$;

    execute $policy$
      create policy coupon_redemptions_admin_manage
      on public.coupon_redemptions
      for update
      to authenticated
      using (public.is_admin_like())
      with check (public.is_admin_like())
    $policy$;

    execute $policy$
      create policy coupon_redemptions_admin_delete
      on public.coupon_redemptions
      for delete
      to authenticated
      using (public.is_admin_like())
    $policy$;
  end if;
end $$;

do $$
declare
  owner_expr text := 'false';
  public_visibility_expr text := 'true';
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'restaurants'
      and c.relkind = 'r'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'owner_user_id'
    ) then
      owner_expr := owner_expr || ' or auth.uid() = owner_user_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'owner_id'
    ) then
      owner_expr := owner_expr || ' or auth.uid() = owner_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'user_id'
    ) then
      owner_expr := owner_expr || ' or auth.uid() = user_id';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'approval_status'
    ) then
      public_visibility_expr := public_visibility_expr || ' and lower(coalesce(approval_status, '''')) = ''approved''';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'is_approved'
    ) then
      public_visibility_expr := public_visibility_expr || ' and coalesce(is_approved, true)';
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'approved'
    ) then
      public_visibility_expr := public_visibility_expr || ' and coalesce(approved, true)';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'is_enabled'
    ) then
      public_visibility_expr := public_visibility_expr || ' and coalesce(is_enabled, true)';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurants' and column_name = 'is_disabled'
    ) then
      public_visibility_expr := public_visibility_expr || ' and not coalesce(is_disabled, false)';
    end if;

    execute 'alter table public.restaurants enable row level security';

    execute 'drop policy if exists restaurants_public_or_owner_read on public.restaurants';
    execute 'drop policy if exists restaurants_owner_or_admin_insert on public.restaurants';
    execute 'drop policy if exists restaurants_owner_or_admin_update on public.restaurants';
    execute 'drop policy if exists restaurants_owner_or_admin_delete on public.restaurants';

    execute format($policy$
      create policy restaurants_public_or_owner_read
      on public.restaurants
      for select
      to anon, authenticated
      using (
        (%s)
        or (%s)
        or public.is_admin_like()
      )
    $policy$, public_visibility_expr, owner_expr);

    execute format($policy$
      create policy restaurants_owner_or_admin_insert
      on public.restaurants
      for insert
      to authenticated
      with check (
        (%s)
        or public.is_admin_like()
      )
    $policy$, owner_expr);

    execute format($policy$
      create policy restaurants_owner_or_admin_update
      on public.restaurants
      for update
      to authenticated
      using (
        (%s)
        or public.is_admin_like()
      )
      with check (
        (%s)
        or public.is_admin_like()
      )
    $policy$, owner_expr, owner_expr);

    execute format($policy$
      create policy restaurants_owner_or_admin_delete
      on public.restaurants
      for delete
      to authenticated
      using (
        (%s)
        or public.is_admin_like()
      )
    $policy$, owner_expr);
  end if;
end $$;
