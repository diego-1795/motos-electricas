-- Migración inicial Raiden (generada desde docs/06-database.md el 2026-10-23)
-- NO desplegada aún: se aplicará cuando el catálogo migre a Supabase (roadmap post-MVP).

create extension if not exists "pgcrypto";

create type product_status as enum ('draft', 'published', 'archived');
create type stock_status as enum ('in_stock', 'preorder', 'out_of_stock');
create type license_type as enum ('sin-licencia', 'B-I', 'B-IIa', 'B-IIb', 'B-IIc');
create type use_case as enum ('ciudad', 'trabajo', 'reparto', 'ocio', 'trayectos-largos', 'dos-personas', 'carga');
-- Versión comercial de un modelo: Estándar (350 W · 48V 12Ah) o Premium (500 W · 48V 20Ah)
create type variant_tier as enum ('estandar', 'premium');
-- Unidad de venta de un repuesto
create type part_unit as enum ('UND', 'PAR');
create type order_request_status as enum ('new', 'contacted', 'quoted', 'won', 'lost', 'spam');
create type whatsapp_source as enum ('cart', 'product', 'contact', 'finder');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function is_admin() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'app_role') = 'admin', false)
$$;

-- Dominio reutilizable para slugs
create domain slug_t as text check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(value) <= 80);

create table brands (
  id uuid primary key default gen_random_uuid(),
  slug slug_t not null unique, name text not null, logo_path text, website text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug slug_t not null unique, name text not null, description text,
  sort_order int not null default 0, seo_title text, seo_description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table batteries (
  id uuid primary key default gen_random_uuid(),
  slug slug_t not null unique, name text not null,
  voltage_v numeric(5,1) not null check (voltage_v > 0),
  capacity_ah numeric(6,1) not null check (capacity_ah > 0),
  chemistry text not null default 'plomo-acido', brand text, weight_kg numeric(5,1), removable boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  slug slug_t not null unique, name text not null,
  brand_id uuid not null references brands(id) on delete restrict,
  category_id uuid not null references categories(id) on delete restrict,
  status product_status not null default 'draft',
  summary text not null check (char_length(summary) <= 200), description_md text,
  license license_type not null default 'sin-licencia', use_cases use_case[] not null default '{}',
  hero_image_path text, gallery_paths text[] not null default '{}',
  specs jsonb not null default '{}'::jsonb, seo_title text, seo_description text,
  published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint published_requires_date check (status <> 'published' or published_at is not null)
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  code slug_t not null, name text not null,
  tier variant_tier not null,                  -- estandar | premium
  battery_id uuid references batteries(id) on delete set null,
  price_cents integer not null check (price_cents > 0),
  range_km integer check (range_km > 0), top_speed_kmh integer check (top_speed_kmh > 0),
  charge_hours numeric(4,1) check (charge_hours > 0),
  stock stock_status not null default 'in_stock', sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (product_id, code),
  unique (product_id, tier)
);

create table product_colors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  code slug_t not null, name text not null,
  hex char(7) not null check (hex ~ '^#[0-9A-Fa-f]{6}$'),
  image_path text, sort_order int not null default 0,
  unique (product_id, code)
);

