# Mental Health Tracker

**Live App**: https://mental-health-tracker-rho.vercel.app

## Overview
A simple, mobile-friendly mental health tracking application that allows users to log daily wellness indicators (exercise, healthy eating, outdoor time, sleep quality, social interaction) along with a mood score and optional notes.

## Key Features
- 🔐 User authentication (email/password)
- 📊 Daily habit tracking with yes/no toggles
- 😊 1-5 mood scale
- 📝 Optional daily notes
- 📈 Trend visualization with charts
- 🔥 Streak tracking for positive habits
- 📱 Mobile-responsive design
- 💾 Cloud data sync across devices
- 🔒 Row-level security (users only see their own data)

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Charts**: Recharts
- **Backend**: Supabase (PostgreSQL + Auth)
- **Hosting**: Vercel

## Setup Instructions

Follow these two guides in order:

### 1. Backend Setup (Supabase)
📄 See `SUPABASE_SETUP.md`

This guide covers:
- Creating a Supabase project
- Setting up the database schema
- Configuring authentication
- Setting up Row Level Security (RLS)
- Getting API credentials

**Time estimate**: 15-20 minutes

### 2. Frontend Deployment (GitHub Pages)
📄 See `GITHUB_PAGES_SETUP.md`

This guide covers:
- Creating GitHub repository
- Setting up local development environment
- Installing dependencies
- Configuring Vite for GitHub Pages
- Deploying the application
- Connecting to Supabase backend

**Time estimate**: 20-30 minutes

## Quick Start Checklist

- [ ] Complete Supabase setup (SUPABASE_SETUP.md)
- [ ] Save Supabase URL and anon key
- [ ] Create GitHub repository
- [ ] Clone/setup local project
- [ ] Install dependencies (`npm install`)
- [ ] Create `.env.local` with Supabase credentials
- [ ] Test locally (`npm run dev`)
- [ ] Deploy to GitHub Pages (`npm run deploy`)
- [ ] Update Supabase Auth URLs with GitHub Pages URL
- [ ] Test authentication and data persistence
- [ ] Add to mobile home screen (optional)

## For AI Coding Agents

If you're an AI coding agent setting this up, here's what you need:

1. **Read both setup files completely before starting**
2. **SUPABASE_SETUP.md** contains all database and authentication configuration
3. **GITHUB_PAGES_SETUP.md** contains complete React application code and deployment instructions
4. Follow steps in exact order - backend first, then frontend
5. Don't skip any steps, especially:
   - Row Level Security policies
   - Environment variable configuration
   - Supabase Auth URL updates after deployment

## Environment Variables Required

Create `.env.local` with:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

Get these values from Supabase Dashboard → Project Settings → API

## Database Schema Summary

**Table: `entries`**
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to auth.users)
- `date` (DATE, unique per user)
- `exercise` (BOOLEAN)
- `healthy` (BOOLEAN)
- `outside` (BOOLEAN)
- `sleep` (BOOLEAN)
- `social` (BOOLEAN)
- `mood` (INTEGER, 1-5)
- `note` (TEXT, optional)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## Application Structure

```
mental-health-tracker/
├── src/
│   ├── App.jsx              # Main application component
│   ├── supabaseClient.js    # Supabase client configuration
│   ├── index.css            # Tailwind CSS styles
│   └── main.jsx             # React entry point
├── public/
├── .env.local               # Environment variables (gitignored)
├── .env.example             # Example env file (committed)
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
├── package.json             # Dependencies and scripts
└── README.md
```

## Development Workflow

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Deploy to Vercel
npx vercel --prod
```

## Security Features

✅ Row Level Security (RLS) enabled
✅ Users can only access their own data
✅ Secure authentication via Supabase Auth
✅ Anon key is safe for client-side use
✅ No sensitive data in code repository

## Mobile Usage

The app is designed for quick daily logging (under 1 minute):

1. Open app on mobile
2. Toggle 5 yes/no questions
3. Select mood (1-5)
4. Optionally add note
5. Save entry

Add to home screen for app-like experience.

## Maintenance

**Regular tasks:**
- Update dependencies: `npm update`
- Monitor Supabase usage (free tier limits)
- Check for security advisories: `npm audit`

**Supabase free tier limits:**
- 50,000 monthly active users
- 500 MB database size
- 2 GB bandwidth
- 50,000 monthly API requests

## Troubleshooting

**Common issues:**
1. Authentication not working → Check Supabase Auth URLs
2. Data not saving → Verify RLS policies
3. 404 on GitHub Pages → Check `base` in vite.config.js
4. Blank page → Check browser console, verify env variables

Detailed troubleshooting in respective setup documents.

## Future Enhancements

Consider adding:
- CSV data export
- Dark mode
- Push notifications for daily reminders
- Weekly/monthly summary emails
- More detailed analytics
- Goal setting features
- Integration with fitness trackers

## Support

For issues:
1. Check troubleshooting sections in setup documents
2. Verify all environment variables are set correctly
3. Check browser console for errors
4. Review Supabase dashboard for API errors
5. Ensure all dependencies are installed

## License

This project is provided as-is for personal use.
