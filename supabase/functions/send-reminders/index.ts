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

serve(async (req) => {
  try {
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get today's date in UTC
    const today = new Date().toISOString().split("T")[0];

    // Get all users with push subscriptions who haven't logged today
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth");

    if (subError) {
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get today's entries
    const { data: todayEntries, error: entriesError } = await supabase
      .from("entries")
      .select("user_id")
      .eq("date", today);

    if (entriesError) {
      throw entriesError;
    }

    const usersWithEntries = new Set(todayEntries?.map((e) => e.user_id) || []);

    // Filter to users who haven't logged today
    const usersToNotify = subscriptions.filter(
      (sub) => !usersWithEntries.has(sub.user_id)
    );

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
