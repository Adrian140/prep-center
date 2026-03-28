import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/config/supabase';
import { AlertTriangle, CheckCircle, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { useEtsyI18n } from '@/i18n/etsyI18n';

const INTEGRATIONS_KEY = 'integrations_visibility';
const AMAZON_PAGE_SIZE = 10;

const INTEGRATIONS = [
  {
    id: 'amazon',
    title: 'Amazon Seller Central',
    subtitle: 'Conectari SP-API active/pending.',
    settingField: 'amazon',
    logo: '/branding/integrations/amazon.jpg',
    fallbackLogo: '/branding/integrations/amazon.jpg'
  },
  {
    id: 'etsy',
    title: 'Etsy',
    subtitle: '',
    settingField: 'etsy',
    logo: 'https://logo.clearbit.com/etsy.com',
    fallbackLogo: '/branding/integrations/etsy.svg'
  },
  {
    id: 'profitPath',
    title: 'Profit Path',
    subtitle: 'Token + email pentru mapare PrepBusiness.',
    settingField: 'profitPath',
    logo: '/branding/integrations/profit-path.png',
    fallbackLogo: '/branding/integrations/profit-path.png'
  },
  {
    id: 'profitDesk',
    title: 'ProfitDesk',
    subtitle: 'Token + email pentru mapare ProfitDesk.',
    settingField: 'profitDesk',
    logo: '/branding/integrations/profit-desk.svg',
    fallbackLogo: '/branding/integrations/profit-desk.svg'
  },
  {
    id: 'arbitrageOne',
    title: 'Arbitrage One',
    subtitle: 'Email + Merchant ID pentru inbound sync.',
    settingField: 'arbitrageOne',
    logo: '/branding/integrations/arbitrage-one.svg',
    fallbackLogo: '/branding/integrations/arbitrage-one.svg'
  },
  {
    id: 'ups',
    title: 'UPS',
    subtitle: 'Conectari UPS OAuth si status cont.',
    settingField: 'ups',
    logo: 'https://logo.clearbit.com/ups.com',
    fallbackLogo: '/branding/integrations/ups.svg'
  },
  {
    id: 'qogita',
    title: 'Qogita',
    subtitle: 'Conexiuni Qogita active.',
    settingField: 'qogita',
    logo: 'https://logo.clearbit.com/qogita.com',
    fallbackLogo: '/branding/integrations/qogita.svg'
  }
];

const defaultVisibility = {
  amazon: true,
  etsy: true,
  profitPath: true,
  profitDesk: true,
  arbitrageOne: true,
  ups: true,
  qogita: true
};

const fmt = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const displayClient = (profile) => {
  if (!profile) return 'Client necunoscut';
  return (
    profile.company_name ||
    profile.store_name ||
    `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
    profile.email ||
    profile.id
  );
};

function StatusBadge({ status }) {
  if (status === 'active' || status === 'mapped') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
        <CheckCircle className="w-3 h-3" /> Active
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">
        <AlertTriangle className="w-3 h-3" /> Error
      </span>
    );
  }
  if (status === 'inactive' || status === 'unassociated') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">Inactive</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700">Pending</span>;
}

function IntegrationPanel({ title, subtitle, logo, fallbackLogo, open, onToggle, visible, onVisibilityChange, children }) {
  const [imgSrc, setImgSrc] = useState(logo);

  useEffect(() => {
    setImgSrc(logo);
  }, [logo]);

  return (
    <section className="bg-white border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
      >
        <img
          src={imgSrc}
          alt={title}
          onError={() => {
            if (fallbackLogo && imgSrc !== fallbackLogo) setImgSrc(fallbackLogo);
          }}
          className="w-20 h-14 rounded-lg object-contain border bg-white p-1"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={visible} onChange={(e) => onVisibilityChange(e.target.checked)} />
            Visible pentru toti clientii
          </label>
          {children}
        </div>
      )}
    </section>
  );
}

export default function AdminPrepBusinessIntegrations() {
  const { t: et } = useEtsyI18n();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [openPanel, setOpenPanel] = useState('');

  const [profilesById, setProfilesById] = useState({});
  const [prepRowsByUser, setPrepRowsByUser] = useState({});
  const [amazonByUser, setAmazonByUser] = useState({});
  const [etsyByUser, setEtsyByUser] = useState({});
  const [upsByUser, setUpsByUser] = useState({});
  const [qogitaByUser, setQogitaByUser] = useState({});

  const [globalVisibility, setGlobalVisibility] = useState(defaultVisibility);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const [merchantDrafts, setMerchantDrafts] = useState({});
  const [tokenDrafts, setTokenDrafts] = useState({});
  const [deskTokenDrafts, setDeskTokenDrafts] = useState({});
  const [savingMerchant, setSavingMerchant] = useState('');
  const [savingToken, setSavingToken] = useState('');
  const [savingDeskToken, setSavingDeskToken] = useState('');
  const [amazonPage, setAmazonPage] = useState(1);

  const load = async () => {
    setRefreshing(true);
    setMessage('');

    const [profilesRes, prepRes, amazonRes, etsyRes, upsRes, qogitaRes, settingsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, company_name, store_name, email, company_id, account_type, is_admin'),
      supabase.from('prep_business_integrations').select('*'),
      supabase
        .from('amazon_integrations')
        .select('id, user_id, company_id, status, last_error, last_synced_at, updated_at, created_at, marketplace_id, region'),
      supabase
        .from('etsy_integrations')
        .select('id, user_id, company_id, status, shop_id, shop_name, shop_url, last_error, connected_at, last_synced_at, updated_at'),
      supabase
        .from('ups_integrations')
        .select('id, user_id, status, last_error, connected_at, last_synced_at, updated_at'),
      supabase
        .from('qogita_connections')
        .select('id, user_id, status, qogita_email, expires_at, last_sync_at, updated_at, created_at')
        .order('updated_at', { ascending: false }),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', INTEGRATIONS_KEY)
        .maybeSingle()
    ]);

    const err = profilesRes.error || prepRes.error || amazonRes.error || etsyRes.error || upsRes.error || qogitaRes.error || settingsRes.error;
    if (err) {
      setMessage(err.message || et('admin.flash.loadError'));
      setRefreshing(false);
      setLoading(false);
      return;
    }

    const profilesMap = {};
    (profilesRes.data || [])
      .filter((row) => row?.is_admin !== true && String(row?.account_type || '').toLowerCase() !== 'admin')
      .forEach((row) => {
        profilesMap[row.id] = row;
      });

    const prepMap = {};
    (prepRes.data || []).forEach((row) => {
      if (row?.user_id && !prepMap[row.user_id]) prepMap[row.user_id] = row;
    });

    const profileIdByCompanyId = {};
    Object.values(profilesMap).forEach((profile) => {
      if (!profile?.company_id || profileIdByCompanyId[profile.company_id]) return;
      profileIdByCompanyId[profile.company_id] = profile.id;
    });

    const amazonMap = {};
    (amazonRes.data || []).forEach((row) => {
      const integrationKey =
        row?.user_id ||
        (row?.company_id ? `company:${row.company_id}` : null);
      if (!integrationKey) return;
      if (!amazonMap[integrationKey]) {
        amazonMap[integrationKey] = {
          user_id: row?.user_id || null,
          company_id: row?.company_id || null,
          profile_id: row?.user_id || profileIdByCompanyId[row?.company_id] || null,
          count: 0,
          status: row.status || 'pending',
          last_error: row.last_error || null,
          last_synced_at: row.last_synced_at || null,
          marketplace_ids: new Set()
        };
      }
      const entry = amazonMap[integrationKey];
      entry.count += 1;
      if (row.status === 'error') entry.status = 'error';
      if (entry.status !== 'error' && row.status === 'active') entry.status = 'active';
      if (row.last_error) entry.last_error = row.last_error;
      if (row.marketplace_id) entry.marketplace_ids.add(String(row.marketplace_id));
      if (new Date(row.last_synced_at || 0).getTime() > new Date(entry.last_synced_at || 0).getTime()) {
        entry.last_synced_at = row.last_synced_at;
      }
    });

    const upsMap = {};
    (upsRes.data || []).forEach((row) => {
      if (row?.user_id && !upsMap[row.user_id]) upsMap[row.user_id] = row;
    });

    const etsyMap = {};
    (etsyRes.data || []).forEach((row) => {
      if (row?.user_id && !etsyMap[row.user_id]) etsyMap[row.user_id] = row;
    });

    const qogitaMap = {};
    (qogitaRes.data || []).forEach((row) => {
      if (!row?.user_id) return;
      if (!qogitaMap[row.user_id]) qogitaMap[row.user_id] = [];
      qogitaMap[row.user_id].push(row);
    });

    const merchantMap = {};
    const tokenMap = {};
    const deskTokenMap = {};
    Object.entries(prepMap).forEach(([userId, row]) => {
      merchantMap[userId] = row?.merchant_id ? String(row.merchant_id) : '';
      tokenMap[userId] = row?.profit_path_token_id ? String(row.profit_path_token_id) : '';
      deskTokenMap[userId] = row?.profit_desk_token_id ? String(row.profit_desk_token_id) : '';
    });

    const settingsValue = settingsRes.data?.value || {};
    setGlobalVisibility({
      amazon: settingsValue.amazon !== false,
      etsy: settingsValue.etsy !== false,
      profitPath: settingsValue.profitPath !== false,
      profitDesk: settingsValue.profitDesk !== false,
      arbitrageOne: settingsValue.arbitrageOne !== false,
      ups: settingsValue.ups !== false,
      qogita: settingsValue.qogita !== false
    });

    setProfilesById(profilesMap);
    setPrepRowsByUser(prepMap);
    setAmazonByUser(amazonMap);
    setEtsyByUser(etsyMap);
    setUpsByUser(upsMap);
    setQogitaByUser(qogitaMap);
    setMerchantDrafts(merchantMap);
    setTokenDrafts(tokenMap);
    setDeskTokenDrafts(deskTokenMap);

    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveGlobalVisibility = async (field, value) => {
    setSavingVisibility(true);
    const next = { ...globalVisibility, [field]: value };
    setGlobalVisibility(next);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: INTEGRATIONS_KEY,
          value: next,
          updated_at: new Date().toISOString()
        });
      if (error) throw error;
    } catch (err) {
      setMessage(err?.message || 'Could not save global visibility.');
      await load();
    } finally {
      setSavingVisibility(false);
    }
  };

  const upsertPrep = async (profile, patch = {}) => {
    const current = prepRowsByUser[profile.id] || {};
    const payload = {
      id: current.id || undefined,
      user_id: profile.id,
      company_id: current.company_id || profile.company_id || null,
      email_arbitrage_one: current.email_arbitrage_one || current.email_prep_business || profile.email || null,
      email_prep_business: current.email_prep_business || current.email_arbitrage_one || profile.email || null,
      merchant_id: current.merchant_id || null,
      profit_path_token_id: current.profit_path_token_id || null,
      email_profit_desk: current.email_profit_desk || profile.email || null,
      profit_desk_token_id: current.profit_desk_token_id || null,
      status: patch.status || (current.status && !['inactive', 'unassociated'].includes(current.status) ? current.status : 'pending'),
      last_error: current.last_error || null,
      created_at: current.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...patch
    };

    const { error } = await supabase
      .from('prep_business_integrations')
      .upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
  };

  const handleSaveMerchant = async (profile) => {
    const userId = profile?.id;
    if (!userId) return;
    setSavingMerchant(userId);
    try {
      const merchantValue = String(merchantDrafts[userId] || '').trim();
      const tokenValue = String(tokenDrafts[userId] || '').trim();
      await upsertPrep(profile, {
        merchant_id: merchantValue || null,
        profit_path_token_id: tokenValue || merchantValue || null
      });
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not save merchant id.');
    } finally {
      setSavingMerchant('');
    }
  };

  const handleSaveToken = async (profile) => {
    const userId = profile?.id;
    if (!userId) return;
    setSavingToken(userId);
    try {
      const tokenValue = String(tokenDrafts[userId] || '').trim();
      const merchantValue = String(merchantDrafts[userId] || '').trim();
      await upsertPrep(profile, {
        profit_path_token_id: tokenValue || null,
        merchant_id: merchantValue || tokenValue || null,
        status: 'active'
      });
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not save token.');
    } finally {
      setSavingToken('');
    }
  };

  const handleSaveDeskToken = async (profile) => {
    const userId = profile?.id;
    if (!userId) return;
    setSavingDeskToken(userId);
    try {
      const tokenValue = String(deskTokenDrafts[userId] || '').trim();
      await upsertPrep(profile, {
        profit_desk_token_id: tokenValue || null,
        email_profit_desk: prepRowsByUser[userId]?.email_profit_desk || profile.email || null,
        status: 'active'
      });
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not save ProfitDesk token.');
    } finally {
      setSavingDeskToken('');
    }
  };

  const amazonRows = useMemo(() => {
    return Object.entries(amazonByUser)
      .map(([rowKey, item]) => ({
        rowKey,
        item,
        profile: item?.profile_id ? profilesById[item.profile_id] : null
      }))
      .sort((a, b) => displayClient(a.profile).localeCompare(displayClient(b.profile)));
  }, [amazonByUser, profilesById]);

  const amazonTotalPages = Math.max(1, Math.ceil(amazonRows.length / AMAZON_PAGE_SIZE));
  const safeAmazonPage = Math.min(amazonPage, amazonTotalPages);
  const amazonPageRows = useMemo(() => {
    const from = (safeAmazonPage - 1) * AMAZON_PAGE_SIZE;
    return amazonRows.slice(from, from + AMAZON_PAGE_SIZE);
  }, [amazonRows, safeAmazonPage]);

  useEffect(() => {
    if (amazonPage > amazonTotalPages) {
      setAmazonPage(amazonTotalPages);
    }
  }, [amazonPage, amazonTotalPages]);

  const profitPathRows = useMemo(() => {
    return Object.entries(prepRowsByUser)
      .filter(([, row]) => {
        const status = String(row?.status || '').toLowerCase();
        const activeStatus = ['active', 'mapped', 'error', 'pending'].includes(status);
        return Boolean(row?.profit_path_token_id || (row?.email_prep_business && activeStatus));
      })
      .map(([userId, row]) => ({ userId, row, profile: profilesById[userId] }))
      .sort((a, b) => displayClient(a.profile).localeCompare(displayClient(b.profile)));
  }, [prepRowsByUser, profilesById]);

  const profitDeskRows = useMemo(() => {
    return Object.entries(prepRowsByUser)
      .filter(([, row]) => {
        const status = String(row?.status || '').toLowerCase();
        const activeStatus = ['active', 'mapped', 'error', 'pending'].includes(status);
        return Boolean(row?.profit_desk_token_id || (row?.email_profit_desk && activeStatus));
      })
      .map(([userId, row]) => ({ userId, row, profile: profilesById[userId] }))
      .sort((a, b) => displayClient(a.profile).localeCompare(displayClient(b.profile)));
  }, [prepRowsByUser, profilesById]);

  const arbitrageRows = useMemo(() => {
    return Object.entries(prepRowsByUser)
      .filter(([, row]) => {
        const status = String(row?.status || '').toLowerCase();
        const activeStatus = ['active', 'mapped', 'error', 'pending'].includes(status);
        return Boolean(row?.email_arbitrage_one || row?.merchant_id || activeStatus);
      })
      .map(([userId, row]) => ({ userId, row, profile: profilesById[userId] }))
      .sort((a, b) => displayClient(a.profile).localeCompare(displayClient(b.profile)));
  }, [prepRowsByUser, profilesById]);

  const upsRows = useMemo(() => {
    return Object.entries(upsByUser)
      .map(([userId, row]) => ({ userId, row, profile: profilesById[userId] }))
      .sort((a, b) => displayClient(a.profile).localeCompare(displayClient(b.profile)));
  }, [upsByUser, profilesById]);

  const etsyRows = useMemo(() => {
    return Object.entries(etsyByUser)
      .map(([userId, row]) => ({ userId, row, profile: profilesById[userId] }))
      .sort((a, b) => displayClient(a.profile).localeCompare(displayClient(b.profile)));
  }, [etsyByUser, profilesById]);

  const qogitaRows = useMemo(() => {
    return Object.entries(qogitaByUser)
      .map(([userId, rows]) => ({ userId, rows, profile: profilesById[userId] }))
      .sort((a, b) => displayClient(a.profile).localeCompare(displayClient(b.profile)));
  }, [qogitaByUser, profilesById]);

  const emptyBlock = <div className="text-sm text-text-secondary border rounded-lg p-4">Niciun client pentru integrarea asta.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Admin Integrations</h3>
          <p className="text-sm text-text-secondary">Setari globale hide/unhide per integrare + lista doar cu clientii care au integrarea activa/configurata.</p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-primary text-primary rounded-lg disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading integrations…
        </div>
      ) : (
        <div className="space-y-3">
          {INTEGRATIONS.map((integration) => (
          <IntegrationPanel
            key={integration.id}
            title={integration.title}
            subtitle={integration.id === 'etsy' ? et('admin.integrationCardSubtitle') : integration.subtitle}
            logo={integration.logo}
            fallbackLogo={integration.fallbackLogo}
              open={openPanel === integration.id}
              onToggle={() => setOpenPanel((prev) => (prev === integration.id ? '' : integration.id))}
              visible={globalVisibility[integration.settingField] !== false}
              onVisibilityChange={(value) => saveGlobalVisibility(integration.settingField, value)}
            >
              {savingVisibility && <div className="text-xs text-text-secondary">Saving visibility…</div>}

              {integration.id === 'amazon' && (
                amazonRows.length ? (
                  <div className="space-y-3">
                    <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                    {amazonPageRows.map(({ rowKey, item, profile }) => (
                      <div key={`amazon-${rowKey}`} className="px-4 py-3 bg-white flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[260px]">
                          <div className="font-medium text-text-primary">
                            {profile ? displayClient(profile) : (item.company_id ? `Company ${item.company_id}` : 'Client necunoscut')}
                          </div>
                          <div className="text-xs text-text-secondary">{profile?.email || '—'}</div>
                          <div className="text-xs text-text-secondary">
                            Accounts: {item.count || 0}
                            {' · '}
                            Marketplaces: {item.marketplace_ids?.size || 0}
                            {' · '}
                            Last sync: {fmt(item.last_synced_at)}
                          </div>
                          {item.last_error && <div className="text-xs text-red-600 break-all mt-1">{item.last_error}</div>}
                        </div>
                        <StatusBadge status={item.status || 'inactive'} />
                      </div>
                    ))}
                  </div>
                  {amazonRows.length > AMAZON_PAGE_SIZE && (
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span>Page {safeAmazonPage} / {amazonTotalPages}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAmazonPage((p) => Math.max(1, p - 1))}
                          disabled={safeAmazonPage <= 1}
                          className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmazonPage((p) => Math.min(amazonTotalPages, p + 1))}
                          disabled={safeAmazonPage >= amazonTotalPages}
                          className="px-2 py-1 rounded border border-gray-200 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                ) : emptyBlock
              )}

              {integration.id === 'etsy' && (
                etsyRows.length ? (
                  <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                    {etsyRows.map(({ userId, row, profile }) => (
                      <div key={`etsy-${userId}`} className="px-4 py-3 bg-white flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[260px]">
                          <div className="font-medium text-text-primary">{displayClient(profile)}</div>
                          <div className="text-xs text-text-secondary">{profile?.email || '—'}</div>
                          <div className="text-xs text-text-secondary">
                            Shop: {row.shop_name || row.shop_id || '—'} · URL: {row.shop_url || '—'}
                          </div>
                          <div className="text-xs text-text-secondary">
                            Connected: {fmt(row.connected_at)} · Last sync: {fmt(row.last_synced_at)}
                          </div>
                          {row.last_error && <div className="text-xs text-red-600 mt-1 break-all">{row.last_error}</div>}
                        </div>
                        <StatusBadge status={row.status || 'inactive'} />
                      </div>
                    ))}
                  </div>
                ) : emptyBlock
              )}

              {integration.id === 'profitPath' && (
                profitPathRows.length ? (
                  <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                    {profitPathRows.map(({ userId, row, profile }) => (
                      <div key={`pp-${userId}`} className="px-4 py-3 bg-white flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-[280px]">
                          <div className="font-medium text-text-primary">{displayClient(profile)}</div>
                          <div className="text-xs text-text-secondary">Email: {row.email_prep_business || profile?.email || '—'}</div>
                          <div className="text-xs text-text-secondary">Token: {row.profit_path_token_id || '—'}</div>
                          <div className="text-xs text-text-secondary">Merchant ID: {row.merchant_id || '—'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="w-44 px-2 py-1 border rounded text-xs"
                            placeholder="Profit Path token"
                            value={tokenDrafts[userId] ?? ''}
                            onChange={(e) => setTokenDrafts((prev) => ({ ...prev, [userId]: e.target.value }))}
                          />
                          <button
                            onClick={() => handleSaveToken(profile)}
                            disabled={savingToken === userId}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
                          >
                            {savingToken === userId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Save token
                          </button>
                        </div>
                        <StatusBadge status={row.status || 'inactive'} />
                      </div>
                    ))}
                  </div>
                ) : emptyBlock
              )}

              {integration.id === 'profitDesk' && (
                profitDeskRows.length ? (
                  <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                    {profitDeskRows.map(({ userId, row, profile }) => (
                      <div key={`pd-${userId}`} className="px-4 py-3 bg-white flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-[280px]">
                          <div className="font-medium text-text-primary">{displayClient(profile)}</div>
                          <div className="text-xs text-text-secondary">Email: {row.email_profit_desk || profile?.email || '—'}</div>
                          <div className="text-xs text-text-secondary">Token: {row.profit_desk_token_id || '—'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="w-44 px-2 py-1 border rounded text-xs"
                            placeholder="ProfitDesk token"
                            value={deskTokenDrafts[userId] ?? ''}
                            onChange={(e) => setDeskTokenDrafts((prev) => ({ ...prev, [userId]: e.target.value }))}
                          />
                          <button
                            onClick={() => handleSaveDeskToken(profile)}
                            disabled={savingDeskToken === userId}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
                          >
                            {savingDeskToken === userId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Save token
                          </button>
                        </div>
                        <StatusBadge status={row.status || 'inactive'} />
                      </div>
                    ))}
                  </div>
                ) : emptyBlock
              )}

              {integration.id === 'arbitrageOne' && (
                arbitrageRows.length ? (
                  <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                    {arbitrageRows.map(({ userId, row, profile }) => (
                      <div key={`a1-${userId}`} className="px-4 py-3 bg-white flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-[280px]">
                          <div className="font-medium text-text-primary">{displayClient(profile)}</div>
                          <div className="text-xs text-text-secondary">Email AO: {row.email_arbitrage_one || profile?.email || '—'}</div>
                          <div className="text-xs text-text-secondary">Merchant ID: {row.merchant_id || '—'}</div>
                          <div className="text-xs text-text-secondary">Last sync: {fmt(row.last_synced_at)} · Updated: {fmt(row.updated_at)}</div>
                          {row.last_error && <div className="text-xs text-red-600 mt-1 break-all">{row.last_error}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="w-36 px-2 py-1 border rounded text-xs"
                            placeholder="Merchant ID"
                            value={merchantDrafts[userId] ?? ''}
                            onChange={(e) => setMerchantDrafts((prev) => ({ ...prev, [userId]: e.target.value }))}
                          />
                          <button
                            onClick={() => handleSaveMerchant(profile)}
                            disabled={savingMerchant === userId}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
                          >
                            {savingMerchant === userId ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Save ID
                          </button>
                        </div>
                        <StatusBadge status={row.status || 'inactive'} />
                      </div>
                    ))}
                  </div>
                ) : emptyBlock
              )}

              {integration.id === 'ups' && (
                upsRows.length ? (
                  <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                    {upsRows.map(({ userId, row, profile }) => (
                      <div key={`ups-${userId}`} className="px-4 py-3 bg-white flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[260px]">
                          <div className="font-medium text-text-primary">{displayClient(profile)}</div>
                          <div className="text-xs text-text-secondary">{profile?.email || '—'}</div>
                          <div className="text-xs text-text-secondary">Connected: {fmt(row.connected_at)} · Last sync: {fmt(row.last_synced_at)}</div>
                          {row.last_error && <div className="text-xs text-red-600 mt-1 break-all">{row.last_error}</div>}
                        </div>
                        <StatusBadge status={row.status || 'inactive'} />
                      </div>
                    ))}
                  </div>
                ) : emptyBlock
              )}

              {integration.id === 'qogita' && (
                qogitaRows.length ? (
                  <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
                    {qogitaRows.map(({ userId, rows, profile }) => {
                      const latest = rows[0] || null;
                      const status = latest?.status || (rows.length ? 'active' : 'inactive');
                      return (
                        <div key={`qogita-${userId}`} className="px-4 py-3 bg-white flex flex-wrap items-center gap-3">
                          <div className="flex-1 min-w-[260px]">
                            <div className="font-medium text-text-primary">{displayClient(profile)}</div>
                            <div className="text-xs text-text-secondary">Connections: {rows.length}</div>
                            <div className="text-xs text-text-secondary">Email: {latest?.qogita_email || '—'} · Last sync: {fmt(latest?.last_sync_at)}</div>
                            {latest?.expires_at && <div className="text-xs text-text-secondary">Expires: {fmt(latest.expires_at)}</div>}
                          </div>
                          <StatusBadge status={status} />
                        </div>
                      );
                    })}
                  </div>
                ) : emptyBlock
              )}
            </IntegrationPanel>
          ))}
        </div>
      )}
    </div>
  );
}
