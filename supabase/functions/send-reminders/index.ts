import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Web Push implementation using Web Crypto API
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<boolean> {
  try {
    // Import the web-push compatible library for Deno
    const webPush = await import("https://esm.sh/web-push@3.6.7");

    webPush.setVapidDetails(
      "mailto:noreply@mental-health-tracker.app",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload
    );
    return true;
  } catch (error) {
    console.error("Push failed:", error);
    return false;
  }
}

// Get the local date string (YYYY-MM-DD) for a given timezone
function getLocalDate(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA locale formats as YYYY-MM-DD
    return formatter.format(now);
  } catch {
    // Fallback to UTC if timezone is invalid
    return new Date().toISOString().split("T")[0];
  }
}

// Get the current hour (0-23) in a given timezone
function getLocalHour(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    return -1; // Invalid timezone, skip this user
  }
}

const REMINDER_HOUR = 19; // 7 PM local time

serve(async (req) => {
  try {
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all users with push subscriptions (including their timezone)
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth, timezone");

    if (subError) {
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only include users where it's currently 7 PM in their timezone
    const eligibleSubs: typeof subscriptions = subscriptions.filter(
      (sub: typeof subscriptions[number]) => getLocalHour(sub.timezone || "UTC") === REMINDER_HOUR
    );

    if (eligibleSubs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users in the 7 PM hour right now" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Group eligible subscriptions by their local date so we query entries correctly
    const subsByLocalDate = new Map<string, typeof subscriptions>();
    for (const sub of eligibleSubs) {
      const localDate = getLocalDate(sub.timezone || "UTC");
      if (!subsByLocalDate.has(localDate)) {
        subsByLocalDate.set(localDate, []);
      }
      subsByLocalDate.get(localDate)!.push(sub);
    }

    // For each local date, find users who have already logged
    const usersToNotify: typeof subscriptions = [];
    for (const [localDate, subs] of subsByLocalDate) {
      const userIds = subs.map((s) => s.user_id);
      const { data: todayEntries, error: entriesError } = await supabase
        .from("entries")
        .select("user_id")
        .eq("date", localDate)
        .in("user_id", userIds);

      if (entriesError) {
        throw entriesError;
      }

      const usersWithEntries = new Set(todayEntries?.map((e) => e.user_id) || []);
      const unloggedUsers = subs.filter((sub) => !usersWithEntries.has(sub.user_id));
      usersToNotify.push(...unloggedUsers);
    }

    console.log(`Sending reminders to ${usersToNotify.length} users`);

    // Send notifications
    const results = await Promise.all(
      usersToNotify.map(async (sub) => {
        const success = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          "Time for your daily mental health check-in!"
        );
        return { user_id: sub.user_id, success };
      })
    );

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        message: `Sent ${successCount}/${usersToNotify.length} reminders`,
        results,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
