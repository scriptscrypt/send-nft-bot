# Supabase Setup Guide

Follow these steps to set up your Supabase project for the Telegram Image Generation Bot:

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