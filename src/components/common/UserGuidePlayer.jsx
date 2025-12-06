import React, { useEffect, useState } from 'react';
import { supabaseHelpers } from '@/config/supabase';
import { X, Play, AlertCircle } from 'lucide-react';

export default function UserGuidePlayer({ section, title = 'User Guide' }) {
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const resolveGuide = async (targetSection) => {
        const result = await supabaseHelpers.getUserGuideBySection(targetSection);
        return result?.data || null;
      };

      try {
        setLoading(true);
        // Încearcă mai întâi secțiunea cerută (ex. "stock").
        // Dacă nu găsește nimic și este "stock", încearcă să folosească ghidul de "receiving"
        // ca fallback, ca să nu fie nevoie să dublezi manual linkul.
        let data = await resolveGuide(section);

        if (!data && section === 'stock') {
          data = await resolveGuide('receiving');
        }

        if (!mounted) return;

        if (data?.source_type === 'upload' && data?.video_path) {
          const { data: s } = await supabaseHelpers.getUserGuideSignedUrl(
            data.video_path,
            3600
          );
          if (mounted) setSrc(s?.signedUrl || '');
        } else if (data?.video_url) {
          if (mounted) setSrc(toPlayable(data.video_url));
        } else {
          if (mounted) setSrc('');
        }
      } catch {
        if (mounted) setSrc('');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [section]);

  const hasVideo = Boolean(src);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition
          ${hasVideo ? 'hover:bg-gray-50' : 'opacity-60 cursor-not-allowed'}`}
        title={title}
        disabled={!hasVideo || loading}
      >
        <Play className="w-4 h-4" />
        <span>{title}</span>
      </button>

      {open && (
        <div className="fixed bottom-4 right-4 w-[360px] max-w-[90vw] z-50">
          <div className="bg-white rounded-xl shadow-2xl border overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="text-sm font-medium">{title}</div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black">
              {hasVideo ? (
                isYouTube(src) ? (
                  <iframe
                    src={toEmbed(src)}
                    title="User Guide"
                    className="w-full aspect-video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video src={src} controls className="w-full aspect-video" />
                )
              ) : (
                <div className="w-full aspect-video bg-black/80 text-white flex items-center justify-center p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>Ghid indisponibil pentru secțiunea „{section}”.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isYouTube(url) {
  return /youtu\.be|youtube\.com/.test(url || '');
}
function toEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return `https://www.youtube.com/embed/${id}`;
    }
    const id = u.searchParams.get('v');
    return id ? `https://www.youtube.com/embed/${id}` : url;
  } catch {
    return url;
  }
}
// Acceptă și URL simplu dacă nu e YT
function toPlayable(url) {
  return url;
}
