-- VeilPay: Database setup for x402 payments
-- Run this in your Supabase SQL Editor

-- ── Invoice registry ──────────────────────────────────────────────────────────
-- Stores server-issued invoices so they survive across serverless instances.
-- Without this table the in-memory fallback breaks on Vercel/distributed deploys.
create table if not exists public.x402_invoices (
  id         text        primary key,
  expires_at timestamptz not null,
  consumed   boolean     not null default false
);

create index if not exists x402_invoices_expires_at on public.x402_invoices (expires_at);

-- ── Rate limiter ──────────────────────────────────────────────────────────────
create table if not exists public.x402_rate_limit (
  id     uuid        primary key default gen_random_uuid(),
  ip     text        not null,
  hit_at timestamptz not null default now()
);

create index if not exists x402_rate_limit_ip_hit_at on public.x402_rate_limit (ip, hit_at);

-- ── Payment receipts (replay protection) ─────────────────────────────────────
create table if not exists public.payments (
  id          uuid        primary key default gen_random_uuid(),
  deposit_sig text        not null unique,
  proof_sig   text        not null,
  invoice_id  text        not null,
  token       text        not null default 'SOL',
  amount      float8      not null,
  recipient   text        not null,
  verified_at timestamptz not null default now()
);

-- Enable RLS (read-only for anon, full access for service-role)
alter table public.payments    enable row level security;
alter table public.x402_invoices enable row level security;
alter table public.x402_rate_limit enable row level security;

create policy "Allow public read-only access to receipts"
  on public.payments for select
  using (true);

-- x402_invoices and x402_rate_limit are service-role only (no public read policy)
