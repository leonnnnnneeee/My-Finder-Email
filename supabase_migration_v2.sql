-- Chạy trong Supabase SQL Editor

-- Bảng lưu các site đối thủ đã add
create table if not exists competitor_sites (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  domain text not null,
  name text,
  last_crawled_at timestamptz,
  total_pages_crawled int default 0,
  total_emails_found int default 0,
  created_at timestamptz default now()
);

-- Bảng lưu các URL trang/bài viết đã quét — tránh quét lại
create table if not exists crawled_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references competitor_sites(id) on delete cascade,
  page_url text not null unique,
  page_title text,
  emails_found int default 0,
  crawled_at timestamptz default now()
);

-- Thêm cột source_type vào emails để phân biệt nguồn
alter table emails add column if not exists source_type text default 'manual';
-- source_type: 'manual' | 'scrape' | 'hunter' | 'hunter_bod' | 'article'

-- Thêm cột contact_name và position cho email BOD từ Hunter
alter table emails add column if not exists contact_name text;
alter table emails add column if not exists position text;
alter table emails add column if not exists confidence int;

create index if not exists idx_crawled_pages_site on crawled_pages(site_id);
create index if not exists idx_crawled_pages_url on crawled_pages(page_url);

alter table competitor_sites enable row level security;
alter table crawled_pages enable row level security;
create policy "allow_all_sites" on competitor_sites for all using (true) with check (true);
create policy "allow_all_pages" on crawled_pages for all using (true) with check (true);
