// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type ReceptionEmailRow = {
  id: string;
  reception_id: string;
  company_id: string;
  user_id: string;
  qty_received: number | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM") ?? Deno.env.get("FROM_EMAIL") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  global: { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}` } },
});

async function fetchPending(limit = 20): Promise<ReceptionEmailRow[]> {
  const { data, error } = await supabase
    .from("reception_emails")
    .select("id,reception_id,company_id,user_id,qty_received")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,first_name,last_name,company_name")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Failed to load profile", userId, error);
    return null;
  }
  return data;
}

async function markSent(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("reception_emails")
    .update({ sent_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

function buildEmailContent(profile: ProfileRow, row: ReceptionEmailRow) {
  const qty = row.qty_received ?? 0;
  const clientName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    profile.company_name ||
    "Client";

  const subject = `Recepție înregistrată – ${qty} unități`;
  const text = [
    `Bună, ${clientName},`,
    ``,
    `Am recepționat produsele dintr-o livrare recentă.`,
    `Cantitate recepționată: ${qty} unități.`,
    ``,
    `Mulțumim,`,
    `Echipa Prep Center`,
  ].join("\n");

  return { subject, text };
}

async function sendEmail(to: string, subject: string, text: string) {
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    throw new Error("Lipsesc RESEND_API_KEY sau FROM_EMAIL în environment");
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      text,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Resend failed: ${resp.status} ${errText}`);
  }
}

console.info("send_reception_emails started");

Deno.serve(async (_req) => {
  try {
    const pending = await fetchPending(50);
    const sentIds: string[] = [];
    const errors: string[] = [];

    for (const row of pending) {
      const profile = await fetchProfile(row.user_id);
      if (!profile?.email) {
        errors.push(`Missing email for user ${row.user_id}`);
        continue;
      }

      try {
        const { subject, text } = buildEmailContent(profile, row);
        await sendEmail(profile.email, subject, text);
        sentIds.push(row.id);
      } catch (err) {
        console.error("Failed to send email", row.id, err);
        errors.push(`Send failed ${row.id}: ${err?.message || err}`);
      }
    }

    if (sentIds.length) {
      await markSent(sentIds);
    }

    return new Response(
      JSON.stringify({
        processed: pending.length,
        sent: sentIds.length,
        errors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send_reception_emails error", err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
