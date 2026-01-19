// FILE: src/components/admin/AdminAnalytics.jsx
import React, { useEffect, useState } from "react";
import { BarChart3, Building, AlertCircle } from "lucide-react";
import ClientAnalytics from "../dashboard/client/ClientAnalytics";
import { supabase } from "@/config/supabase";

export default function AdminAnalytics() {
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [error, setError] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingCompanies(true);
      setError('');
      const query = supabase
        .from('companies')
        .select('id,name')
        .order('name', { ascending: true })
        .limit(500);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setError(error.message || 'Nu am putut încărca companiile.');
        setCompanies([]);
      } else {
        setCompanies(data || []);
        setSelectedCompany((data || [])[0] || null);
      }
      setLoadingCompanies(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = companies.filter((c) =>
    !search
      ? true
      : (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.id || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-text-primary">
          <BarChart3 className="w-6 h-6" />
          <h2 className="text-2xl font-bold">Analytics (admin)</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Caută companie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-60"
            />
          </div>
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-text-secondary" />
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={selectedCompany?.id || ''}
              onChange={(e) => {
                const next = companies.find((c) => c.id === e.target.value) || null;
                setSelectedCompany(next);
              }}
            >
              {filtered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Fără nume'} · {c.id.slice(0, 8)}
                </option>
              ))}
              {!filtered.length && <option value="">Nicio companie găsită</option>}
            </select>
          </div>
        </div>
      </div>

      {loadingCompanies && (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">Se încarcă lista de companii…</div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm border border-red-100 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {!loadingCompanies && !error && !selectedCompany && (
        <div className="bg-white border rounded-xl p-4 text-sm text-text-secondary">
          Nu există companii de afișat.
        </div>
      )}

      {selectedCompany && (
        <ClientAnalytics
          companyId={selectedCompany.id}
          userId={null}
          title="Dashboard analytics (companie)"
          subtitle={selectedCompany.name ? `Companie: ${selectedCompany.name}` : `Companie: ${selectedCompany.id}`}
        />
      )}
    </div>
  );
}
