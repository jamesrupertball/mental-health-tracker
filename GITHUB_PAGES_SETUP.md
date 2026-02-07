# GitHub Pages Deployment for Mental Health Tracker

## Overview
Deploy the Mental Health Tracker as a static website on GitHub Pages with Supabase backend integration.

## Prerequisites
- GitHub account
- Git installed locally
- Supabase project configured (see `SUPABASE_SETUP.md`)
- Node.js 18+ installed

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository settings:
   - **Repository name**: `mental-health-tracker`
   - **Visibility**: Public (required for free GitHub Pages)
   - **Initialize**: Do NOT add README, .gitignore, or license yet
3. Click "Create repository"

## Step 2: Set Up Local Project

Open terminal and run:

```bash
# Create project directory
mkdir mental-health-tracker
cd mental-health-tracker

# Initialize Vite React project
npm create vite@latest . -- --template react

# Install dependencies
npm install

# Install required packages
npm install @supabase/supabase-js
npm install recharts
npm install -D gh-pages
```

## Step 3: Configure Vite for GitHub Pages

Edit `vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mental-health-tracker/', // Must match your repo name
})
```

## Step 4: Create Environment Configuration

Create `.env.local` file in project root:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

**IMPORTANT**: 
- Replace with your actual Supabase URL and anon key from Supabase dashboard
- This file is gitignored and won't be committed

Create `.env.example` file (this WILL be committed):

```
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## Step 5: Create Supabase Client

Create `src/supabaseClient.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## Step 6: Create Main Application Component

Replace contents of `src/App.jsx` with the complete application code:

