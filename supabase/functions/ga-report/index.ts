// Supabase Edge Function: GA4 Data API proxy
// Auth: Application Default Credentials (Workload Identity Federation)
// Property: 514050707
// Exposes aggregated data for frontend Analytics tab.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BetaAnalyticsDataClient } from "npm:@google-analytics/data";

const PROPERTY_ID = "properties/514050707";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const client = new BetaAnalyticsDataClient();

  try {
    const body = await req.json().catch(() => ({}));
    const { days = 30 } = body;

    const dateRanges = [{
      startDate: `${days}daysAgo`,
      endDate: "today",
    }];

    // Daily metrics
    const [dailyReport] = await client.runReport({
      property: PROPERTY_ID,
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "eventCount" },
      ],
    });

    // Top pages (by sessions)
    const [pagesReport] = await client.runReport({
      property: PROPERTY_ID,
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{
        metric: { metricName: "sessions" },
        desc: true,
      }],
      limit: 10,
    });

    return json({
      daily: dailyReport?.rows || [],
      topPages: pagesReport?.rows || [],
    });
  } catch (error) {
    return json({ error: error.message || String(error) }, 500);
  }
});
