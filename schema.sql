-- schema.sql
-- Run this in Supabase: Project → SQL Editor → New query
-- If you already ran the old version of this file, see the
-- MIGRATION section at the bottom instead of running this from scratch.

-- 1. Categories table (supports one level of subcategories)
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references categories(id) on delete cascade,
  icon_url text,
  created_at timestamptz default now()
);

alter table categories enable row level security;

create policy "Public can view categories"
  on categories for select
  using (true);

create policy "Authenticated users can manage categories"
  on categories for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 2. Items table
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  photo_url text not null,
  category_id uuid references categories(id) on delete set null,
  weight_value numeric,
  weight_unit text,   -- 'g', 'kg', 'oz', or 'lb'
  in_stock boolean not null default true,
  is_featured boolean not null default false,   -- "King's Pick"
  is_bestseller boolean not null default false, -- manually marked, since there's no order tracking
  is_frozen boolean not null default false,     -- needs freezer storage
  created_at timestamptz default now()
);

alter table items enable row level security;

create policy "Public can view items"
  on items for select
  using (true);

create policy "Authenticated users can add items"
  on items for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update items"
  on items for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can delete items"
  on items for delete
  using (auth.role() = 'authenticated');

-- 3. Additional photos per item (beyond the cover photo in items.photo_url)
create table item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  photo_url text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table item_photos enable row level security;

create policy "Public can view item photos"
  on item_photos for select
  using (true);

create policy "Authenticated users can manage item photos"
  on item_photos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------
-- Storage setup (do this in the Supabase dashboard, not SQL):
--
-- 1. Go to Storage → Create a new bucket named: item-photos
-- 2. Make it a PUBLIC bucket (so photo URLs work on the catalog page)
-- 3. Go to Storage → item-photos → Policies, and add:
--    - "Public can view" — SELECT — using (true)
--    - "Authenticated can upload" — INSERT — with check (auth.role() = 'authenticated')
--
-- ---------------------------------------------------------
-- Creating your admin login:
--
-- 1. Go to Authentication → Users → Add user
-- 2. Enter your own email + a password
-- 3. Do NOT enable public sign-ups — leave that off in Authentication → Settings
--    so only the account you create manually can log in.

-- ---------------------------------------------------------
-- MIGRATION (only run this if you already created the OLD items
-- table with a plain text `category` column, instead of running
-- everything above from scratch):
--
-- create table categories (
--   id uuid primary key default gen_random_uuid(),
--   name text not null,
--   parent_id uuid references categories(id) on delete cascade,
--   created_at timestamptz default now()
-- );
-- alter table categories enable row level security;
-- create policy "Public can view categories" on categories for select using (true);
-- create policy "Authenticated users can manage categories" on categories for all
--   using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- alter table categories add column icon_url text;
--
-- alter table items add column category_id uuid references categories(id) on delete set null;
-- alter table items add column weight_value numeric;
-- alter table items add column weight_unit text;
-- alter table items add column in_stock boolean not null default true;
-- alter table items add column is_featured boolean not null default false;
-- alter table items add column is_bestseller boolean not null default false;
-- alter table items add column is_frozen boolean not null default false;
--
-- create table item_photos (
--   id uuid primary key default gen_random_uuid(),
--   item_id uuid not null references items(id) on delete cascade,
--   photo_url text not null,
--   sort_order int default 0,
--   created_at timestamptz default now()
-- );
-- alter table item_photos enable row level security;
-- create policy "Public can view item photos" on item_photos for select using (true);
-- create policy "Authenticated users can manage item photos" on item_photos for all
--   using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
--
-- -- Manually create a category for each distinct existing items.category value,
-- -- then run one update per category name to link old rows, e.g.:
-- -- update items set category_id = '<new-category-uuid>' where category = 'Ceramics';
--
-- alter table items drop column category;
--
-- create policy "Authenticated users can update items" on items for update
--   using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
