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
  fixed_amount: ''
};

const formatClientName = (client) => {
  const bits = [client?.first_name, client?.last_name].filter(Boolean);
  if (bits.length) return bits.join(' ');
  if (client?.company_name) return client.company_name;
  if (client?.store_name) return client.store_name;
  return '—';
};

export default function AdminAffiliates() {
  const { t } = useAdminTranslation();
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
        fixed_amount: form.fixed_amount || null
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
                className="w-full border rounded-lg px-3 py-2"
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
                className="w-full border rounded-lg px-3 py-2"
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

            {codes.map((code) => (
              <div key={code.id} className={`bg-white border rounded-xl p-4 ${selectedCode?.id === code.id ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-xl font-mono">{code.code}</p>
                    <p className="text-text-primary font-semibold">{code.label}</p>
                    {code.description && <p className="text-sm text-text-secondary">{code.description}</p>}
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
                  </div>
                </div>

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
            ))}
          </>
        )}
      </div>
    </div>
  );
}
