import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCcw, Trash2, Upload, CheckCircle2, Pencil, X, Mail, Search } from 'lucide-react';
import Section from '../common/Section';
import { supabase, supabaseHelpers } from '../../config/supabase';
import { useMarket } from '@/contexts/MarketContext';
import { normalizeMarketCode } from '@/utils/market';
import { buildPrepQtyPatch, getPrepQtyForMarket } from '@/utils/marketStock';

const statusOptions = ['pending', 'processing', 'done', 'cancelled'];
const returnServiceOptions = [
  { value: 'Return fee', label: 'Return fee' },
  { value: 'Return km', label: 'Km până la punctul de predare' },
  { value: 'Transport', label: 'Transport' }
];
const formatMoney = (value) => (Number.isFinite(value) ? Number(value).toFixed(2) : '0.00');
const formatInvoiceTooltip = (invoice) => {
  if (!invoice) return null;
  const formattedDate = invoice.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString('ro-RO')
    : null;
  return `Factură #${invoice.invoice_number}${formattedDate ? ` · ${formattedDate}` : ''}`;
};
const createServiceDraft = () => ({
  service: 'Return fee',
  service_date: new Date().toISOString().slice(0, 10),
  unit_price: '',
  units: '1',
  amount: '',
  transport_tracking_id: '',
  obs_admin: ''
});
const buildReturnGroupLabel = (items = []) => {
  const asins = Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((it) => String(it?.asin || it?.stock_item?.asin || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );
  return `Retur ${asins.join(',') || '-'}`;
};
const todayLocalStr = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

export default function AdminReturns({
  reload,
  companyId = null,
  profile = null,
  currentMarket: currentMarketProp = null,
  returnServiceRows = [],
  billingSelectedLines = {},
  onToggleBillingSelection,
  canSelectForBilling = false,
  onSelectAllUninvoiced
}) {
  const { currentMarket } = useMarket();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState({});
  const [serviceDrafts, setServiceDrafts] = useState({});
  const [sendingMailId, setSendingMailId] = useState(null);
  const [sendingTodayMails, setSendingTodayMails] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    let query = supabase
      .from('returns')
      .select(`
        id,
        company_id,
        user_id,
        marketplace,
        warehouse_country,
        country,
        status,
        notes,
        created_at,
        updated_at,
        done_at,
        stock_adjusted,
        return_items (
          id,
          asin,
          sku,
          qty,
          notes,
          stock_item_id
        ),
        return_files (id, file_type, url, name)
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    if (profile?.id) {
      query = query.eq('user_id', profile.id);
    }
    const marketCode = normalizeMarketCode(currentMarketProp || currentMarket);
    if (marketCode) {
      query = query.eq('warehouse_country', marketCode);
    }
    let { data, error: err } = await query;
    if (err && marketCode && String(err.message || '').toLowerCase().includes('warehouse_country')) {
      let retry = supabase
        .from('returns')
        .select(`
        id,
        company_id,
        user_id,
        marketplace,
        warehouse_country,
        country,
        status,
        notes,
        created_at,
        updated_at,
        done_at,
          stock_adjusted,
          return_items (
            id,
            asin,
            sku,
            qty,
            notes,
            stock_item_id
          ),
          return_files (id, file_type, url, name)
        `);
      if (companyId) {
        retry = retry.eq('company_id', companyId);
      }
      if (profile?.id) {
        retry = retry.eq('user_id', profile.id);
      }
      const retryResult = await retry
        .order('created_at', { ascending: false })
        .limit(200);
      data = retryResult.data;
      err = retryResult.error;
    }
    if (err) setError(err.message);
    let baseRows = Array.isArray(data) ? data : [];

    const createSignedUrl = async (path) => {
      if (!path) return '';
      if (/^https?:\/\//i.test(path)) return path;
      const { data, error } = await supabase.storage.from('returns').createSignedUrl(path, 60 * 60 * 24 * 7);
      if (error) return path;
      return data?.signedUrl || path;
    };

    // Fetch stock items separat, fără .or() construit din string
    const allItems = baseRows.flatMap((r) => (Array.isArray(r.return_items) ? r.return_items : []));
    const stockIds = Array.from(new Set(allItems.map((it) => it.stock_item_id).filter(Boolean)));
    const asins = Array.from(new Set(allItems.map((it) => it.asin).filter(Boolean)));
    const skus = Array.from(new Set(allItems.map((it) => it.sku).filter(Boolean)));
    const stockMap = {};
    const fetchAndMerge = async (column, values) => {
      if (!values.length) return;
      const { data } = await supabase
        .from('stock_items')
        .select('id, image_url, name, asin, sku')
        .in(column, values);
      if (Array.isArray(data)) {
        data.forEach((s) => {
          stockMap[s.id] = stockMap[s.id] || s;
          if (s.asin) stockMap[`asin:${s.asin}`] = stockMap[`asin:${s.asin}`] || s;
          if (s.sku) stockMap[`sku:${s.sku}`] = stockMap[`sku:${s.sku}`] || s;
        });
      }
    };
    await Promise.all([
      fetchAndMerge('id', stockIds),
      fetchAndMerge('asin', asins),
      fetchAndMerge('sku', skus)
    ]);

    // Presemnează fișierele de retur
    const fileCache = new Map();
    const signFiles = async (files = []) =>
      Promise.all(
        files.map(async (f) => {
          const key = f.url || '';
          if (fileCache.has(key)) return { ...f, signed_url: fileCache.get(key) };
          const href = await createSignedUrl(key);
          fileCache.set(key, href);
          return { ...f, signed_url: href };
        })
      );

    // Fetch profile info separately (no FK relation in schema cache)
    const userIds = Array.from(new Set(baseRows.map((r) => r.user_id).filter(Boolean)));
    let profileMap = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, company_name, store_name, email, phone')
        .in('id', userIds);
      profileMap = Array.isArray(profiles)
        ? profiles.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {})
        : {};
    }
    const mappedRows = await Promise.all(
      baseRows.map(async (r) => ({
        ...r,
        profile: profileMap[r.user_id] || null,
        return_items: Array.isArray(r.return_items)
          ? r.return_items.map((it) => {
              const byId = it.stock_item_id ? stockMap[it.stock_item_id] : null;
              const byAsin = !byId && it.asin ? stockMap[`asin:${it.asin}`] : null;
              const bySku = !byId && !byAsin && it.sku ? stockMap[`sku:${it.sku}`] : null;
              return { ...it, stock_item: byId || byAsin || bySku || null };
            })
          : [],
        return_files: await signFiles(Array.isArray(r.return_files) ? r.return_files : [])
      }))
    );

    const rowIds = mappedRows.map((r) => r.id).filter(Boolean);
    let serviceRows = [];
    if (rowIds.length) {
      let serviceQuery = supabase
        .from('return_service_lines')
        .select('*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)')
        .in('return_id', rowIds)
        .order('service_date', { ascending: false });
      if (marketCode) {
        serviceQuery = serviceQuery.eq('country', marketCode);
      }
      let serviceRes = await serviceQuery;
      if (
        serviceRes?.error &&
        /relationship|foreign key|billing_invoice/i.test(String(serviceRes.error.message || ''))
      ) {
        let fallbackQuery = supabase
          .from('return_service_lines')
          .select('*')
          .in('return_id', rowIds)
          .order('service_date', { ascending: false });
        if (marketCode) fallbackQuery = fallbackQuery.eq('country', marketCode);
        serviceRes = await fallbackQuery;
      }
      if (
        marketCode &&
        serviceRes?.error &&
        String(serviceRes.error.message || '').toLowerCase().includes('country')
      ) {
        serviceRes = await supabase
          .from('return_service_lines')
          .select('*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)')
          .in('return_id', rowIds)
          .order('service_date', { ascending: false });
      }
      serviceRows = Array.isArray(serviceRes?.data) ? serviceRes.data : [];
    }

    const servicesByReturnId = serviceRows.reduce((acc, srv) => {
      const key = srv.return_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(srv);
      return acc;
    }, {});

    const mergedRows = mappedRows.map((row) => ({
      ...row,
      return_service_lines: servicesByReturnId[row.id] || []
    }));

    setRows(mergedRows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [currentMarket, currentMarketProp, companyId, profile?.id]);

  const filtered = useMemo(() => {
    const normalizedSearch = String(search || '').trim().toLowerCase();
    return rows.filter((row) => {
      if (filter && row.status !== filter) return false;
      if (!normalizedSearch) return true;

      const itemMatches = (Array.isArray(row?.return_items) ? row.return_items : []).some((item) => {
        const fields = [
          item?.asin,
          item?.sku,
          item?.stock_item?.asin,
          item?.stock_item?.sku,
          item?.stock_item?.name
        ];
        return fields.some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
      });
      if (itemMatches) return true;

      const trackingMatches = (Array.isArray(row?.return_service_lines) ? row.return_service_lines : []).some((line) =>
        String(line?.transport_tracking_id || '').toLowerCase().includes(normalizedSearch)
      );
      if (trackingMatches) return true;

      return false;
    });
  }, [rows, filter, search]);

  const resolveStockItem = async (item, companyId) => {
    if (item.stock_item_id) {
      const { data } = await supabase
        .from('stock_items')
        .select('id, qty, prep_qty_by_country')
        .eq('id', item.stock_item_id)
        .maybeSingle();
      return data || null;
    }
    if (item.asin) {
      const { data } = await supabase
        .from('stock_items')
        .select('id, qty, prep_qty_by_country')
        .eq('company_id', companyId)
        .eq('asin', item.asin)
        .maybeSingle();
      if (data) return data;
    }
    if (item.sku) {
      const { data } = await supabase
        .from('stock_items')
        .select('id, qty, prep_qty_by_country')
        .eq('company_id', companyId)
        .eq('sku', item.sku)
        .maybeSingle();
      return data || null;
    }
    return null;
  };

  const adjustStockForReturn = async (row) => {
    const items = Array.isArray(row.return_items) ? row.return_items : [];
    const market = normalizeMarketCode(row.warehouse_country || row.country || row.marketplace || currentMarket) || 'FR';
    for (const item of items) {
      const stockRow = await resolveStockItem(item, row.company_id);
      if (!stockRow) continue;
      const currentMarketQty = getPrepQtyForMarket(stockRow, market);
      const nextMarketQty = Math.max(currentMarketQty - Number(item.qty || 0), 0);
      const patch = buildPrepQtyPatch(stockRow, market, nextMarketQty);
      const { error: stockErr } = await supabase.from('stock_items').update(patch).eq('id', stockRow.id);
      if (stockErr) throw stockErr;
    }
  };

  const collectReturnTrackingIds = (row) =>
    Array.from(
      new Set(
        (Array.isArray(row?.return_service_lines) ? row.return_service_lines : [])
          .map((line) => String(line?.transport_tracking_id || '').trim())
          .filter(Boolean)
      )
    );

  const sendDoneNotification = async (row, nextRow) => {
    const clientEmail = String(nextRow?.profile?.email || row?.profile?.email || '').trim();
    if (!clientEmail) return;
    const trackingIds = collectReturnTrackingIds(nextRow);
    const clientName =
      [
        nextRow?.profile?.first_name || row?.profile?.first_name || '',
        nextRow?.profile?.last_name || row?.profile?.last_name || ''
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' ') || null;
    const companyName =
      nextRow?.profile?.company_name ||
      nextRow?.profile?.store_name ||
      row?.profile?.company_name ||
      row?.profile?.store_name ||
      null;
    const items = (Array.isArray(nextRow?.return_items) ? nextRow.return_items : []).map((item) => ({
      asin: item?.asin || null,
      sku: item?.sku || null,
      qty: Number(item?.qty || 0) || 0,
      stock_item: item?.stock_item || null,
    }));

    const { error: mailError } = await supabaseHelpers.sendReturnDoneEmail({
      return_id: nextRow?.id || row?.id,
      email: clientEmail,
      client_name: clientName,
      company_name: companyName,
      marketplace: nextRow?.marketplace || row?.marketplace || null,
      note: nextRow?.notes || row?.notes || null,
      tracking_ids: trackingIds,
      items,
    });
    if (mailError) {
      console.error('Failed to send return done email', mailError);
      alert(`Returul a fost marcat done, dar emailul nu a fost trimis: ${mailError.message || mailError}`);
      return false;
    }
    return true;
  };

  const sendManualDoneEmail = async (row) => {
    if (row?.status !== 'done') {
      alert('Emailul manual se poate trimite doar pentru retururi marcate done.');
      return;
    }
    setSendingMailId(row.id);
    try {
      const ok = await sendDoneNotification(row, row);
      if (ok) {
        alert('Email trimis.');
      }
    } finally {
      setSendingMailId(null);
    }
  };

  const sendDoneEmailsForToday = async () => {
    const today = todayLocalStr();
    const doneTodayRows = rows.filter((row) => row?.status === 'done' && String(row?.done_at || '').slice(0, 10) === today);
    if (!doneTodayRows.length) {
      alert(`Nu există retururi done pentru ${today}.`);
      return;
    }
    setSendingTodayMails(true);
    let sent = 0;
    let failed = 0;
    for (const row of doneTodayRows) {
      const ok = await sendDoneNotification(row, row);
      if (ok) sent += 1;
      else failed += 1;
    }
    setSendingTodayMails(false);
    alert(`Email done today finalizat. Trimise: ${sent}. Eșuate: ${failed}. Data: ${today}.`);
  };

  const updateStatus = async (row, status) => {
    setSavingId(row.id);
    const isTransitionToDone = status === 'done' && row.status !== 'done';
    const patch = {
      status,
      updated_at: new Date().toISOString(),
      done_at: status === 'done' ? new Date().toISOString() : null
    };
    if (status === 'done' && !row.stock_adjusted) {
      try {
        await adjustStockForReturn(row);
        patch.stock_adjusted = true;
      } catch (stockErr) {
        alert(stockErr?.message || 'Nu am putut actualiza stocul pentru retur.');
        setSavingId(null);
        return;
      }
    }
    const { error: err } = await supabase.from('returns').update(patch).eq('id', row.id);
    if (err) {
      alert(err.message);
      setSavingId(null);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, ...patch, stock_adjusted: r.stock_adjusted || patch.stock_adjusted } : r
      )
    );
    if (isTransitionToDone) {
      await sendDoneNotification(row, {
        ...row,
        ...patch,
        stock_adjusted: row.stock_adjusted || patch.stock_adjusted,
      });
    }
    setSavingId(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Ștergi acest retur?')) return;
    const { error: err } = await supabase.from('returns').delete().eq('id', id);
    if (err) return alert(err.message);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditNotes(row.notes || '');
    const itemDraft = {};
    (row.return_items || []).forEach((item) => {
      itemDraft[item.id] = { qty: item.qty, notes: item.notes || '' };
    });
    setEditItems(itemDraft);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNotes('');
    setEditItems({});
  };

  const saveEdit = async (row) => {
    setSavingId(row.id);
    const { error: returnErr } = await supabase
      .from('returns')
      .update({ notes: editNotes, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (returnErr) {
      alert(returnErr.message);
      setSavingId(null);
      return;
    }
    const itemUpdates = Object.entries(editItems).map(([id, value]) => ({
      id: Number(id),
      qty: Number(value.qty || 0),
      notes: value.notes || null
    }));
    for (const update of itemUpdates) {
      const { error: itemErr } = await supabase
        .from('return_items')
        .update({ qty: update.qty, notes: update.notes })
        .eq('id', update.id);
      if (itemErr) {
        alert(itemErr.message);
        setSavingId(null);
        return;
      }
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              notes: editNotes,
              return_items: (r.return_items || []).map((item) => ({
                ...item,
                qty: editItems[item.id]?.qty ?? item.qty,
                notes: editItems[item.id]?.notes ?? item.notes
              }))
            }
          : r
      )
    );
    setSavingId(null);
    cancelEdit();
  };

  const getServiceLinesForReturn = (row) => {
    const fromParent = Array.isArray(returnServiceRows)
      ? returnServiceRows.filter((srv) => Number(srv.return_id) === Number(row.id))
      : [];
    const fromLocal = Array.isArray(row.return_service_lines) ? row.return_service_lines : [];
    const byId = new Map();
    [...fromParent, ...fromLocal].forEach((line) => {
      if (!line?.id) return;
      byId.set(line.id, line);
    });
    return Array.from(byId.values()).sort((a, b) => {
      const da = new Date(a?.service_date || a?.created_at || 0).getTime();
      const db = new Date(b?.service_date || b?.created_at || 0).getTime();
      return db - da;
    });
  };

  const addServiceLine = async (row) => {
    const draft = serviceDrafts[row.id] || createServiceDraft();
    const unitPrice = Number(draft.service === 'Transport' ? draft.amount : draft.unit_price);
    const units = Number(draft.units || 0);
    if (!draft.service) {
      alert('Selectează serviciul.');
      return;
    }
    if (!Number.isFinite(unitPrice)) {
      alert('Completează suma/prețul.');
      return;
    }
    if (!Number.isFinite(units) || units < 0) {
      alert('Completează unitățile/km.');
      return;
    }
    const returnLabel = buildReturnGroupLabel(row.return_items);
    const extraNoteParts = [];
    if (draft.transport_tracking_id) extraNoteParts.push(`Track ID: ${draft.transport_tracking_id}`);
    if (draft.obs_admin) extraNoteParts.push(draft.obs_admin);
    const obsAdmin = `${returnLabel}${extraNoteParts.length ? ` | ${extraNoteParts.join(' | ')}` : ''}`;
    const payload = {
      return_id: row.id,
      company_id: row.company_id,
      user_id: row.user_id || null,
      country: normalizeMarketCode(row.warehouse_country || row.country || row.marketplace || currentMarketProp || currentMarket) || 'FR',
      service_date: draft.service_date || new Date().toISOString().slice(0, 10),
      service: draft.service,
      unit_price: unitPrice,
      units,
      total: Number.isFinite(unitPrice * units) ? unitPrice * units : null,
      transport_tracking_id: draft.transport_tracking_id || null,
      obs_admin: obsAdmin
    };
    setSavingId(row.id);
    const { data, error } = await supabase
      .from('return_service_lines')
      .insert(payload)
      .select('*, billing_invoice:billing_invoices(id, invoice_number, invoice_date)')
      .single();
    if (error) {
      alert(error.message);
      setSavingId(null);
      return;
    }
    setRows((prev) =>
      prev.map((entry) =>
        entry.id === row.id
          ? {
              ...entry,
              return_service_lines: [data, ...(entry.return_service_lines || [])]
            }
          : entry
      )
    );
    setServiceDrafts((prev) => ({ ...prev, [row.id]: createServiceDraft() }));
    if (typeof reload === 'function') {
      await reload();
    }
    setSavingId(null);
  };

  const deleteServiceLine = async (rowId, serviceId) => {
    if (!window.confirm('Ștergi această linie de serviciu?')) return;
    const { error } = await supabase.from('return_service_lines').delete().eq('id', serviceId);
    if (error) {
      alert(error.message);
      return;
    }
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              return_service_lines: (row.return_service_lines || []).filter((line) => Number(line.id) !== Number(serviceId))
            }
          : row
      )
    );
    if (typeof reload === 'function') {
      await reload();
    }
  };

  return (
    <Section
      title="Retururi"
      right={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută ASIN, produs sau Track ID"
              className="border rounded pl-9 pr-3 py-1.5 text-sm w-[260px]"
            />
          </div>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Toate</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded"
            onClick={load}
            disabled={loading}
          >
            <RefreshCcw className="w-4 h-4" /> Reîmprospătează
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded"
            onClick={sendDoneEmailsForToday}
            disabled={sendingTodayMails}
          >
            <Mail className="w-4 h-4" /> {sendingTodayMails ? 'Se trimite...' : 'Email done today'}
          </button>
          {canSelectForBilling && (
            <button
              type="button"
              onClick={onSelectAllUninvoiced}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded"
            >
              Select all uninvoiced
            </button>
          )}
        </div>
      }
    >
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-text-secondary bg-white border rounded-lg">Niciun retur.</div>
        )}
        {filtered.map((r) => {
          const items = Array.isArray(r.return_items) ? r.return_items : [];
          const files = Array.isArray(r.return_files) ? r.return_files : [];
          const services = getServiceLinesForReturn(r);
          const serviceDraft = serviceDrafts[r.id] || createServiceDraft();
          const isTransportDraft = serviceDraft.service === 'Transport';
          const profile = r.profile || {};
          const companyLabel =
            profile.company_name ||
            profile.store_name ||
            r.company_id ||
            '—';
          const clientNameLabel =
            [profile.first_name, profile.last_name]
              .map((value) => String(value || '').trim())
              .filter(Boolean)
              .join(' ') || '—';
          const userLabel = profile.email || profile.id || r.user_id || '—';
          const phoneLabel = profile.phone || '—';
          return (
            <div key={r.id} className="border rounded-lg bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-text-secondary">ID</div>
                  <div className="font-mono text-sm">{r.id}</div>
                  <div className="h-4 w-px bg-gray-200" />
                  <div>
                    <div className="text-xs text-text-secondary">Company / Store</div>
                    <div className="font-semibold text-text-primary">{companyLabel}</div>
                    <div className="text-xs text-text-secondary">Client: {clientNameLabel}</div>
                    <div className="text-xs text-text-secondary">User: {userLabel}</div>
                    <div className="text-xs text-text-secondary">Phone: {phoneLabel}</div>
                  </div>
                  <div className="h-4 w-px bg-gray-200" />
                  <div>
                    <div className="text-xs text-text-secondary">Marketplace</div>
                    <div className="font-semibold uppercase">{r.marketplace || '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={r.status}
                    onChange={(e) => updateStatus(r, e.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                    disabled={savingId === r.id}
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 text-xs text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.status === 'done' && r.done_at && (
                    <div className="text-xs text-text-secondary">
                      Done: {new Date(r.done_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 py-3">
                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">Items ({items.length})</div>
                  {items.length === 0 && <div className="text-text-secondary text-sm">—</div>}
                  {items.map((it) => (
                    <div key={it.id} className="border rounded px-3 py-2 text-sm bg-slate-50 flex gap-3 items-center">
                      <div className="w-12 h-12 rounded border bg-white flex items-center justify-center overflow-hidden">
                        {it.stock_item?.image_url ? (
                          <img
                            src={it.stock_item.image_url}
                            alt={it.stock_item.name || it.asin || it.sku || 'Product'}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-[10px] text-text-secondary text-center px-1">No image</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold break-all">
                          {it.asin || it.stock_item?.asin || '—'}
                          {it.sku || it.stock_item?.sku ? (
                            <span className="text-text-secondary text-xs ml-1">({it.sku || it.stock_item?.sku})</span>
                          ) : null}
                        </div>
                        {it.stock_item?.name && (
                          <div className="text-text-secondary text-xs truncate">{it.stock_item.name}</div>
                        )}
                        {editingId === r.id ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-text-secondary">Qty:</span>
                              <input
                                type="number"
                                min="0"
                                value={editItems[it.id]?.qty ?? it.qty}
                                onChange={(e) =>
                                  setEditItems((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      ...(prev[it.id] || {}),
                                      qty: Number(e.target.value || 0)
                                    }
                                  }))
                                }
                                className="w-20 rounded border px-2 py-1 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-text-secondary">Notes:</span>
                              <input
                                type="text"
                                value={editItems[it.id]?.notes ?? it.notes ?? ''}
                                onChange={(e) =>
                                  setEditItems((prev) => ({
                                    ...prev,
                                    [it.id]: {
                                      ...(prev[it.id] || {}),
                                      notes: e.target.value
                                    }
                                  }))
                                }
                                className="flex-1 rounded border px-2 py-1 text-xs"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-text-secondary text-xs">Qty: {it.qty}</div>
                            {it.notes && <div className="text-text-secondary text-xs">Notes: {it.notes}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">Files ({files.length})</div>
                  {files.length === 0 && <div className="text-text-secondary text-sm">—</div>}
                  {files.map((f) => (
                    <a
                      key={f.id}
                      href={f.signed_url || f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-primary text-sm underline break-all"
                    >
                      <Upload className="w-3 h-3" />
                      <span className="font-semibold uppercase text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                        {f.file_type}
                      </span>
                      <span>{f.name || f.url}</span>
                    </a>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs uppercase text-text-secondary">Notes</div>
                  {editingId === r.id ? (
                    <textarea
                      className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  ) : (
                    <div className="text-sm text-text-primary whitespace-pre-wrap min-h-[40px] border rounded px-3 py-2 bg-slate-50">
                      {r.notes || '—'}
                    </div>
                  )}

                  <div className="mt-2 space-y-2">
                    <div className="text-xs uppercase text-text-secondary">
                      Servicii retur ({services.length})
                    </div>
                    {services.length > 0 && (
                      <div className="overflow-auto border rounded">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-2 py-1 text-center w-8"></th>
                              <th className="px-2 py-1 text-left">Data</th>
                              <th className="px-2 py-1 text-left">Serviciu</th>
                              <th className="px-2 py-1 text-right">Preț</th>
                              <th className="px-2 py-1 text-right">Unități</th>
                              <th className="px-2 py-1 text-right">Total</th>
                              <th className="px-2 py-1 text-left">Transport track ID</th>
                              <th className="px-2 py-1 text-left">Obs admin</th>
                              <th className="px-2 py-1 text-right">Acțiuni</th>
                            </tr>
                          </thead>
                          <tbody>
                            {services.map((serviceLine) => {
                              const lineTotal =
                                serviceLine.total != null
                                  ? Number(serviceLine.total)
                                  : Number(serviceLine.unit_price || 0) * Number(serviceLine.units || 0);
                              return (
                                <tr
                                  key={serviceLine.id}
                                  className={`border-t ${
                                    serviceLine.billing_invoice_id ? 'bg-blue-50 hover:bg-blue-50' : ''
                                  }`}
                                  title={formatInvoiceTooltip(serviceLine.billing_invoice)}
                                >
                                  <td className="px-2 py-1 text-center">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(billingSelectedLines[`returns:${serviceLine.id}`])}
                                      disabled={Boolean(serviceLine.billing_invoice_id) || !canSelectForBilling}
                                      onChange={() =>
                                        canSelectForBilling &&
                                        onToggleBillingSelection?.('returns', serviceLine)
                                      }
                                      className="rounded border-gray-300 focus:ring-2 focus:ring-primary"
                                    />
                                  </td>
                                  <td className="px-2 py-1">{serviceLine.service_date || '—'}</td>
                                  <td className="px-2 py-1">{serviceLine.service || '—'}</td>
                                  <td className="px-2 py-1 text-right">{formatMoney(Number(serviceLine.unit_price || 0))}</td>
                                  <td className="px-2 py-1 text-right">{Number(serviceLine.units || 0)}</td>
                                  <td className="px-2 py-1 text-right">{formatMoney(lineTotal)}</td>
                                  <td className="px-2 py-1">{serviceLine.transport_tracking_id || '—'}</td>
                                  <td className="px-2 py-1">{serviceLine.obs_admin || '—'}</td>
                                  <td className="px-2 py-1 text-right">
                                    <button
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                                      onClick={() => deleteServiceLine(r.id, serviceLine.id)}
                                    >
                                      <Trash2 className="w-3 h-3" /> Șterge
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {services.length === 0 && (
                      <div className="text-xs text-text-secondary border rounded px-2 py-2 bg-slate-50">
                        Nu există servicii adăugate pe acest retur.
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 rounded border bg-slate-50 p-2">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                        <select
                          className="border rounded px-2 py-1 text-xs"
                          value={serviceDraft.service}
                          onChange={(e) =>
                            setServiceDrafts((prev) => ({
                              ...prev,
                              [r.id]: {
                                ...(prev[r.id] || createServiceDraft()),
                                service: e.target.value
                              }
                            }))
                          }
                        >
                          {returnServiceOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          className="border rounded px-2 py-1 text-xs"
                          value={serviceDraft.service_date}
                          onChange={(e) =>
                            setServiceDrafts((prev) => ({
                              ...prev,
                              [r.id]: {
                                ...(prev[r.id] || createServiceDraft()),
                                service_date: e.target.value
                              }
                            }))
                          }
                        />
                        <input
                          type="text"
                          className="border rounded px-2 py-1 text-xs"
                          placeholder={isTransportDraft ? 'Suma transport' : 'Preț / unit'}
                          value={isTransportDraft ? serviceDraft.amount : serviceDraft.unit_price}
                          onChange={(e) =>
                            setServiceDrafts((prev) => ({
                              ...prev,
                              [r.id]: {
                                ...(prev[r.id] || createServiceDraft()),
                                [isTransportDraft ? 'amount' : 'unit_price']: e.target.value
                              }
                            }))
                          }
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="border rounded px-2 py-1 text-xs"
                          placeholder={serviceDraft.service === 'Return km' ? 'Km' : 'Unități'}
                          value={serviceDraft.units}
                          onChange={(e) =>
                            setServiceDrafts((prev) => ({
                              ...prev,
                              [r.id]: {
                                ...(prev[r.id] || createServiceDraft()),
                                units: e.target.value
                              }
                            }))
                          }
                        />
                        <input
                          type="text"
                          className="border rounded px-2 py-1 text-xs"
                          placeholder="Track ID transport"
                          value={serviceDraft.transport_tracking_id}
                          onChange={(e) =>
                            setServiceDrafts((prev) => ({
                              ...prev,
                              [r.id]: {
                                ...(prev[r.id] || createServiceDraft()),
                                transport_tracking_id: e.target.value
                              }
                            }))
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
                        <input
                          type="text"
                          className="border rounded px-2 py-1 text-xs"
                          placeholder="Obs admin (opțional)"
                          value={serviceDraft.obs_admin}
                          onChange={(e) =>
                            setServiceDrafts((prev) => ({
                              ...prev,
                              [r.id]: {
                                ...(prev[r.id] || createServiceDraft()),
                                obs_admin: e.target.value
                              }
                            }))
                          }
                        />
                        <button
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs border rounded bg-white"
                          onClick={() => addServiceLine(r)}
                          disabled={savingId === r.id}
                        >
                          <CheckCircle2 className="w-4 h-4" /> Adaugă serviciu
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {editingId === r.id ? (
                      <>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => saveEdit(r)}
                          disabled={savingId === r.id}
                        >
                          <CheckCircle2 className="w-4 h-4" /> Save
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={cancelEdit}
                          disabled={savingId === r.id}
                        >
                          <X className="w-4 h-4" /> Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => startEdit(r)}
                        >
                          <Pencil className="w-4 h-4" /> Edit
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => updateStatus(r, 'processing')}
                          disabled={savingId === r.id}
                        >
                          <ArrowUpRight className="w-4 h-4" /> Proc.
                        </button>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                          onClick={() => updateStatus(r, 'done')}
                          disabled={savingId === r.id}
                        >
                          <ArrowDownRight className="w-4 h-4" /> Done
                        </button>
                        {r.status === 'done' && (
                          <button
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded"
                            onClick={() => sendManualDoneEmail(r)}
                            disabled={sendingMailId === r.id}
                          >
                            <Mail className="w-4 h-4" /> {sendingMailId === r.id ? 'Se trimite...' : 'Trimite email'}
                          </button>
                        )}
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                          onClick={() => handleDelete(r.id)}
                          disabled={savingId === r.id}
                        >
                          <Trash2 className="w-4 h-4" /> Șterge
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
