import React from 'react';
import { supabase } from '@/config/supabase';
import { Upload, FileText } from 'lucide-react';

export default function AdminUserGuide() {
  const [section, setSection] = React.useState('receiving'); 
const GUIDE_LANGS = ['fr','en','de','it','es','ro'];

  const [guideLang, setGuideLang] = React.useState('fr');
  const [guideFile, setGuideFile] = React.useState(null);
  const [guideMsg, setGuideMsg]   = React.useState('');
  const [existingGuides, setExistingGuides] = React.useState([]);
  const [busy, setBusy] = React.useState(false);

  const listExistingGuides = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .storage
        .from('user_guides')
        .list(section, { limit: 100, offset: 0 });
      if (error) throw error;
      setExistingGuides((data || []).filter(f => f?.name?.endsWith('.pdf')).map(f => f.name));
    } catch {
      // non-blocking
    }
 }, [section]);

 React.useEffect(() => { listExistingGuides(); }, [listExistingGuides, section]);

  const uploadGuide = async () => {
    if (!guideFile) { setGuideMsg('Selectează un fișier PDF.'); return; }
    if (!/\.pdf$/i.test(guideFile.name)) { setGuideMsg('Te rog încarcă un fișier .pdf.'); return; }
    setBusy(true);
    setGuideMsg('Se încarcă...');
    try {
      const path = `${section}/${guideLang}.pdf`;
      const { error } = await supabase
        .storage
        .from('user_guides')
        .upload(path, guideFile, {
          upsert: true,
          cacheControl: '3600',
          contentType: 'application/pdf'
        });
      if (error) throw error;
      setGuideMsg('PDF încărcat ✔️');
      setGuideFile(null);
      await listExistingGuides();
    } catch (e) {
      setGuideMsg(`Eroare la încărcare: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary flex items-center">
        <FileText className="w-5 h-5 mr-2" />
        Import Instructions (PDF) – {section === 'receiving' ? 'Receiving' : 'Stock'}
      </h2>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
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
            <label className="block text-sm font-medium text-text-secondary mb-1">Fișier PDF</label>
            <input
              type="file"
              accept="application/pdf"
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

        {existingGuides.length > 0 && (
          <div>
            <div className="text-sm text-text-secondary mb-1">
                Fișiere existente pentru <b>{section}</b>:
              </div>
            <div className="flex flex-wrap gap-2">
              {existingGuides.map(name => (
                <span key={name} className="px-2 py-1 text-xs rounded border bg-gray-50">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
