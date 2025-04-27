-- Create users table for storing wallet information
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id TEXT NOT NULL UNIQUE,
    wallet_address TEXT,
    wallet_id TEXT,
    is_wallet_delegated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on telegram_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);

-- Set up Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy for the service role to manage all data
CREATE POLICY service_manage_all_users ON public.users 
    FOR ALL 
    TO service_role 
    USING (true);

-- Grant access to authenticated users
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- Create or replace function to handle user creation/updates
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatically updating updated_at
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update(); 