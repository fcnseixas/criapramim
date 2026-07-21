-- Colunas do Stripe no profiles (rode uma vez no SQL Editor do Supabase)
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
