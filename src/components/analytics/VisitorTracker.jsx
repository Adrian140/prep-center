import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const getOrCreateVisitorId = () => {
  const storageKey = "prep_center_visitor_id";
  let visitorId = localStorage.getItem(storageKey);
  if (!visitorId) {
    visitorId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(storageKey, visitorId);
  }
  return visitorId;
};

const detectDeviceType = () => {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "Tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "Mobile";
  return "Desktop";
};

const detectBrowser = () => {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  return "Other";
};

export default function VisitorTracker() {
  const location = useLocation();
  const lastPath = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const currentPath = location.pathname;
    if (currentPath === lastPath.current) return;
    lastPath.current = currentPath;

    const trackVisit = async () => {
      try {
        const visitorId = getOrCreateVisitorId();
        const deviceType = detectDeviceType();
        const browser = detectBrowser();
        const referrer = document.referrer || null;

        await supabase.from("page_visits").insert({
          visitor_id: visitorId,
          page_path: currentPath,
          referrer,
          user_agent: navigator.userAgent,
          device_type: deviceType,
          browser,
        });
      } catch (err) {
        console.error("Visit tracking error:", err);
      }
    };

    const timeout = setTimeout(trackVisit, 500);
    return () => clearTimeout(timeout);
  }, [location.pathname]);

  return null;
}
