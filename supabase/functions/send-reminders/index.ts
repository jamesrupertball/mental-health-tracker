// @ts-nocheck -- Deno edge runtime types differ from VS Code's TS checker
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- Web Push via Web Crypto API (Deno-compatible) ---

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

async function createVapidJwt(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ authorization: string; cryptoKey: string }> {
  // Build JWT header and payload
  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject })
    )
  );
  const unsignedToken = `${header}.${payload}`;

  // Import VAPID private key for signing
  const rawPrivateKey = base64UrlDecode(privateKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(base64UrlDecode(publicKey).slice(1, 33)),
    y: base64UrlEncode(base64UrlDecode(publicKey).slice(33, 65)),
    d: base64UrlEncode(rawPrivateKey),
  };

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign the JWT
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      new TextEncoder().encode(unsignedToken)
    )
  );

  const token = `${unsignedToken}.${base64UrlEncode(signature)}`;
  return {
    authorization: `vapid t=${token}, k=${publicKey}`,
    cryptoKey: publicKey,
  };
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", key, salt));
  const infoKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = new Uint8Array(
    await crypto.subtle.sign("HMAC", infoKey, concat(info, new Uint8Array([1])))
  );
  return result.slice(0, length);
}

function createInfo(
  type: string,
  clientPublicKey: Uint8Array,
  serverPublicKey: Uint8Array
): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);
  const header = encoder.encode("Content-Encoding: ");
  const nul = new Uint8Array([0]);

  return concat(
    header,
    typeBytes,
    nul,
    new Uint8Array([0, 0, 0, 65]),
    clientPublicKey,
    new Uint8Array([0, 65]),
    serverPublicKey
  );
}

async function encryptPayload(
  clientPublicKeyBase64: string,
  clientAuthBase64: string,
  payload: string
): Promise<{ encrypted: Uint8Array; serverPublicKey: Uint8Array; salt: Uint8Array }> {
  const clientPublicKeyBytes = base64UrlDecode(clientPublicKeyBase64);
  const clientAuthBytes = base64UrlDecode(clientAuthBase64);
  const payloadBytes = new TextEncoder().encode(payload);

  // Generate server ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret via ECDH
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      serverKeyPair.privateKey,
      256
    )
  );

  // Generate random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive the encryption key and nonce using HKDF
  const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  const prk = await hkdf(clientAuthBytes, sharedSecret, authInfo, 32);

  const contentKeyInfo = createInfo("aesgcm", clientPublicKeyBytes, serverPublicKeyRaw);
  const contentKey = await hkdf(salt, prk, contentKeyInfo, 16);

  const nonceInfo = createInfo("nonce", clientPublicKeyBytes, serverPublicKeyRaw);
  const nonce = await hkdf(salt, prk, nonceInfo, 12);

  // Pad payload (2-byte padding length prefix + payload)
  const paddingLength = 0;
  const padded = concat(
    new Uint8Array([paddingLength >> 8, paddingLength & 0xff]),
    payloadBytes
  );

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  return { encrypted, serverPublicKey: serverPublicKeyRaw, salt };
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<boolean> {
  try {
    const endpoint = new URL(subscription.endpoint);
    const audience = `${endpoint.protocol}//${endpoint.host}`;

    // Create VAPID authorization header
    const vapid = await createVapidJwt(
      audience,
      "mailto:noreply@mental-health-tracker.app",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    // Encrypt the payload
    const { encrypted, serverPublicKey, salt } = await encryptPayload(
      subscription.p256dh,
      subscription.auth,
      payload
    );

    // Send the push message
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Authorization": vapid.authorization,
        "TTL": "86400",
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aesgcm",
        "Crypto-Key": `dh=${base64UrlEncode(serverPublicKey)};p256ecdsa=${VAPID_PUBLIC_KEY}`,
        "Encryption": `salt=${base64UrlEncode(salt)}`,
      },
      body: encrypted,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Push failed (${response.status}): ${body}`);
      return false;
    }
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
