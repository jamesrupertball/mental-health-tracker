# Supabase Backend Setup for Mental Health Tracker

## Overview
Set up a Supabase backend to store mental health tracker entries with user authentication and real-time sync capabilities.

## Prerequisites
- Supabase account (https://supabase.com)
- Access to Supabase dashboard

## Step 1: Create New Supabase Project

1. Log into Supabase dashboard
2. Click "New Project"
3. Fill in details:
   - Project name: `mental-health-tracker` (or your preference)
   - Database password: Generate strong password and save it
   - Region: Choose closest to your location
   - Pricing plan: Free tier is sufficient
4. Wait for project to provision (~2 minutes)

## Step 2: Create Database Schema

Navigate to SQL Editor in Supabase dashboard and run the following SQL:

```sql
-- Create entries table
CREATE TABLE public.entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    exercise BOOLEAN,
    healthy BOOLEAN,
    outside BOOLEAN,
    sleep BOOLEAN,
    social BOOLEAN,
    mood INTEGER CHECK (mood >= 1 AND mood <= 5),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, date)
);

-- Create index on user_id and date for faster queries
CREATE INDEX idx_entries_user_date ON public.entries(user_id, date DESC);

-- Enable Row Level Security
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own entries
CREATE POLICY "Users can view own entries"
    ON public.entries
    FOR SELECT
    USING (auth.uid() = user_id);

-- Create policy: Users can insert their own entries
CREATE POLICY "Users can insert own entries"
    ON public.entries
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own entries
CREATE POLICY "Users can update own entries"
    ON public.entries
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Create policy: Users can delete their own entries
CREATE POLICY "Users can delete own entries"
    ON public.entries
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.entries
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
```

## Step 3: Configure Authentication

1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Enable **Email** provider (enabled by default)
3. Configure email settings:
   - Go to **Authentication** → **Email Templates**
   - Customize confirmation email if desired (optional)
4. Settings to configure in **Authentication** → **Settings**:
   - **Site URL**: Will be `https://YOUR_GITHUB_USERNAME.github.io/mental-health-tracker/`
   - **Redirect URLs**: Add the same URL as above
   - Note: Update these after deploying to GitHub Pages

## Step 4: Get API Credentials

1. Go to **Project Settings** → **API**
2. Copy the following values (you'll need these for the frontend):
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

**IMPORTANT**: Keep the anon key public-safe (it's designed to be used in frontend code). Never share your `service_role` key.

## Step 5: Test Database Connection (Optional)

Run this SQL query to verify the table was created:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'entries';
```

You should see all the columns listed (id, user_id, date, exercise, etc.)

## Step 6: Set Up Realtime (Optional - for multi-device sync)

If you want real-time updates across devices:

1. Go to **Database** → **Replication**
2. Enable replication for `public.entries` table
3. This allows the app to subscribe to changes

## Environment Variables for Frontend

After completing setup, provide these to your frontend application:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

## Database Schema Explanation

**Table: `entries`**
- `id`: Unique identifier for each entry (auto-generated UUID)
- `user_id`: Links entry to authenticated user
- `date`: Date of the entry (YYYY-MM-DD format)
- `exercise`: Boolean - did user exercise
- `healthy`: Boolean - did user eat healthy
- `outside`: Boolean - did user get outside
- `sleep`: Boolean - did user sleep well
- `social`: Boolean - did user have social interaction
- `mood`: Integer 1-5 - mood rating
- `note`: Text - optional note
- `created_at`: Timestamp when entry was created
- `updated_at`: Timestamp when entry was last modified

**Constraints:**
- One entry per user per day (UNIQUE constraint on user_id + date)
- Mood must be between 1 and 5
- All entries must belong to an authenticated user

**Security:**
- Row Level Security (RLS) ensures users can only access their own data
- All queries automatically filter by authenticated user
- No user can see or modify another user's entries

## Troubleshooting

**Issue: Can't insert data**
- Check that user is authenticated
- Verify RLS policies are created
- Check browser console for specific error messages

**Issue: Policies not working**
- Ensure RLS is enabled on table: `ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;`
- Verify policies exist: Check Table Editor → Policies tab

**Issue: Authentication not working**
- Verify Site URL and Redirect URLs are correct in Auth settings
- Check that email provider is enabled
- Ensure anon key is correctly copied to frontend

## Next Steps

After Supabase is configured:
1. Follow `GITHUB_PAGES_SETUP.md` to deploy frontend
2. Update Supabase Auth settings with deployed URL
3. Test authentication and data persistence
