import React, { useEffect, useMemo, useState } from 'react';
import { supabaseHelpers } from '@/config/supabaseHelpers';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';
import {
  Tag,
  Percent,
  Users,
  RefreshCw,
  Shield,
  Check,
  X,
  UserPlus
} from 'lucide-react';

const initialCodeForm = {
  owner_profile_id: '',
  code: '',
  label: '',
  description: '',
  payout_type: 'percentage',
  percent_below_threshold: '',
  percent_above_threshold: '',
  threshold_amount: '',
  fixed_amount: '',
  payout_tiers: []
};

const formatClientName = (client) => {
  const bits = [client?.first_name, client?.last_name].filter(Boolean);
  if (bits.length) return bits.join(' ');
  if (client?.company_name) return client.company_name;
  if (client?.store_name) return client.store_name;
  return '—';
};

const sanitizeTiers = (tiers = []) => {
  if (!Array.isArray(tiers)) return [];
  return tiers
    .map((tier) => ({
      min_amount: Number(
        typeof tier.min_amount === 'string' ? tier.min_amount.replace(',', '.') : tier.min_amount
      ),
      percent: Number(
        typeof tier.percent === 'string' ? tier.percent.replace(',', '.') : tier.percent
      )
    }))
    .filter(
      (tier) =>
        Number.isFinite(tier.min_amount) &&
        tier.min_amount >= 0 &&
        Number.isFinite(tier.percent) &&
        tier.percent >= 0
    )
    .sort((a, b) => a.min_amount - b.min_amount);
};

const computeCommission = (amount, code) => {
  const total = Number(amount || 0);
  if (total <= 0 || !code) return 0;
  const type = code.payout_type || 'percentage';
  if (type === 'threshold') {
    const threshold = Number(code.threshold_amount || 0);
    const percentBase = Number(code.percent_below_threshold || 0);
    const percentBonus = Number(code.percent_above_threshold || percentBase);
    const baseCommission = (total * (threshold && total >= threshold ? percentBonus : percentBase)) / 100;
    if (threshold && total >= threshold && code.fixed_amount) {
      return baseCommission + Number(code.fixed_amount || 0);
    }
    return baseCommission;
  }
  const tiers = sanitizeTiers(code.payout_tiers);
  let percent = Number(code.percent_below_threshold || code.percent_above_threshold || 0);
  tiers.forEach((tier) => {
    if (total >= tier.min_amount) {
      percent = tier.percent;
    }
  });
  return (total * percent) / 100;
};

