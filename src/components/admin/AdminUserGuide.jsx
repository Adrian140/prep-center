import React from 'react';
import { supabase, supabaseHelpers } from '@/config/supabase';
import { Upload, FileText } from 'lucide-react';

export default function AdminUserGuide() {
  const [section, setSection] = React.useState('receiving'); 
const GUIDE_LANGS = ['fr','en','de','it','es','ro'];

  const [guideLang, setGuideLang] = React.useState('fr');
  const [guideFile, setGuideFile] = React.useState(null);
  const [guideMsg, setGuideMsg]   = React.useState('');
  const [existingGuides, setExistingGuides] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [videoUrl, setVideoUrl] = React.useState('');
  const [videoMsg, setVideoMsg] = React.useState('');
  const [videoBusy, setVideoBusy] = React.useState(false);
  const [integrationLang, setIntegrationLang] = React.useState('ro');
  const [integrationBusy, setIntegrationBusy] = React.useState(false);
  const [uploadCardKey, setUploadCardKey] = React.useState('import');
  const [uploadFile, setUploadFile] = React.useState(null);
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [uploadMsg, setUploadMsg] = React.useState('');

  const INTEGRATION_CARDS = React.useMemo(() => ([
    { key: 'import', label: 'Import complet al listingurilor Amazon' },
    { key: 'notify', label: 'Notify incoming goods' },
    { key: 'prep', label: 'Stoc deja în PrepCenter (Send to Prep)' },
    { key: 'report-send', label: 'Rapoarte · Send to Amazon' },
    { key: 'report-incoming', label: 'Rapoarte · Incoming goods' },
    { key: 'report-email', label: 'Rapoarte · Raport final & email' }
  ]), []);

  const listExistingGuides = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .storage
        .from('user_guides')
        .list(section, { limit: 100, offset: 0 });
      if (error) throw error;
      const allowedExt = /\.(mp4|mov|webm|m4v|avi|mkv)$/i;
      setExistingGuides(
        (data || [])
          .filter((f) => allowedExt.test(f?.name || ''))
          .map((f) => f.name)
      );
    } catch {
      // non-blocking
    }
 }, [section]);

 React.useEffect(() => { listExistingGuides(); }, [listExistingGuides, section]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabaseHelpers.getUserGuideBySection(section);
        if (error || cancelled) return;
        setVideoUrl(data?.video_url || '');
        setVideoMsg('');
      } catch {
        if (!cancelled) {
          setVideoUrl('');
          setVideoMsg('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [section]);

  const uploadGuide = async () => {
    if (!guideFile) { setGuideMsg('Selectează un fișier video.'); return; }
    if (!(guideFile.type || '').startsWith('video/')) {
      setGuideMsg('Te rog încarcă un fișier video (ex. .mp4).');
      return;
    }
    setBusy(true);
    setGuideMsg('Se încarcă...');
    try {
      const ext = guideFile.name.split('.').pop()?.toLowerCase() || 'mp4';
      const path = `${section}/${guideLang}.${ext}`;
      const { error } = await supabase
        .storage
        .from('user_guides')
        .upload(path, guideFile, {
          upsert: true,
          cacheControl: '3600',
          contentType: guideFile.type || 'video/mp4'
        });
      if (error) throw error;
      setGuideMsg('Video încărcat ✔️');
      setGuideFile(null);
      await listExistingGuides();
    } catch (e) {
      setGuideMsg(`Eroare la încărcare: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteGuide = async (filename) => {
    if (!filename || busy) return;
    if (!window.confirm(`Ștergi fișierul ${filename}?`)) return;
    setBusy(true);
    setGuideMsg('Șterg fișierul...');
    try {
      const path = `${section}/${filename}`;
      const { error } = await supabase
        .storage
        .from('user_guides')
        .remove([path]);
      if (error) throw error;
      setGuideMsg('Video șters ✔️');
      await listExistingGuides();
    } catch (e) {
      setGuideMsg(`Eroare la ștergere: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const uploadIntegrationImage = async () => {
    if (!uploadFile) { setUploadMsg('Alege o poză (png/jpg).'); return; }
    if (!uploadCardKey) { setUploadMsg('Alege cardul.'); return; }
    setUploadBusy(true);
    setUploadMsg('Se încarcă...');
    const { error, data } = await supabaseHelpers.uploadIntegrationMediaFile({
      lang: integrationLang,
      card_key: uploadCardKey,
      file: uploadFile
    });
    if (error) {
      setUploadMsg(`Eroare la upload: ${error.message}`);
    } else {
      setUploadMsg('Încărcat ✔️');
      setUploadFile(null);
      if (data?.publicUrl) {
        setIntegrationImages((prev) => ({ ...prev, [uploadCardKey]: data.publicUrl }));
      }
    }
    setUploadBusy(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary flex items-center">
        <FileText className="w-5 h-5 mr-2" />
        User guides (video) – {section === 'receiving' ? 'Receiving' : 'Stock'}
      </h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {/* SUB LINIA ASTA ADAUGĂ ASTA — primul col din grid */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              disabled={busy}
            >
              <option value="receiving">Receiving</option>
              <option value="stock">Stock</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Limbă</label>
            <select
              value={guideLang}
              onChange={(e) => setGuideLang(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              disabled={busy}
            >
              {GUIDE_LANGS.map(lg => <option key={lg} value={lg}>{lg.toUpperCase()}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Fișier video</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setGuideFile(e.target.files?.[0] || null)}
              className="w-full border rounded-lg px-3 py-2"
              disabled={busy}
            />
          </div>

          <div>
            <button
              onClick={uploadGuide}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60"
              disabled={busy || !guideFile}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload / Replace
            </button>
          </div>
        </div>

        {guideMsg && (
          <div className="px-4 py-2 rounded bg-gray-50 border text-sm">{guideMsg}</div>
        )}

        <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-medium text-text-primary">
            Link video (YouTube sau URL direct)
          </p>
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
            <input
              type="text"
              placeholder="https://youtu.be/… sau https://example.com/video.mp4"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              disabled={videoBusy}
            />
            <button
              type="button"
              onClick={async () => {
                const trimmed = (videoUrl || '').trim();
                if (!trimmed) {
                  setVideoMsg('Introdu un link video înainte de a salva.');
                  return;
                }
                setVideoBusy(true);
                setVideoMsg('Se salvează linkul…');
                try {
                  const { error } = await supabaseHelpers.upsertUserGuide({
                    section,
                    video_url: trimmed
                  });
                  if (error) throw error;
                  setVideoMsg('Link video salvat ✔️');
                } catch (e) {
                  setVideoMsg(`Eroare la salvare: ${e.message}`);
                } finally {
                  setVideoBusy(false);
                }
              }}
              className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60"
              disabled={videoBusy}
            >
              Salvează link video
            </button>
          </div>
          {videoMsg && (
            <div className="px-3 py-2 rounded bg-white border text-xs text-text-secondary">
              {videoMsg}
            </div>
          )}
        </div>

        {existingGuides.length > 0 && (
          <div>
            <div className="text-sm text-text-secondary mb-1">
                Fișiere existente pentru <b>{section}</b>:
              </div>
            <div className="flex flex-wrap gap-2">
              {existingGuides.map(name => (
                <div
                  key={name}
                  className="px-2 py-1 text-xs rounded border bg-gray-50 flex items-center gap-2"
                >
                  <span className="select-text">{name}</span>
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-800"
                    onClick={() => deleteGuide(name)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>

      {/* Integrations images per card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Integrations – imagini carduri</h3>
            <p className="text-sm text-text-secondary">Setează URL-urile imaginilor pentru fiecare card, per limbă.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary">Limbă</label>
            <select
              value={integrationLang}
              onChange={(e) => setIntegrationLang(e.target.value)}
              className="border rounded-lg px-3 py-2"
              disabled={integrationBusy}
            >
              {GUIDE_LANGS.map((lg) => (
                <option key={lg} value={lg}>{lg.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-medium text-text-primary">Upload capturi de ecran (stocat în Supabase Storage)</p>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-sm text-text-secondary mb-1">Card</label>
              <select
                value={uploadCardKey}
                onChange={(e) => setUploadCardKey(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                disabled={uploadBusy}
              >
                {INTEGRATION_CARDS.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-text-secondary mb-1">Fișier imagine</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                disabled={uploadBusy}
              />
            </div>
            <div>
              <button
                type="button"
                onClick={uploadIntegrationImage}
                className="w-full inline-flex items-center justify-center px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-60"
                disabled={uploadBusy || !uploadFile}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload / Replace
              </button>
            </div>
          </div>
          {uploadMsg && (
            <div className="px-4 py-2 rounded bg-white border text-sm">{uploadMsg}</div>
          )}
        </div>

      </div>
    </div>
  );
}
