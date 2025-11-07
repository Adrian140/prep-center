// FILE: src/components/admin/AdminDeals.jsx
import React, { useEffect, useState } from 'react';
import { supabaseHelpers } from '../../config/supabase';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';

export default function AdminDeals({ companyId }) {
  const [deals, setDeals] = useState([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [collapsed, setCollapsed] = useState(true); // 👈 ascuns implicit

  const load = async () => {
    if (!companyId) return setDeals([]);
    const { data } = await supabaseHelpers.listCompanyDeals(companyId);
    setDeals(data || []);
  };

  useEffect(() => { load(); }, [companyId]);

  const addDeal = async (e) => {
    e.preventDefault();
    if (!title || amount === '') return;
    await supabaseHelpers.createCompanyDeal({
      company_id: companyId,
      title: title.trim(),
      amount: Number(amount),
    });
    setTitle('');
    setAmount('');
    load();
  };

  const removeDeal = async (id) => {
    await supabaseHelpers.deleteCompanyDeal(id);
    load();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      {/* === Header pliabil === */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="text-lg font-semibold text-text-primary flex items-center">
          {collapsed ? (
            <ChevronRight className="w-5 h-5 mr-2 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 mr-2 text-gray-500" />
          )}
          Deals negociate
        </h3>
        <button
          onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
          className="text-sm text-primary hover:underline"
        >
          {collapsed ? 'Afișează' : 'Ascunde'}
        </button>
      </div>

      {/* === Corpul secțiunii (ascuns / vizibil) === */}
      {!collapsed && (
        <div className="mt-5">
          <form onSubmit={addDeal} className="flex flex-wrap gap-3 mb-5">
            <input
              className="border rounded-lg px-3 py-2 flex-1 min-w-[220px]"
              placeholder="Denumire deal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2 w-40"
              placeholder="Preț"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              className="px-4 py-2 rounded-lg bg-primary text-white"
              type="submit"
            >
              Adaugă
            </button>
          </form>

          {deals.length === 0 ? (
            <div className="text-text-secondary">Nu există deal-uri încă.</div>
          ) : (
            <ul className="divide-y">
              {deals.map((d) => (
                <li key={d.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{d.title}</div>
                    <div className="text-sm text-text-secondary">
                      {Number(d.amount).toFixed(2)} €
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDeal(d.id)}
                    className="text-red-600 hover:text-red-700 inline-flex items-center"
                    title="Hide (active = false)"
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> Hide
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
