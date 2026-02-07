import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [todayEntry, setTodayEntry] = useState(null);
  const [view, setView] = useState('log');
  const [authView, setAuthView] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationSupported, setNotificationSupported] = useState(false);

  const getLocalDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Register service worker and check notification status
  useEffect(() => {
    const checkNotificationSupport = async () => {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        setNotificationSupported(true);
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          const subscription = await registration.pushManager.getSubscription();
          setNotificationsEnabled(!!subscription);
        } catch (error) {
          console.error('Service worker registration failed:', error);
        }
      }
    };
    checkNotificationSupport();
  }, []);

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

      const today = getLocalDateKey();
      const todayData = data?.find(e => e.date === today);
      setTodayEntry(todayData || null);
    } catch (error) {
      console.error('Error loading entries:', error);
      alert('Error loading entries: ' + error.message);
    }
  };

  const subscribeToNotifications = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Notification permission denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      const subscriptionJson = subscription.toJSON();

      // Save to Supabase (include user's timezone for server-side date matching)
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscriptionJson.endpoint,
          p256dh: subscriptionJson.keys.p256dh,
          auth: subscriptionJson.keys.auth,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setNotificationsEnabled(true);
      alert('Daily reminders enabled! You\'ll receive a notification at 7 PM if you haven\'t logged.');
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      alert('Error enabling notifications: ' + error.message);
    }
  };

  const unsubscribeFromNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remove from Supabase
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      setNotificationsEnabled(false);
      alert('Daily reminders disabled.');
    } catch (error) {
      console.error('Error unsubscribing:', error);
      alert('Error disabling notifications: ' + error.message);
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
    const today = getLocalDateKey();
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

      alert('Entry saved!');
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
    const sortedEntries = [...entries].sort((a, b) => new Date(b.date + 'T00:00:00') - new Date(a.date + 'T00:00:00'));

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Mental Health Tracker</h1>
          <p className="text-gray-600">Daily check-in</p>
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
                Already logged today! You can update your entry below.
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
            {/* Notification Settings */}
            {notificationSupported && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Daily Reminders</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Get a notification at 7 PM if you haven't logged your daily check-in.
                </p>
                <button
                  onClick={notificationsEnabled ? unsubscribeFromNotifications : subscribeToNotifications}
                  className={`w-full py-3 rounded-lg font-medium transition-all ${
                    notificationsEnabled
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {notificationsEnabled ? 'Disable Reminders' : 'Enable Reminders'}
                </button>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Current Streaks</h2>
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
                        const d = new Date(date + 'T00:00:00');
                        return `${d.getMonth()+1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
                    <Tooltip
                      labelFormatter={(date) => new Date(date + 'T00:00:00').toLocaleDateString()}
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
                        {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
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
