import React, { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useNavigate } from 'react-router-dom';
import { useT } from '@/i18n/useT';
import { supabaseHelpers } from '@/config/supabase';

export default function MarketSelector() {
  const t = useT();
  const navigate = useNavigate();
  const { currentMarket, availableMarkets, setMarket, enableMarket, markets } = useMarket();
  const { isAuthenticated, user, profile, updateProfile } = useSupabaseAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [vatValue, setVatValue] = useState('');
  const [vatError, setVatError] = useState('');
  const [vatSaving, setVatSaving] = useState(false);
  const [showVatModal, setShowVatModal] = useState(false);

  const isAdmin = Boolean(
    profile?.account_type === 'admin' || user?.user_metadata?.account_type === 'admin'
  );

  const items = useMemo(
    () =>
      Object.entries(markets).map(([code, meta]) => ({
        code,
        label: meta.name,
        flag: meta.flag
      })),
    [markets]
  );

  const active =
    items.find((item) => item.code === currentMarket) ||
    items[0] || { flag: '🏳️', label: currentMarket || '—' };

  useEffect(() => {
    const onMarket = () => setOpen(false);
    window.addEventListener('market:changed', onMarket);
    return () => window.removeEventListener('market:changed', onMarket);
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  const handleSelect = (code) => {
    if (availableMarkets.includes(code)) {
      setMarket(code);
      setOpen(false);
      return;
    }
    if (!isAdmin) {
      setPending(code);
      setOpen(false);
    }
  };

  const confirmSameAccount = async () => {
    if (!pending) return;
    setVatValue('');
    setVatError('');
    setShowVatModal(true);
  };

  const confirmNewAccount = () => {
    if (!pending) return;
    const affiliate = profile?.affiliate_code_input || profile?.affiliate_code || '';
    const affiliateParam = affiliate ? `&affiliate=${encodeURIComponent(affiliate)}` : '';
    const target = `/register?country=${pending}${affiliateParam}`;
    setPending(null);
    navigate(target);
  };

  const normalizeVat = (vatRaw, country) => {
    const trimmed = String(vatRaw || '').toUpperCase().replace(/\s+/g, '');
    if (!trimmed) return '';
    if (trimmed.startsWith(country)) return trimmed;
    return `${country}${trimmed}`;
  };

  const saveVatProfile = async () => {
    if (!pending || !user) return;
    const country = pending;
    const vat = normalizeVat(vatValue, country);
    if (!vat) {
      setVatError(t('market.vatRequired', 'Completează codul TVA'));
      return;
    }
    setVatSaving(true);
    setVatError('');
    const payload = {
      user_id: user.id,
      type: profile?.account_type === 'company' ? 'company' : 'individual',
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      company_name: profile?.company_name || '',
      vat_number: vat,
      country,
      address: profile?.company_address || '',
      city: profile?.company_city || '',
      postal_code: profile?.company_postal_code || '',
      phone: profile?.phone || '',
      is_default: false
    };
    const { error } = await supabaseHelpers.createBillingProfile(payload);
    if (error) {
      setVatError(error.message || t('market.vatSaveError', 'Nu am putut salva TVA-ul'));
      setVatSaving(false);
      return;
    }

    enableMarket(country);
    if (updateProfile) {
      const existing = Array.isArray(profile?.allowed_markets) ? profile.allowed_markets : [];
      const next = Array.from(new Set([...(existing || []), country]));
      try {
        await updateProfile({ allowed_markets: next });
      } catch {
        // ignore persistence errors
      }
    }
    setVatSaving(false);
    setShowVatModal(false);
    setPending(null);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 shadow-sm min-w-[140px] justify-between"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('market.selectorLabel', 'Select market')}
        >
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-500" />
            <span className="text-lg leading-none">{active.flag}</span>
            <span className="text-sm font-medium">{active.label}</span>
          </span>
          <span className="ml-1 text-xs text-gray-500">▾</span>
        </button>

        {open && (
          <ul
            className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg max-h-80 overflow-auto z-50"
            role="listbox"
          >
            {items.map((item) => (
              <li
                key={item.code}
                role="option"
                aria-selected={item.code === currentMarket}
                onClick={() => handleSelect(item.code)}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2 ${
                  item.code === currentMarket ? 'bg-gray-50 font-medium' : ''
                }`}
              >
                <span className="text-lg leading-none">{item.flag}</span>
                <span className="text-sm">{item.label}</span>
                {item.code === currentMarket ? (
                  <span className="ml-auto text-primary">✓</span>
                ) : null}
                {!availableMarkets.includes(item.code) ? (
                  <span className="ml-auto text-[10px] text-gray-400">
                    {t('market.new', 'new')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="text-lg font-semibold text-text-primary">
              {t('market.promptTitle', 'New market')}
            </div>
            <p className="text-sm text-text-secondary">
              {t(
                'market.promptBody',
                'Vrei sa creezi un cont nou pentru aceasta tara sau sa folosesti aceleasi date ca in contul curent?'
              )}
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setPending(null)}
                className="px-3 py-1.5 rounded-lg border text-sm text-text-secondary"
              >
                 {t('market.promptCancel', 'Anuleaza')}
              </button>
              <button
                onClick={confirmNewAccount}
                className="px-3 py-1.5 rounded-lg border text-sm"
              >
                {t('market.promptNew', 'Creeaza cont nou')}
              </button>
              <button
                onClick={confirmSameAccount}
                className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm"
              >
                {t('market.promptSame', 'Foloseste aceleasi date')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVatModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="text-lg font-semibold text-text-primary">
              {t('market.vatTitle', 'Adaugă cod TVA pentru ')}
              {pending}
            </div>
            <p className="text-sm text-text-secondary">
              {t('market.vatSubtitle', 'Pentru acest depozit avem nevoie de codul TVA al țării selectate.')}
            </p>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                {t('billing.form.vat', 'VAT')}
              </label>
              <input
                type="text"
                className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder={`${pending}...`}
                value={vatValue}
                onChange={(e) => setVatValue(e.target.value)}
                autoFocus
              />
              {vatError && <p className="text-sm text-red-600">{vatError}</p>}
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => {
                  setShowVatModal(false);
                  setVatSaving(false);
                  setVatError('');
                }}
                className="px-3 py-1.5 rounded-lg border text-sm text-text-secondary"
                disabled={vatSaving}
              >
                {t('common.cancel', 'Anuleaza')}
              </button>
              <button
                onClick={saveVatProfile}
                className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm disabled:opacity-60"
                disabled={vatSaving}
              >
                {vatSaving ? t('common.saving', 'Se salvează...') : t('market.vatSave', 'Salvează TVA')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