-- Repuestos (antes "accessories", ver ADR-015): 26 piezas en src/content/repuestos
create table parts (
  id uuid primary key default gen_random_uuid(),
  slug slug_t not null unique, name text not null, status product_status not null default 'draft',
  summary text, description_md text, price_cents integer not null check (price_cents > 0),
  unit part_unit not null default 'UND',                   -- UND | PAR
  code text unique,                                        -- código interno, p. ej. RP-002
  image_path text, kind text not null default 'otro',      -- bateria, motor, controlador, cargador, iluminacion, frenos, cables, mandos, seguridad, llantas, otro
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table product_parts (
  product_id uuid not null references products(id) on delete cascade,
  part_id uuid not null references parts(id) on delete cascade,
  recommended boolean not null default false,
  primary key (product_id, part_id)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text not null unique check (phone ~ '^\+?[0-9 ]{9,20}$'),
  email text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city text, consent_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table order_requests (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique default upper(encode(gen_random_bytes(4), 'hex')),
  customer_id uuid references customers(id) on delete set null,
  status order_request_status not null default 'new',
  total_cents integer not null check (total_cents >= 0), currency char(3) not null default 'PEN' check (currency = 'PEN'),
  notes text check (char_length(notes) <= 1000), source_path text, ip_hash text, user_agent text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table order_request_items (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references order_requests(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  color_id uuid references product_colors(id) on delete set null,
  part_id uuid references parts(id) on delete set null,   -- el valor de carrito `accessory` se conserva internamente para repuestos
  label text not null,                         -- snapshot legible: "Golden Eagle · Premium · Negro"
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity between 1 and 10),
  constraint item_has_target check (product_id is not null or part_id is not null)
);

create table whatsapp_requests (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid references order_requests(id) on delete set null,
  source whatsapp_source not null,
  product_id uuid references products(id) on delete set null,
  message_preview text check (char_length(message_preview) <= 500), ip_hash text,
  created_at timestamptz not null default now()
);

create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug slug_t not null unique, title text not null, excerpt text, body_md text not null,
  cover_image_path text, status product_status not null default 'draft',
  tags text[] not null default '{}', author text not null default 'Raiden', published_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null, answer_md text not null, category text not null default 'general',
  product_id uuid references products(id) on delete cascade,
  sort_order int not null default 0, status product_status not null default 'published',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  author_name text not null, rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) <= 2000),
  status product_status not null default 'draft',   -- moderación manual antes de publicar
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index products_status_category_idx on products (status, category_id);
create index products_brand_idx on products (brand_id);
create index products_use_cases_gin on products using gin (use_cases);
create index variants_product_price_idx on product_variants (product_id, price_cents);
create index parts_status_idx on parts (status);
create index order_requests_status_created_idx on order_requests (status, created_at desc);
create index order_request_items_req_idx on order_request_items (order_request_id);
create index whatsapp_requests_created_idx on whatsapp_requests (created_at desc);
create index blog_posts_status_published_idx on blog_posts (status, published_at desc);
create index reviews_product_status_idx on reviews (product_id, status);

do $$ declare t text;
begin
  foreach t in array array['brands','categories','batteries','products','product_variants',
    'parts','customers','order_requests','blog_posts','faqs','reviews']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Catálogo publicado con precio "desde" calculado (sustituye a priceFromCents del JSON)
create view v_products_public as
select p.id, p.slug, p.name, p.summary, p.license, p.use_cases, p.hero_image_path, p.specs, p.published_at,
       b.slug as brand_slug, b.name as brand_name, c.slug as category_slug, c.name as category_name,
       (select min(v.price_cents) from product_variants v where v.product_id = p.id) as price_from_cents
from products p join brands b on b.id = p.brand_id join categories c on c.id = p.category_id
where p.status = 'published';

-- Bandeja de solicitudes para el panel de administración
create view v_order_requests_inbox as
select o.id, o.public_ref, o.status, o.total_cents, o.created_at, cu.name as customer_name, cu.phone as customer_phone,
       (select count(*) from order_request_items i where i.order_request_id = o.id) as item_count
from order_requests o left join customers cu on cu.id = o.customer_id;

do $$ declare t text;
begin
  foreach t in array array['brands','categories','batteries','products','product_variants','product_colors',
    'parts','product_parts','customers','order_requests','order_request_items',
    'whatsapp_requests','blog_posts','faqs','reviews']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Lectura pública del catálogo publicado
create policy brands_read on brands for select using (true);
create policy categories_read on categories for select using (true);
create policy batteries_read on batteries for select using (true);
create policy product_parts_read on product_parts for select using (true);
create policy products_read on products for select using (status = 'published' or is_admin());
create policy variants_read on product_variants for select
  using (exists (select 1 from products p where p.id = product_id and (p.status = 'published' or is_admin())));
create policy colors_read on product_colors for select
  using (exists (select 1 from products p where p.id = product_id and (p.status = 'published' or is_admin())));
create policy parts_read on parts for select using (status = 'published' or is_admin());
create policy blog_read on blog_posts for select using (status = 'published' or is_admin());
create policy faqs_read on faqs for select using (status = 'published' or is_admin());
create policy reviews_read on reviews for select using (status = 'published' or is_admin());

-- Escritura solo rol admin (catálogo, contenido y gestión de solicitudes)
do $$ declare t text;
begin
  foreach t in array array['brands','categories','batteries','products','product_variants','product_colors',
    'parts','product_parts','blog_posts','faqs','reviews','customers','order_requests','order_request_items']
  loop
    execute format('create policy %I_admin_all on %I for all using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;
create policy whatsapp_admin_read on whatsapp_requests for select using (is_admin());

-- Inserción anónima limitada (segunda línea de defensa; la primera es la Edge Function con validación y rate limit)
create policy customers_insert_anon on customers for insert to anon, authenticated with check (consent_at is not null);
create policy order_requests_insert_anon on order_requests for insert to anon, authenticated
  with check (status = 'new' and total_cents between 0 and 5000000);
create policy order_items_insert_anon on order_request_items for insert to anon, authenticated
  with check (quantity between 1 and 10);
create policy whatsapp_insert_anon on whatsapp_requests for insert to anon, authenticated with check (true);
create policy reviews_insert_anon on reviews for insert to anon, authenticated with check (status = 'draft');

insert into brands (slug, name) values ('raiden', 'RAIDEN');
insert into categories (slug, name, sort_order) values
  ('bicimotos', 'Bicimotos', 1), ('trimotos', 'Trimotos', 2), ('repuestos', 'Repuestos', 3);
insert into batteries (slug, name, voltage_v, capacity_ah, brand, removable) values
  ('chilwee-48v-12ah', 'Batería Chilwee 48V 12Ah', 48, 12, 'Chilwee', true),
  ('chilwee-48v-20ah', 'Batería Chilwee 48V 20Ah', 48, 20, 'Chilwee', false);
