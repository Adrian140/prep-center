import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/config/supabase';
import { AlertTriangle, CheckCircle, ChevronDown, Loader2, RefreshCw } from 'lucide-react';

const INTEGRATIONS = [
  {
    id: 'amazon',
    title: 'Amazon Seller Central',
    subtitle: 'Conectari SP-API active/pending pe fiecare client.',
    visibilityField: 'amazon'
  },
  {
    id: 'profitPath',
    title: 'Profit Path',
    subtitle: 'Token + email folosite pentru mapare PrepBusiness.',
    visibilityField: 'profitPath'
  },
  {
    id: 'arbitrageOne',
    title: 'Arbitrage One',
    subtitle: 'Email + Merchant ID pentru import inbound in Receptions.',
    visibilityField: 'arbitrageOne'
  },
  {
    id: 'ups',
    title: 'UPS',
    subtitle: 'Conectari OAuth UPS si statusul contului.',
    visibilityField: 'ups'
  },
  {
    id: 'qogita',
    title: 'Qogita',
    subtitle: 'Conexiuni Qogita pentru import comenzi/shipments.',
    visibilityField: 'qogita'
  }
];

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

function IntegrationPanel({ title, subtitle, open, onToggle, children }) {
  return (
    <section className="bg-white border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

export default function AdminPrepBusinessIntegrations() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [openPanel, setOpenPanel] = useState('profitPath');

  const [profiles, setProfiles] = useState([]);
  const [prepRowsByUser, setPrepRowsByUser] = useState({});
  const [amazonByUser, setAmazonByUser] = useState({});
  const [upsByUser, setUpsByUser] = useState({});
  const [qogitaByUser, setQogitaByUser] = useState({});
  const [visibilityByUser, setVisibilityByUser] = useState({});

  const [merchantDrafts, setMerchantDrafts] = useState({});
  const [tokenDrafts, setTokenDrafts] = useState({});
  const [savingMerchant, setSavingMerchant] = useState('');
  const [savingToken, setSavingToken] = useState('');
  const [savingVisibility, setSavingVisibility] = useState('');

  const load = async () => {
    setRefreshing(true);
    setMessage('');

    const [
      profilesRes,
      prepRes,
      amazonRes,
      upsRes,
      qogitaRes,
      visibilityRes
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, company_name, store_name, email, company_id, account_type, is_admin, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('prep_business_integrations').select('*'),
      supabase
        .from('amazon_integrations')
        .select('id, user_id, status, last_error, marketplace_id, last_synced_at, updated_at, created_at'),
      supabase
        .from('ups_integrations')
        .select('id, user_id, status, last_error, connected_at, last_synced_at, updated_at'),
      supabase
        .from('qogita_connections')
        .select('id, user_id, status, qogita_email, expires_at, last_sync_at, updated_at, created_at'),
      supabase
        .from('client_integration_visibility')
        .select('user_id, company_id, show_amazon, show_profit_path, show_arbitrage_one, show_ups, show_qogita')
    ]);

    const err =
      profilesRes.error ||
      prepRes.error ||
      amazonRes.error ||
      upsRes.error ||
      qogitaRes.error ||
      visibilityRes.error;

    if (err) {
      setMessage(err.message || 'Could not load integrations.');
      setRefreshing(false);
      setLoading(false);
      return;
    }

    const clients = (profilesRes.data || [])
      .filter((row) => row?.is_admin !== true && String(row?.account_type || '').toLowerCase() !== 'admin')
      .sort((a, b) => displayClient(a).localeCompare(displayClient(b)));

    const prepMap = {};
    (prepRes.data || []).forEach((row) => {
      if (row?.user_id && !prepMap[row.user_id]) prepMap[row.user_id] = row;
    });

    const amazonMap = {};
    (amazonRes.data || []).forEach((row) => {
      if (!row?.user_id) return;
      if (!amazonMap[row.user_id]) {
        amazonMap[row.user_id] = {
          count: 0,
          status: row.status || 'pending',
          last_error: row.last_error || null,
          last_synced_at: row.last_synced_at || null
        };
      }
      const entry = amazonMap[row.user_id];
      entry.count += 1;
      if (row.status === 'error') entry.status = 'error';
      if (entry.status !== 'error' && row.status === 'active') entry.status = 'active';
      if (row.last_error) entry.last_error = row.last_error;
      if (new Date(row.last_synced_at || 0).getTime() > new Date(entry.last_synced_at || 0).getTime()) {
        entry.last_synced_at = row.last_synced_at;
      }
    });

    const upsMap = {};
    (upsRes.data || []).forEach((row) => {
      if (row?.user_id && !upsMap[row.user_id]) {
        upsMap[row.user_id] = row;
      }
    });

    const qogitaMap = {};
    (qogitaRes.data || []).forEach((row) => {
      if (!row?.user_id) return;
      if (!qogitaMap[row.user_id]) qogitaMap[row.user_id] = [];
      qogitaMap[row.user_id].push(row);
    });

    const visMap = {};
    (visibilityRes.data || []).forEach((row) => {
      if (!row?.user_id) return;
      visMap[row.user_id] = {
        amazon: row.show_amazon !== false,
        profitPath: row.show_profit_path !== false,
        arbitrageOne: row.show_arbitrage_one !== false,
        ups: row.show_ups !== false,
        qogita: row.show_qogita !== false
      };
    });

    const merchantMap = {};
    const tokenMap = {};
    Object.entries(prepMap).forEach(([userId, row]) => {
      merchantMap[userId] = row?.merchant_id ? String(row.merchant_id) : '';
      tokenMap[userId] = row?.profit_path_token_id ? String(row.profit_path_token_id) : '';
    });

    setProfiles(clients);
    setPrepRowsByUser(prepMap);
    setAmazonByUser(amazonMap);
    setUpsByUser(upsMap);
    setQogitaByUser(qogitaMap);
    setVisibilityByUser(visMap);
    setMerchantDrafts(merchantMap);
    setTokenDrafts(tokenMap);

    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    return profiles.map((profile) => {
      const prep = prepRowsByUser[profile.id] || null;
      const vis = visibilityByUser[profile.id] || {
        amazon: true,
        profitPath: true,
        arbitrageOne: true,
        ups: true,
        qogita: true
      };
      return {
        profile,
        prep,
        amazon: amazonByUser[profile.id] || null,
        ups: upsByUser[profile.id] || null,
        qogita: qogitaByUser[profile.id] || [],
        visibility: vis
      };
    });
  }, [profiles, prepRowsByUser, amazonByUser, upsByUser, qogitaByUser, visibilityByUser]);

  const upsertVisibility = async (profile, patch) => {
    if (!profile?.id) return;
    const key = `${profile.id}:${Object.keys(patch).join(',')}`;
    setSavingVisibility(key);
    try {
      const current = visibilityByUser[profile.id] || {
        amazon: true,
        profitPath: true,
        arbitrageOne: true,
        ups: true,
        qogita: true
      };
      const next = { ...current, ...patch };

      const { error } = await supabase
        .from('client_integration_visibility')
        .upsert(
          {
            user_id: profile.id,
            company_id: profile.company_id || null,
            show_amazon: next.amazon,
            show_profit_path: next.profitPath,
            show_arbitrage_one: next.arbitrageOne,
            show_ups: next.ups,
            show_qogita: next.qogita,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
      setVisibilityByUser((prev) => ({ ...prev, [profile.id]: next }));
    } catch (err) {
      setMessage(err?.message || 'Could not save visibility setting.');
    } finally {
      setSavingVisibility('');
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
      status: current.status && !['inactive', 'unassociated'].includes(current.status) ? current.status : 'pending',
      last_error: current.last_error || null,
      created_at: current.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...patch
    };

    const { data, error } = await supabase
      .from('prep_business_integrations')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();

    if (error) throw error;

    setPrepRowsByUser((prev) => ({ ...prev, [profile.id]: data || { ...payload, id: current.id || null } }));
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
        merchant_id: merchantValue || tokenValue || null
      });
      await load();
    } catch (err) {
      setMessage(err?.message || 'Could not save token.');
    } finally {
      setSavingToken('');
    }
  };

  const renderVisibilityToggle = (row, field) => {
    const checked = row.visibility?.[field] !== false;
    const savingKey = `${row.profile.id}:${field}`;
    return (
      <label className="inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={checked}
          disabled={savingVisibility === savingKey}
          onChange={(e) => upsertVisibility(row.profile, { [field]: e.target.checked })}
        />
        {checked ? 'Visible client' : 'Hidden client'}
      </label>
    );
  };

  const renderAmazonRows = () => (
    <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
      {rows.map((row) => (
        <div key={`amazon-${row.profile.id}`} className="px-4 py-3 bg-white flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px]">
            <div className="font-medium text-text-primary">{displayClient(row.profile)}</div>
            <div className="text-xs text-text-secondary">{row.profile.email || '—'}</div>
            <div className="text-xs text-text-secondary">
              Accounts: {row.amazon?.count || 0} · Last sync: {fmt(row.amazon?.last_synced_at)}
            </div>
            {row.amazon?.last_error && (
              <div className="text-xs text-red-600 break-all mt-1">{row.amazon.last_error}</div>
            )}
          </div>
          <StatusBadge status={row.amazon?.status || 'inactive'} />
          {renderVisibilityToggle(row, 'amazon')}
        </div>
      ))}
    </div>
  );

  const renderProfitPathRows = () => (
    <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
      {rows.map((row) => (
        <div key={`pp-${row.profile.id}`} className="px-4 py-3 bg-white flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[280px]">
            <div className="font-medium text-text-primary">{displayClient(row.profile)}</div>
            <div className="text-xs text-text-secondary">Email: {row.prep?.email_prep_business || row.profile.email || '—'}</div>
            <div className="text-xs text-text-secondary">Token: {row.prep?.profit_path_token_id || '—'}</div>
            <div className="text-xs text-text-secondary">Merchant ID: {row.prep?.merchant_id || '—'}</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="w-44 px-2 py-1 border rounded text-xs"
              placeholder="Profit Path token"
              value={tokenDrafts[row.profile.id] ?? ''}
              onChange={(e) => setTokenDrafts((prev) => ({ ...prev, [row.profile.id]: e.target.value }))}
            />
            <button
              onClick={() => handleSaveToken(row.profile)}
              disabled={savingToken === row.profile.id}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
            >
              {savingToken === row.profile.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save token
            </button>
          </div>
          <StatusBadge status={row.prep?.status || 'inactive'} />
          {renderVisibilityToggle(row, 'profitPath')}
        </div>
      ))}
    </div>
  );

  const renderArbitrageRows = () => (
    <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
      {rows.map((row) => (
        <div key={`a1-${row.profile.id}`} className="px-4 py-3 bg-white flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[280px]">
            <div className="font-medium text-text-primary">{displayClient(row.profile)}</div>
            <div className="text-xs text-text-secondary">Email AO: {row.prep?.email_arbitrage_one || row.profile.email || '—'}</div>
            <div className="text-xs text-text-secondary">Merchant ID: {row.prep?.merchant_id || '—'}</div>
            <div className="text-xs text-text-secondary">Last sync: {fmt(row.prep?.last_synced_at)} · Updated: {fmt(row.prep?.updated_at)}</div>
            {row.prep?.last_error && <div className="text-xs text-red-600 mt-1 break-all">{row.prep.last_error}</div>}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="w-36 px-2 py-1 border rounded text-xs"
              placeholder="Merchant ID"
              value={merchantDrafts[row.profile.id] ?? ''}
              onChange={(e) => setMerchantDrafts((prev) => ({ ...prev, [row.profile.id]: e.target.value }))}
            />
            <button
              onClick={() => handleSaveMerchant(row.profile)}
              disabled={savingMerchant === row.profile.id}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs disabled:opacity-60"
            >
              {savingMerchant === row.profile.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save ID
            </button>
          </div>
          <StatusBadge status={row.prep?.status || 'inactive'} />
          {renderVisibilityToggle(row, 'arbitrageOne')}
        </div>
      ))}
    </div>
  );

  const renderUpsRows = () => (
    <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
      {rows.map((row) => (
        <div key={`ups-${row.profile.id}`} className="px-4 py-3 bg-white flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[260px]">
            <div className="font-medium text-text-primary">{displayClient(row.profile)}</div>
            <div className="text-xs text-text-secondary">{row.profile.email || '—'}</div>
            <div className="text-xs text-text-secondary">Connected: {fmt(row.ups?.connected_at)} · Last sync: {fmt(row.ups?.last_synced_at)}</div>
            {row.ups?.last_error && <div className="text-xs text-red-600 mt-1 break-all">{row.ups.last_error}</div>}
          </div>
          <StatusBadge status={row.ups?.status || 'inactive'} />
          {renderVisibilityToggle(row, 'ups')}
        </div>
      ))}
    </div>
  );

  const renderQogitaRows = () => (
    <div className="divide-y border border-gray-200 rounded-xl overflow-hidden">
      {rows.map((row) => {
        const connections = row.qogita || [];
        const latest = connections[0] || null;
        const status = latest?.status || (connections.length ? 'active' : 'inactive');
        return (
          <div key={`qogita-${row.profile.id}`} className="px-4 py-3 bg-white flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[260px]">
              <div className="font-medium text-text-primary">{displayClient(row.profile)}</div>
              <div className="text-xs text-text-secondary">Connections: {connections.length}</div>
              <div className="text-xs text-text-secondary">Email: {latest?.qogita_email || '—'} · Last sync: {fmt(latest?.last_sync_at)}</div>
              {latest?.expires_at && (
                <div className="text-xs text-text-secondary">Expires: {fmt(latest.expires_at)}</div>
              )}
            </div>
            <StatusBadge status={status} />
            {renderVisibilityToggle(row, 'qogita')}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Admin Integrations</h3>
          <p className="text-sm text-text-secondary">Panouri per integrare. In fiecare panel vezi toti clientii si setarea hide/unhide pentru acea integrare.</p>
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
              subtitle={integration.subtitle}
              open={openPanel === integration.id}
              onToggle={() => setOpenPanel((prev) => (prev === integration.id ? '' : integration.id))}
            >
              {integration.id === 'amazon' && renderAmazonRows()}
              {integration.id === 'profitPath' && renderProfitPathRows()}
              {integration.id === 'arbitrageOne' && renderArbitrageRows()}
              {integration.id === 'ups' && renderUpsRows()}
              {integration.id === 'qogita' && renderQogitaRows()}
            </IntegrationPanel>
          ))}
        </div>
      )}
    </div>
  );
}
