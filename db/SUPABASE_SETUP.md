# DEPRECATED: This file has been moved to db/SUPABASE_SETUP.md

This documentation has been relocated to the db folder along with the SQL setup files.
Please refer to the updated version at `db/SUPABASE_SETUP.md`.

All database-related files are now centralized in the db directory for better organization.

---

# Supabase Setup Guide

This document describes how to set up the Supabase database for the Telegram bot.

## Database Setup

The bot uses Supabase to store generated images and user wallet data. Follow these steps to set up the database:

1. Create a new Supabase project at https://supabase.com
2. Use the SQL editor to create the required tables
3. Configure environment variables

## SQL Scripts

### Images Table

Run the following SQL to create the images table:

```sql
-- Create images table for storing generated images
CREATE TABLE IF NOT EXISTS public.images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_images_user_id ON public.images(user_id);

-- Set up Row Level Security (RLS)
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

-- Create policy for the service role to manage all data
CREATE POLICY service_manage_all_images ON public.images 
    FOR ALL 
    TO service_role 
    USING (true);

-- Grant access to authenticated users
GRANT ALL ON public.images TO authenticated;
GRANT ALL ON public.images TO service_role;
```

### Users Table (Wallet Management)

Run the following SQL to create the users table for wallet management:

```sql
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
```

## Storage Setup

1. Create a new bucket called `images` in the Storage section
2. Set the bucket to be public (for image URLs)
3. Configure CORS if needed

## Environment Variables

Add the following environment variables to your bot configuration:

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

These values can be found in your Supabase project settings under "API".

## 1. Create a Supabase Project

1. Go to [Supabase](https://supabase.com) and sign in or create an account
2. Create a new project and give it a name (e.g., "telegram-image-bot")
3. Make note of your project URL and API keys (found in Settings > API)

## 2. Create the Database Table

You have two options to create the required database table:

### Option A: Using the SQL Editor

1. In your Supabase dashboard, go to the SQL Editor
2. Copy the contents of the `supabase-setup.sql` file in this repo
3. Paste it into the SQL Editor and click "Run"

### Option B: Using the Table Editor

1. In your Supabase dashboard, go to the Table Editor
2. Click "Create a new table"
3. Name: `images`
4. Columns:
   - `id`: uuid, primary key, default: `gen_random_uuid()`
   - `user_id`: text, not null
   - `filename`: text, not null
   - `prompt`: text, not null
   - `path`: text, not null
   - `url`: text, not null
   - `created_at`: timestamp with timezone, default: `now()`

## 3. Create a Storage Bucket

1. In your Supabase dashboard, go to Storage
2. Click "Create a new bucket"
3. Name: `images`
4. Access level: Choose "Public" (since we'll be serving these images publicly)
5. Enable "Allow file download" under Permission Policies

## 4. Configure Environment Variables

Update your `.env` file with the Supabase credentials:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

The service role key is required to bypass Row Level Security (RLS) for admin operations.

## 5. Test the Configuration

Run your bot and try generating an image to ensure the Supabase integration is working properly.

## Troubleshooting

- If you see "relation does not exist" errors, ensure the `images` table was created correctly
- If you see "Bucket not found" errors, ensure the `images` storage bucket was created
- If you encounter permission issues, make sure you're using the service role key, not the anon key 