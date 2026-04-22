-- VeilPay: Create payments table for x402 Replay Protection
-- Run this in your Supabase SQL Editor

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  deposit_sig text not null unique,
  proof_sig text not null,
  invoice_id text not null,
  amount float8 not null,
  recipient text not null,
  verified_at timestamptz not null default now()
);

-- Enable RLS (Read-only for users, Full access for service-role)
alter table public.payments enable row level security;

create policy "Allow public read-only access to receipts"
  on public.payments for select
  using (true);
