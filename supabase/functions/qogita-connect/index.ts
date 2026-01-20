import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const QOGITA_API_URL = Deno.env.get("QOGITA_API_URL") || "https://api.qogita.com";
const QOGITA_ENC_KEY = Deno.env.get("QOGITA_ENC_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type LoginResponse = {
  access?: string;
  access_token?: string;
  token?: string;
  expires_at?: string | null;
  access_expires_at?: string | null;
  [key: string]: unknown;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function base64Url(data: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function deriveKey(secret: string) {
  if (!secret || secret.length < 32) {
    throw new Error("Missing QOGITA_ENC_KEY (expected at least 32 chars).");
  }
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret).slice(0, 32);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptToken(token: string) {
  const key = await deriveKey(QOGITA_ENC_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(token);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${base64Url(iv)}.${base64Url(cipher)}`;
}

async function handleConnect(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { email?: string; password?: string; user_id?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim();
  const password = body.password || "";
  const userId = body.user_id || null;

  if (!email || !password) {
    return jsonResponse({ error: "Email and password are required" }, 400);
  }

  try {
    const loginResp = await fetch(`${QOGITA_API_URL}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!loginResp.ok) {
      const text = await loginResp.text();
      return jsonResponse({ error: "Qogita login failed", details: text || loginResp.statusText }, 400);
    }

    const loginData = (await loginResp.json()) as LoginResponse;
    const token =
      loginData.access ||
      loginData.access_token ||
      loginData.token ||
      null;
    if (!token) {
      return jsonResponse({ error: "Qogita login did not return an access token." }, 400);
    }

    const expiresAt =
      loginData.expires_at ||
      loginData.access_expires_at ||
      null;

    const encrypted = await encryptToken(token);

    const { error } = await supabase.from("qogita_connections").upsert(
      {
        user_id: userId,
        qogita_email: email,
        access_token_encrypted: encrypted,
        expires_at: expiresAt,
        status: "active"
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return jsonResponse({ error: "Could not store Qogita token", details: error.message }, 500);
    }

    return jsonResponse({ ok: true, status: "connected", expires_at: expiresAt });
  } catch (err) {
    return jsonResponse({ error: "Unexpected error", details: `${err}` }, 500);
  }
}

serve(handleConnect);