```jsx
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [todayEntry, setTodayEntry] = useState(null);
  const [view, setView] = useState('log');
  const [authView, setAuthView] = useState('signin'); // 'signin' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Get today's date string (YYYY-MM-DD)
  const getTodayKey = () => new Date().toISOString().split('T')[0];

  // Check for existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load entries when user is authenticated
  useEffect(() => {
    if (user) {
      loadEntries();
    }
  }, [user]);

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;

      setEntries(data || []);
      
      const today = getTodayKey();
      const todayData = data?.find(e => e.date === today);
      setTodayEntry(todayData || null);
    } catch (error) {
      console.error('Error loading entries:', error);
      alert('Error loading entries: ' + error.message);
    }
  };

  const [formData, setFormData] = useState({
    exercise: null,
    healthy: null,
    outside: null,
    sleep: null,
    social: null,
    mood: null,
    note: ''
  });

  useEffect(() => {
    if (todayEntry) {
      setFormData({
        exercise: todayEntry.exercise,
        healthy: todayEntry.healthy,
        outside: todayEntry.outside,
        sleep: todayEntry.sleep,
        social: todayEntry.social,
        mood: todayEntry.mood,
        note: todayEntry.note || ''
      });
    }
  }, [todayEntry]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      if (authView === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setEntries([]);
    setTodayEntry(null);
    setFormData({
      exercise: null,
      healthy: null,
      outside: null,
      sleep: null,
      social: null,
      mood: null,
      note: ''
    });
  };

  const handleSubmit = async () => {
    const today = getTodayKey();
    const entry = {
      user_id: user.id,
      date: today,
      exercise: formData.exercise,
      healthy: formData.healthy,
      outside: formData.outside,
      sleep: formData.sleep,
      social: formData.social,
      mood: formData.mood,
      note: formData.note || null,
    };

    try {
      const { error } = await supabase
        .from('entries')
        .upsert(entry, { onConflict: 'user_id,date' });

      if (error) throw error;

      alert('Entry saved! ✓');
      await loadEntries();
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Error saving entry: ' + error.message);
    }
  };

  const isComplete = () => {
    return formData.exercise !== null &&
           formData.healthy !== null &&
           formData.outside !== null &&
           formData.sleep !== null &&
           formData.social !== null &&
           formData.mood !== null;
  };

  const getStreak = (field) => {
    let streak = 0;
    const sortedEntries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    for (const entry of sortedEntries) {
      if (entry[field] === true) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  const ToggleButton = ({ label, value, onClick }) => (
    <div className="mb-4">
      <div className="text-sm text-gray-600 mb-2">{label}</div>
      <div className="flex gap-2">
        <button
          onClick={() => onClick(true)}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            value === true
              ? 'bg-green-500 text-white shadow-md'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => onClick(false)}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            value === false
              ? 'bg-red-400 text-white shadow-md'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          No
        </button>
      </div>
    </div>
  );

  // Auth screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">Mental Health Tracker</h1>
          <p className="text-gray-600 mb-6 text-center">Track your wellbeing daily</p>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setAuthView('signin')}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                authView === 'signin'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setAuthView('signup')}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                authView === 'signup'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
                minLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {authLoading ? 'Loading...' : authView === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main app (logged in)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Mental Health Tracker</h1>
          <p className="text-gray-600">Daily check-in · Less than 1 minute</p>
          <button
            onClick={handleSignOut}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
          >
            Sign Out
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setView('log')}
            className={`flex-1 py-2 rounded-lg font-medium transition-all ${
              view === 'log'
                ? 'bg-white text-indigo-600 shadow-md'
                : 'bg-white/50 text-gray-600 hover:bg-white/70'
            }`}
          >
            Today's Log
          </button>
          <button
            onClick={() => setView('trends')}
            className={`flex-1 py-2 rounded-lg font-medium transition-all ${
              view === 'trends'
                ? 'bg-white text-indigo-600 shadow-md'
                : 'bg-white/50 text-gray-600 hover:bg-white/70'
            }`}
          >
            Trends ({entries.length})
          </button>
        </div>

        {view === 'log' ? (
          <div className="bg-white rounded-xl shadow-lg p-6">
            {todayEntry && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                ✓ Already logged today! You can update your entry below.
              </div>
            )}

            <ToggleButton
              label="Did you exercise today?"
              value={formData.exercise}
              onClick={(val) => setFormData(prev => ({ ...prev, exercise: val }))}
            />

            <ToggleButton
              label="Did you eat healthy foods?"
              value={formData.healthy}
              onClick={(val) => setFormData(prev => ({ ...prev, healthy: val }))}
            />

            <ToggleButton
              label="Did you get outside?"
              value={formData.outside}
              onClick={(val) => setFormData(prev => ({ ...prev, outside: val }))}
            />

            <ToggleButton
              label="Did you sleep well?"
              value={formData.sleep}
              onClick={(val) => setFormData(prev => ({ ...prev, sleep: val }))}
            />

            <ToggleButton
              label="Did you have meaningful social interaction?"
              value={formData.social}
              onClick={(val) => setFormData(prev => ({ ...prev, social: val }))}
            />

            <div className="mb-4">
              <div className="text-sm text-gray-600 mb-2">How are you feeling? (1-5)</div>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(num => (
                  <button
                    key={num}
                    onClick={() => setFormData(prev => ({ ...prev, mood: num }))}
                    className={`flex-1 py-4 rounded-lg font-bold text-lg transition-all ${
                      formData.mood === num
                        ? 'bg-indigo-500 text-white shadow-md scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
                <span>Poor</span>
                <span>Excellent</span>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-2">Optional note</div>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows="2"
                placeholder="Anything worth noting..."
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!isComplete()}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
                isComplete()
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {todayEntry ? 'Update Entry' : 'Save Entry'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Current Streaks 🔥</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{getStreak('exercise')}</div>
                  <div className="text-sm text-gray-600">Exercise</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{getStreak('outside')}</div>
                  <div className="text-sm text-gray-600">Outside</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{getStreak('sleep')}</div>
                  <div className="text-sm text-gray-600">Good Sleep</div>
                </div>
                <div className="text-center p-3 bg-pink-50 rounded-lg">
                  <div className="text-2xl font-bold text-pink-600">{getStreak('social')}</div>
                  <div className="text-sm text-gray-600">Social</div>
                </div>
              </div>
            </div>

            {entries.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Mood Trend</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={[...entries].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => {
                        const d = new Date(date);
                        return `${d.getMonth()+1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
                    <Tooltip 
                      labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="mood" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      dot={{ fill: '#6366f1', r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Entries</h2>
              <div className="space-y-3">
                {entries.slice(0, 7).map(entry => (
                  <div key={entry.id} className="border-l-4 border-indigo-500 pl-4 py-2">
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-medium text-gray-800">
                        {new Date(entry.date).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                      <div className="text-lg font-bold text-indigo-600">
                        Mood: {entry.mood}/5
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs flex-wrap">
                      {entry.exercise && <span className="px-2 py-1 bg-green-100 text-green-700 rounded">Exercise</span>}
                      {entry.healthy && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">Healthy</span>}
                      {entry.outside && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">Outside</span>}
                      {entry.sleep && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">Sleep</span>}
                      {entry.social && <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded">Social</span>}
                    </div>
                    {entry.note && (
                      <div className="text-sm text-gray-600 mt-1 italic">"{entry.note}"</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Step 7: Update CSS

Replace contents of `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}
```

## Step 8: Install Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Edit `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

## Step 9: Update package.json

Add deployment scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

## Step 10: Create .gitignore

Create `.gitignore` file:

```
# Dependencies
node_modules

# Build output
dist
dist-ssr
*.local

# Environment variables
.env.local
.env

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# gh-pages
.cache
```

## Step 11: Initialize Git and Push to GitHub

```bash
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Mental Health Tracker"

# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/mental-health-tracker.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 12: Deploy to GitHub Pages

```bash
# Deploy to GitHub Pages
npm run deploy
```

This will:
1. Build the production version
2. Create a `gh-pages` branch
3. Deploy to GitHub Pages

## Step 13: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings**
3. Scroll to **Pages** section
4. Under **Source**, select **gh-pages** branch
5. Click **Save**
6. Wait 2-3 minutes for deployment

Your site will be available at: `https://YOUR_USERNAME.github.io/mental-health-tracker/`

## Step 14: Update Supabase Authentication URLs

1. Go to Supabase dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Update:
   - **Site URL**: `https://YOUR_USERNAME.github.io/mental-health-tracker/`
   - **Redirect URLs**: Add `https://YOUR_USERNAME.github.io/mental-health-tracker/**`

## Step 15: Test the Application

1. Visit your GitHub Pages URL
2. Sign up with an email and password
3. Check email for confirmation link (if enabled)
4. Log in and create a test entry
5. Verify data persists on refresh
6. Test on mobile device

## Future Updates

To update your deployed site:

```bash
# Make changes to code
# Test locally with: npm run dev

# When ready to deploy:
git add .
git commit -m "Description of changes"
git push origin main

# Deploy updated version
npm run deploy
```

## Troubleshooting

**Issue: Page shows 404**
- Verify `base` in `vite.config.js` matches repo name
- Check GitHub Pages is enabled on `gh-pages` branch
- Wait a few minutes after deployment

**Issue: Blank page**
- Check browser console for errors
- Verify environment variables are set correctly
- Ensure Supabase URL and key are valid

**Issue: Authentication not working**
- Verify Supabase Auth URLs match your GitHub Pages URL
- Check email confirmation is working
- Try password reset flow

**Issue: Can't save entries**
- Check browser console for Supabase errors
- Verify RLS policies are set up correctly
- Ensure user is authenticated

## Security Notes

- The Supabase anon key is safe to expose in frontend code
- Row Level Security (RLS) protects user data
- Never commit `.env.local` file
- Regularly update dependencies: `npm update`

## Mobile Installation (PWA)

To add as a PWA on mobile:

**iOS Safari:**
1. Visit site in Safari
2. Tap Share button
3. Tap "Add to Home Screen"

**Android Chrome:**
1. Visit site in Chrome
2. Tap menu (three dots)
3. Tap "Add to Home screen"

## Maintenance

**Update dependencies periodically:**
```bash
npm update
npm audit fix
```

**Monitor Supabase usage:**
- Check dashboard for database size
- Monitor API calls (free tier: 50,000 monthly active users)
- Set up email alerts for quota limits

## Next Steps

Consider adding:
- Export data feature (CSV download)
- Dark mode
- Push notifications for daily reminders
- Data visualization improvements
- Weekly/monthly summary reports