export default function AdminAffiliates() {
  const { t, tp } = useAdminTranslation();
  const [requests, setRequests] = useState([]);
  const [codes, setCodes] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [members, setMembers] = useState({ assigned: [], candidates: [] });
  const [loading, setLoading] = useState(true);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [busyMembers, setBusyMembers] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(initialCodeForm);
  const [creating, setCreating] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState([]);
  const [editingCodeId, setEditingCodeId] = useState(null);
  const [editForm, setEditForm] = useState(initialCodeForm);
  const [savingEdit, setSavingEdit] = useState(false);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2
      }),
    []
  );

  const describePayout = (code) => {
    if (!code) return t('affiliates.offerNone');
    if (code.payout_type === 'threshold') {
      const threshold = Number(code.threshold_amount || 0);
      const below = Number(code.percent_below_threshold || 0);
      const above = Number(code.percent_above_threshold || below);
      const summaryText = tp('affiliates.offerThreshold', {
        threshold: currencyFormatter.format(threshold),
        below,
        above
      });
      if (code.fixed_amount) {
        return `${summaryText} · ${tp('affiliates.offerFixed', {
          threshold: currencyFormatter.format(threshold),
          amount: currencyFormatter.format(Number(code.fixed_amount || 0))
        })}`;
      }
      return summaryText;
    }
    const tiers = sanitizeTiers(code.payout_tiers);
    if (tiers.length > 0) {
      return tiers
        .map((tier) =>
          tp('affiliates.offerTier', {
            amount: currencyFormatter.format(tier.min_amount),
            percent: tier.percent
          })
        )
        .join(' • ');
    }
    const percent = Number(code.percent_below_threshold || code.percent_above_threshold || 0);
    return tp('affiliates.offerPercent', { percent });
  };

  const loadData = async () => {
    setLoading(true);
    setOwnersLoading(true);
    try {
      const [{ data: reqData }, { data: codeData }, { data: ownerData }] = await Promise.all([
        supabaseHelpers.listAffiliateRequests(),
        supabaseHelpers.listAffiliateCodes(),
        supabaseHelpers.listAffiliateOwnerOptions()
      ]);
      setRequests(reqData || []);
      setCodes(codeData || []);
      setOwnerOptions(ownerData || []);
    } finally {
      setLoading(false);
      setOwnersLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCode = async (e) => {
    e.preventDefault();
    if (!form.owner_profile_id || !form.code) {
      setMessage(t('affiliates.formError'));
      return;
    }
    setCreating(true);
    try {
      const tiersPayload = sanitizeTiers(form.payout_tiers);
      const payload = {
        owner_profile_id: form.owner_profile_id,
        code: form.code.trim().toUpperCase(),
        label: form.label || formatClientName(
          codes.find((c) => c.owner_profile_id === form.owner_profile_id)?.owner || {}
        ) || 'Affiliate',
        description: form.description || null,
        payout_type: form.payout_type,
        percent_below_threshold: form.percent_below_threshold || null,
        percent_above_threshold: form.percent_above_threshold || null,
        threshold_amount: form.threshold_amount || null,
        fixed_amount: form.fixed_amount || null,
        payout_tiers: tiersPayload
      };
      await supabaseHelpers.createAffiliateCode(payload);
      setForm(initialCodeForm);
      setMessage(t('affiliates.createSuccess'));
      loadData();
    } catch (err) {
      console.error('createAffiliateCode', err);
      setMessage(err.message || 'Failed to create code');
    } finally {
      setCreating(false);
    }
  };

  const openMembers = async (code) => {
    setSelectedCode(code);
    setBusyMembers(true);
    const { assigned, candidates } = await supabaseHelpers.getAffiliateCodeMembers(code.id, code.code);
    setMembers({ assigned, candidates });
    setBusyMembers(false);
  };

  const assignClient = async (clientId) => {
    if (!selectedCode) return;
    setBusyMembers(true);
    await supabaseHelpers.assignAffiliateCodeToProfile(clientId, selectedCode.id);
    await openMembers(selectedCode);
  };

  const removeClient = async (clientId) => {
    setBusyMembers(true);
    await supabaseHelpers.removeAffiliateCodeFromProfile(clientId);
    await openMembers(selectedCode);
  };

  const handleToggleCode = async (code) => {
    await supabaseHelpers.updateAffiliateCode(code.id, { active: !code.active });
    loadData();
  };

  const openEditForm = (code) => {
    setEditingCodeId(code.id);
    setEditForm({
      owner_profile_id: code.owner_profile_id,
      code: code.code || '',
      label: code.label || '',
      description: code.description || '',
      payout_type: code.payout_type || 'percentage',
      percent_below_threshold: code.percent_below_threshold ?? '',
      percent_above_threshold: code.percent_above_threshold ?? '',
      threshold_amount: code.threshold_amount ?? '',
      fixed_amount: code.fixed_amount ?? '',
      payout_tiers: Array.isArray(code.payout_tiers) ? code.payout_tiers : []
    });
  };

  const cancelEdit = () => {
    setEditingCodeId(null);
    setEditForm(initialCodeForm);
    setSavingEdit(false);
  };

  const saveEdit = async () => {
    if (!editingCodeId) return;
    setSavingEdit(true);
    try {
      const tiersPayload = sanitizeTiers(editForm.payout_tiers);
      await supabaseHelpers.updateAffiliateCode(editingCodeId, {
        code: editForm.code?.trim().toUpperCase(),
        label: editForm.label || null,
        description: editForm.description || null,
        payout_type: editForm.payout_type,
        percent_below_threshold: editForm.percent_below_threshold || null,
        percent_above_threshold: editForm.percent_above_threshold || null,
        threshold_amount: editForm.threshold_amount || null,
        fixed_amount: editForm.fixed_amount || null,
        payout_tiers: tiersPayload
      });
      cancelEdit();
      loadData();
      setMessage(t('affiliates.updateSuccess'));
    } catch (err) {
      console.error('updateAffiliateCode', err);
      setMessage(err.message || t('affiliates.updateError'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRequestAction = async (req, action) => {
    if (action === 'reject') {
      await supabaseHelpers.respondAffiliateRequest(req.id, { status: 'rejected' });
      loadData();
      return;
    }
    if (req.profile) {
      setOwnerOptions((prev) => {
        if (prev.some((p) => p.id === req.profile_id)) return prev;
        return [...prev, req.profile];
      });
    }
    setForm((prev) => ({
      ...prev,
      owner_profile_id: req.profile_id,
      code: req.preferred_code ? req.preferred_code.toUpperCase() : '',
      label: formatClientName(req.profile)
    }));
  };

  const requestCards = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests]);
  const takenOwnerIds = useMemo(
    () => new Set((codes || []).map((c) => c.owner_profile_id).filter(Boolean)),
    [codes]
  );
  const ownerChoices = useMemo(() => {
    const registry = new Map();
    ownerOptions.forEach((profile) => {
      if (profile?.id) registry.set(profile.id, profile);
    });
    requestCards.forEach((req) => {
      if (req.profile?.id) registry.set(req.profile_id, req.profile);
    });
    return Array.from(registry.values()).sort((a, b) =>
      formatClientName(a).localeCompare(formatClientName(b))
    );
  }, [ownerOptions, requestCards]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">{t('affiliates.title')}</h2>
        <p className="text-text-secondary text-sm">{t('affiliates.subtitle')}</p>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Tag className="w-4 h-4" /> {t('affiliates.createTitle')}
        </h3>
        <form onSubmit={handleCreateCode} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-1 block">{t('affiliates.ownerSelect')}</label>
              <select
                value={form.owner_profile_id}
                onChange={(e) => setForm((prev) => ({ ...prev, owner_profile_id: e.target.value }))}
                className="block w-full border rounded-lg px-3 py-2"
              >
                <option value="">{t('affiliates.ownerPlaceholder')}</option>
                {ownerChoices.map((client) => {
                  const disabled =
                    takenOwnerIds.has(client.id) && form.owner_profile_id !== client.id;
                  return (
                    <option key={client.id} value={client.id} disabled={disabled}>
                      {formatClientName(client)} (
                      {client.company_name || client.store_name || '—'}
                      {disabled ? ` · ${t('affiliates.ownerHasCode')}` : ''}
                      )
                    </option>
                  );
                })}
              </select>
              {ownersLoading && (
                <p className="text-xs text-text-secondary mt-1 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> {t('affiliates.ownerLoading')}
                </p>
              )}
              {!ownersLoading && ownerChoices.length === 0 && (
                <p className="text-xs text-text-secondary mt-1">{t('affiliates.ownerEmpty')}</p>
              )}
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-1 block">{t('affiliates.codeLabel')}</label>
              <input
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                className="w-full border rounded-lg px-3 py-2 uppercase"
                placeholder="AF001"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-1 block">{t('affiliates.payoutType')}</label>
              <select
                value={form.payout_type}
                onChange={(e) => setForm((prev) => ({ ...prev, payout_type: e.target.value }))}
                className="block w-full border rounded-lg px-3 py-2"
              >
                <option value="percentage">{t('affiliates.modePercent')}</option>
                <option value="threshold">{t('affiliates.modeThreshold')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-1 block">{t('affiliates.labelLabel')}</label>
              <input
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-1 block flex items-center gap-1">
                <Percent className="w-3 h-3" /> {t('affiliates.percentBelow')}
              </label>
              <input
                type="number"
                step="0.1"
                value={form.percent_below_threshold}
                onChange={(e) => setForm((prev) => ({ ...prev, percent_below_threshold: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-1 block flex items-center gap-1">
                <Percent className="w-3 h-3" /> {t('affiliates.percentAbove')}
              </label>
              <input
                type="number"
                step="0.1"
                value={form.percent_above_threshold}
                onChange={(e) => setForm((prev) => ({ ...prev, percent_above_threshold: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-1 block">{t('affiliates.threshold')}</label>
              <input
                type="number"
                step="10"
                value={form.threshold_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, threshold_amount: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-1 block">{t('affiliates.fixedAmount')}</label>
              <input
                type="number"
                step="10"
                value={form.fixed_amount}
                onChange={(e) => setForm((prev) => ({ ...prev, fixed_amount: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-1 block">{t('affiliates.descriptionLabel')}</label>
              <input
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
                placeholder={t('affiliates.descriptionPlaceholder')}
              />
            </div>
          </div>

          {form.payout_type === 'percentage' && (
            <div className="space-y-2">
              <label className="text-sm text-text-secondary mb-1 block">
                {t('affiliates.tiersTitle')}
              </label>
              {form.payout_tiers.length === 0 && (
                <p className="text-xs text-text-secondary">{t('affiliates.tiersEmpty')}</p>
              )}
              <div className="space-y-2">
                {form.payout_tiers.map((tier, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-text-secondary block mb-1">
                        {t('affiliates.tiersMin')}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        className="w-full border rounded-lg px-3 py-2"
                        value={tier.min_amount}
                        onChange={(e) =>
                          setForm((prev) => {
                            const tiers = [...prev.payout_tiers];
                            tiers[index] = { ...tiers[index], min_amount: e.target.value };
                            return { ...prev, payout_tiers: tiers };
                          })
                        }
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-xs uppercase text-text-secondary block mb-1">
                          {t('affiliates.tiersPercent')}
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="w-full border rounded-lg px-3 py-2"
                          value={tier.percent}
                          onChange={(e) =>
                            setForm((prev) => {
                              const tiers = [...prev.payout_tiers];
                              tiers[index] = { ...tiers[index], percent: e.target.value };
                              return { ...prev, payout_tiers: tiers };
                            })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            payout_tiers: prev.payout_tiers.filter((_, idx) => idx !== index)
                          }))
                        }
                      >
                        {t('affiliates.remove')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="px-3 py-1 text-sm border rounded bg-gray-50"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    payout_tiers: [...prev.payout_tiers, { min_amount: '', percent: '' }]
                  }))
                }
              >
                {t('affiliates.tiersAdd')}
              </button>
              <p className="text-xs text-text-secondary">{t('affiliates.tiersHint')}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
            >
              {creating ? t('common.loading') : t('affiliates.createBtn')}
            </button>
            {message && <span className="text-sm text-text-secondary">{message}</span>}
          </div>
        </form>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="text-sm text-text-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : (
          <>
            {requestCards.length > 0 && (
              <div className="bg-white border rounded-xl p-4 space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4" /> {t('affiliates.requestsTitle')}
                </h3>
                {requestCards.map((req) => (
                  <div key={req.id} className="flex flex-col md:flex-row md:items-center md:justify-between border rounded-lg p-3 gap-2">
                    <div>
                      <p className="font-semibold">{formatClientName(req.profile)}</p>
                      <p className="text-xs text-text-secondary">{req.notes || t('affiliates.noNotes')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-3 py-1 text-sm border rounded text-green-700 border-green-200"
                        onClick={() => handleRequestAction(req, 'approve')}
                      >
                        <Check className="w-4 h-4 inline mr-1" /> {t('affiliates.requestApprove')}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 text-sm border rounded text-red-600 border-red-200"
                        onClick={() => handleRequestAction(req, 'reject')}
                      >
                        <X className="w-4 h-4 inline mr-1" /> {t('affiliates.requestReject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {codes.map((code) => {
              const ownerName = formatClientName(code.owner || {});
              const displayLabel = code.label?.trim() || ownerName || '—';
              return (
              <div key={code.id} className={`bg-white border rounded-xl p-4 ${selectedCode?.id === code.id ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-xl font-mono">{code.code}</p>
                    <p className="text-text-primary font-semibold">{displayLabel}</p>
                    <p className="text-xs text-text-secondary">{ownerName}</p>
                    <p className="text-sm text-text-secondary mt-1">{describePayout(code)}</p>
                    {code.description && <p className="text-sm text-text-secondary mt-1">{code.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border rounded"
                      onClick={() => handleToggleCode(code)}
                    >
                      {code.active ? t('affiliates.disable') : t('affiliates.enable')}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border rounded bg-gray-50"
                      onClick={() => openMembers(code)}
                    >
                      {t('affiliates.viewMembers')}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-sm border rounded bg-white"
                      onClick={() => openEditForm(code)}
                    >
                      {t('affiliates.editCode')}
                    </button>
                  </div>
                </div>
                {editingCodeId === code.id && (
                  <div className="mt-4 border-t pt-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs uppercase text-text-secondary block mb-1">{t('affiliates.codeLabel')}</label>
                        <input
                          className="w-full border rounded-lg px-3 py-2 uppercase"
                          value={editForm.code}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, code: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-text-secondary block mb-1">{t('affiliates.labelLabel')}</label>
                        <input
                          className="w-full border rounded-lg px-3 py-2"
                          value={editForm.label}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, label: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-text-secondary block mb-1">{t('affiliates.descriptionLabel')}</label>
                      <textarea
                        className="w-full border rounded-lg px-3 py-2"
                        rows={2}
                        value={editForm.description}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs uppercase text-text-secondary block mb-1">{t('affiliates.payoutType')}</label>
                        <select
                          className="w-full border rounded-lg px-3 py-2"
                          value={editForm.payout_type}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, payout_type: e.target.value }))}
                        >
                          <option value="percentage">{t('affiliates.modePercent')}</option>
                          <option value="threshold">{t('affiliates.modeThreshold')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs uppercase text-text-secondary block mb-1">% {t('affiliates.percentBelow')}</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full border rounded-lg px-3 py-2"
                          value={editForm.percent_below_threshold}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, percent_below_threshold: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-text-secondary block mb-1">% {t('affiliates.percentAbove')}</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full border rounded-lg px-3 py-2"
                          value={editForm.percent_above_threshold}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, percent_above_threshold: e.target.value }))}
                          disabled={editForm.payout_type !== 'threshold'}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs uppercase text-text-secondary block mb-1">{t('affiliates.threshold')}</label>
                        <input
                          type="number"
                          className="w-full border rounded-lg px-3 py-2"
                          value={editForm.threshold_amount}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, threshold_amount: e.target.value }))}
                          disabled={editForm.payout_type !== 'threshold'}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-text-secondary block mb-1">{t('affiliates.fixedAmount')}</label>
                        <input
                          type="number"
                          className="w-full border rounded-lg px-3 py-2"
                          value={editForm.fixed_amount}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, fixed_amount: e.target.value }))}
                        />
                      </div>
                    </div>
                    {editForm.payout_type === 'percentage' && (
                      <div className="space-y-2">
                        <label className="text-xs uppercase text-text-secondary block">
                          {t('affiliates.tiersTitle')}
                        </label>
                        {editForm.payout_tiers.length === 0 && (
                          <p className="text-xs text-text-secondary">{t('affiliates.tiersEmpty')}</p>
                        )}
                        <div className="space-y-2">
                          {editForm.payout_tiers.map((tier, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs uppercase text-text-secondary block mb-1">
                                  {t('affiliates.tiersMin')}
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="50"
                                  className="w-full border rounded-lg px-3 py-2"
                                  value={tier.min_amount}
                                  onChange={(e) =>
                                    setEditForm((prev) => {
                                      const tiers = [...prev.payout_tiers];
                                      tiers[index] = { ...tiers[index], min_amount: e.target.value };
                                      return { ...prev, payout_tiers: tiers };
                                    })
                                  }
                                />
                              </div>
                              <div className="flex items-end gap-2">
                                <div className="flex-1">
                                  <label className="text-xs uppercase text-text-secondary block mb-1">
                                    {t('affiliates.tiersPercent')}
                                  </label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    className="w-full border rounded-lg px-3 py-2"
                                    value={tier.percent}
                                    onChange={(e) =>
                                      setEditForm((prev) => {
                                        const tiers = [...prev.payout_tiers];
                                        tiers[index] = { ...tiers[index], percent: e.target.value };
                                        return { ...prev, payout_tiers: tiers };
                                      })
                                    }
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="text-xs text-red-600"
                                  onClick={() =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      payout_tiers: prev.payout_tiers.filter((_, idx) => idx !== index)
                                    }))
                                  }
                                >
                                  {t('affiliates.remove')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1 text-sm border rounded bg-gray-50"
                          onClick={() =>
                            setEditForm((prev) => ({
                              ...prev,
                              payout_tiers: [...prev.payout_tiers, { min_amount: '', percent: '' }]
                            }))
                          }
                        >
                          {t('affiliates.tiersAdd')}
                        </button>
                        <p className="text-xs text-text-secondary">{t('affiliates.tiersHint')}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
                        onClick={saveEdit}
                        disabled={savingEdit}
                      >
                        {savingEdit ? t('common.loading') : t('affiliates.saveChanges')}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 border rounded-lg"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        {t('affiliates.cancelEdit')}
                      </button>
                    </div>
                  </div>
                )}

                {selectedCode?.id === code.id && (
                  <div className="mt-4">
                    {busyMembers ? (
                      <div className="text-sm text-text-secondary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> {t('common.loading')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                            <Users className="w-4 h-4" /> {t('affiliates.assignedTitle')}
                          </h4>
                          {members.assigned.length === 0 ? (
                            <p className="text-xs text-text-secondary">{t('affiliates.noAssigned')}</p>
                          ) : (
                            <ul className="space-y-2">
                              {members.assigned.map((client) => (
                                <li key={client.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                                  <div>
                                    <p className="font-semibold">{formatClientName(client)}</p>
                                    <p className="text-xs text-text-secondary uppercase">{client.id}</p>
                                    <p className="text-xs text-text-secondary mt-1">
                                      {tp('affiliates.memberBilling', {
                                        billed: currencyFormatter.format(client.billing_total || 0),
                                        commission: currencyFormatter.format(
                                          computeCommission(client.billing_total, code)
                                        )
                                      })}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="text-xs text-red-600"
                                    onClick={() => removeClient(client.id)}
                                  >
                                    {t('affiliates.remove')}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                            <UserPlus className="w-4 h-4" /> {t('affiliates.candidatesTitle')}
                          </h4>
                          {members.candidates.length === 0 ? (
                            <p className="text-xs text-text-secondary">{t('affiliates.noCandidates')}</p>
                          ) : (
                            <ul className="space-y-2">
                              {members.candidates.map((client) => (
                                <li key={client.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                                  <div>
                                    <p className="font-semibold">{formatClientName(client)}</p>
                                    <p className="text-xs text-text-secondary">
                                      {client.affiliate_code_input || '-'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="text-xs text-primary"
                                    onClick={() => assignClient(client.id)}
                                  >
                                    {t('affiliates.assign')}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </>
        )}
      </div>
    </div>
  );
}
