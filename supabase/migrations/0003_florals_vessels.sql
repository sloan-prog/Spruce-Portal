-- Migration 0003: Florals as perishable JIT (per-event, existing tables) +
-- durable vessels/containers modeled par-style (new tables).

create table if not exists public.raw_floral (
  id                  uuid primary key default uuid_generate_v4(),
  submission_id       text not null,
  submission_date     timestamptz,
  property_id         text,
  property_name       text,
  clean_id            text,
  arrangements_needed integer,
  action              text,            -- RESTOCK / LEAVE / REMOVE (text at raw layer)
  photo_1             text,
  completed_by        text,
  notes               text,
  processed           boolean default false,
  created_at          timestamptz default now()
);
create unique index if not exists uq_raw_floral_submission on public.raw_floral (submission_id);

create table if not exists public.floral_vessels (
  id           uuid primary key default uuid_generate_v4(),
  vessel_code  text not null unique,
  vessel_name  text not null,
  material     text,
  size         text,
  unit_cost    numeric,
  vendor       text,
  order_link   text,
  image_url    text,
  active       boolean default true,
  notes        text,
  created_at   timestamptz default now()
);

create table if not exists public.property_vessel_stock (
  id              uuid primary key default uuid_generate_v4(),
  property_id     text,
  vessel_code     text,
  target_par      integer default 0,
  current_on_hand integer default 0,
  min_threshold   integer default 0,
  last_updated    timestamptz default now(),
  last_count_at   timestamptz,
  unique (property_id, vessel_code)
);

-- ===== ROLLBACK (manual) =====
-- drop table if exists public.property_vessel_stock;
-- drop table if exists public.floral_vessels;
-- drop table if exists public.raw_floral;
