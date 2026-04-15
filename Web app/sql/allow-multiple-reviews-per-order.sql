-- Keep existing review data intact.
-- This updates the reviews uniqueness rule so one user can review
-- multiple targets for the same order, such as the store and the driver.

begin;

alter table public.reviews
  drop constraint if exists reviews_user_order_unique;

drop index if exists public.reviews_user_order_unique;

create unique index if not exists reviews_user_order_target_unique
  on public.reviews (user_id, order_id, target_type, target_id);

commit;
