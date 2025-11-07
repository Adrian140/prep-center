// FILE: src/hooks/useTrackVisit.js
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSupabaseAuth } from "../contexts/SupabaseAuthContext";

export default function useTrackVisit() {
  const location = useLocation();
  const { user } = useSupabaseAuth();

  useEffect(() => {
    // de-dup pe 30 de minute per path
    const key = `track:${location.pathname}`;
    const last = localStorage.getItem(key);
    const now = Date.now();
    if (last && now - Number(last) < 30 * 60 * 1000) return;

    const sessionKey = "visit_session_id";
    let session_id = localStorage.getItem(sessionKey);
    if (!session_id) {
      session_id = crypto.randomUUID();
      localStorage.setItem(sessionKey, session_id);
    }

    fetch("/functions/v1/track-visit?path=" + encodeURIComponent(location.pathname), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id,
        user_id: user?.id ?? null
      })
    }).catch(() => { /* ignore */ });

    localStorage.setItem(key, String(now));
  }, [location.pathname, user?.id]);
}