import React, { useEffect, useMemo, useState } from 'react';
import { supabaseHelpers } from '@/config/supabaseHelpers';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';
import { Tag, Percent, Users, RefreshCw, Link2, UserPlus, Shield } from 'lucide-react';

const initialForm = { code: '', label: '', discount: '', description: '' };

const formatName = (profile) => {
  const bits = [profile?.first_name, profile?.last_name].filter(Boolean);
  if (bits.length === 0 && profile?.company_name) return profile.company_name;
  if (bits.length === 0 && profile?.store_name) return profile.store_name;
  return bits.join(' ') || '—';
};

export default function AdminAffiliates() {
  const { t } = useAdminTranslation();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(initialForm);
  const [creating, setCreating] = useState(false);
  const [selectedCode, setSelectedCode] = useState(null);
  const [members, setMembers] = useState({ assigned: [], candidates: [] });
  const [membersLoading, setMembersLoading] = useState(false);

  const loadCodes = async () => {
    setLoading(true);
    const { data, error } = await supabaseHelpers.listAffiliateCodes();
    if (error) {
      console.error('listAffiliateCodes', error);
      setMessage(error.message || 'Failed to load codes');
    } else {
      setCodes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCodes();
  }, []);

  const resetForm = () => setForm(initialForm);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code || !form.label) {
      setMessage('Code and label are required');
      return;
    }
    setCreating(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      label: form.label.trim(),
      description: form.description.trim() || null,
      discount_percent: form.discount ? Number(form.discount) : null,
    };
    const { error } = await supabaseHelpers.createAffiliateCode(payload);
    if (error) {
      console.error('createAffiliateCode', error);
      setMessage(error.message || 'Failed to create code');
    } else {
      resetForm();
      setMessage(t('affiliates.createSuccess'));
      loadCodes();
    }
    setCreating(false);
  };

  const openCode = async (code) => {
    setSelectedCode(code);
    setMembersLoading(true);
    const { assigned, candidates, error } = await supabaseHelpers.getAffiliateCodeMembers(code.id, code.code);
    if (error) {
      console.error('getAffiliateCodeMembers', error);
      setMessage(error.message || 'Failed to load clients');
    }
    setMembers({ assigned, candidates });
    setMembersLoading(false);
  };

  const assignClient = async (profileId) => {
    if (!selectedCode) return;
    setMembersLoading(true);
    await supabaseHelpers.assignAffiliateCodeToProfile(profileId, selectedCode.id);
    await openCode(selectedCode);
    loadCodes();
  };

  const removeClient = async (profileId) => {
    setMembersLoading(true);
    await supabaseHelpers.removeAffiliateCodeFromProfile(profileId);
    await openCode(selectedCode);
    loadCodes();
  };

  const toggleActive = async (code) => {
    await supabaseHelpers.updateAffiliateCode(code.id, { active: !code.active });
    loadCodes();
    if (selectedCode?.id === code.id) {
      setSelectedCode({ ...code, active: !code.active });
    }
  };

  const setOwner = async (profileId) => {
    if (!selectedCode) return;
    await supabaseHelpers.updateAffiliateCode(selectedCode.id, { owner_profile_id: profileId });
    await openCode(selectedCode);
    loadCodes();
  };

  const selectedOwnerName = useMemo(() => {
    if (!selectedCode?.owner_profile_id) return null;
    const entry = members.assigned.find((m) => m.id === selectedCode.owner_profile_id);
    return entry ? formatName(entry) : null;
  }, [members.assigned, selectedCode]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">{t('affiliates.title')}</h2>
        <p className="text-text-secondary text-sm">{t('affiliates.subtitle')}</p>
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Tag className="w-4 h-4" /> {t('affiliates.createTitle')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1 block">{t('affiliates.codeLabel')}</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
              className="w-full border rounded-lg px-3 py-2 uppercase"
              placeholder="AF001"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1 block">{t('affiliates.labelLabel')}</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Influencer name"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1 block">{t('affiliates.discountLabel')}</label>
            <div className="relative">
              <Percent className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
              <input
                type="number"
                step="0.1"
                value={form.discount}
                onChange={(e) => setForm((prev) => ({ ...prev, discount: e.target.value }))}
                className="w-full border rounded-lg pl-9 pr-2 py-2"
                placeholder="5"
              />
            </div>
            <p className="text-[11px] text-text-secondary mt-1">{t('affiliates.discountHint')}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary mb-1 block">{t('affiliates.descriptionLabel')}</label>
            <input
              type="text"
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
            className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-60"
          >
            {creating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>{t('affiliates.createBtn')}</>
            )}
          </button>
          {message && <span className="text-sm text-text-secondary">{message}</span>}
        </div>
      </form>

      <div className="grid gap-4">
        {loading ? (
          <div className="text-sm text-text-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('affiliates.empty')}</p>
        ) : (
          codes.map((code) => (
            <div key={code.id} className={`border rounded-xl bg-white p-4 ${selectedCode?.id === code.id ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-mono font-semibold">{code.code}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${code.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {code.active ? t('affiliates.statusActive') : t('affiliates.statusInactive')}
                    </span>
                  </div>
                  <p className="text-text-primary font-semibold">{code.label}</p>
                  {code.description && <p className="text-text-secondary text-sm">{code.description}</p>}
                  <p className="text-sm text-text-secondary mt-1">
                    {t('affiliates.discountLabel')}: {code.discount_percent ? `${code.discount_percent}%` : t('affiliates.noDiscount')}
                  </p>
                  {code.owner_profile_id && (
                    <p className="text-xs text-text-secondary">
                      <Shield className="inline w-3 h-3 mr-1" />
                      {t('affiliates.ownerLabel')}: {selectedCode?.id === code.id ? selectedOwnerName || t('affiliates.pendingOwner') : t('affiliates.ownerHint')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(code)}
                    className="px-3 py-1 border rounded text-sm"
                  >
                    {code.active ? t('affiliates.disable') : t('affiliates.enable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCode(code)}
                    className="px-3 py-1 border rounded text-sm bg-gray-50"
                  >
                    {selectedCode?.id === code.id ? t('affiliates.refreshMembers') : t('affiliates.viewMembers')}
                  </button>
                </div>
              </div>

              {selectedCode?.id === code.id && (
                <div className="mt-4">
                  {membersLoading ? (
                    <div className="text-sm text-text-secondary flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> {t('common.loading')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                          <Users className="w-4 h-4" /> {t('affiliates.assignedTitle')}
                        </h4>
                        {members.assigned.length === 0 ? (
                          <p className="text-xs text-text-secondary">{t('affiliates.noAssigned')}</p>
                        ) : (
                          <ul className="space-y-2">
                            {members.assigned.map((client) => (
                              <li key={client.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                                <div>
                                  <p className="font-semibold">{formatName(client)}</p>
                                  <p className="text-xs text-text-secondary uppercase">{client.id}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="text-xs text-red-600"
                                    onClick={() => removeClient(client.id)}
                                  >
                                    {t('affiliates.remove')}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-primary"
                                    onClick={() => setOwner(client.id)}
                                  >
                                    {t('affiliates.setOwner')}
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                          <UserPlus className="w-4 h-4" /> {t('affiliates.candidatesTitle')}
                        </h4>
                        {members.candidates.length === 0 ? (
                          <p className="text-xs text-text-secondary">{t('affiliates.noCandidates')}</p>
                        ) : (
                          <ul className="space-y-2">
                            {members.candidates.map((client) => (
                              <li key={client.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                                <div>
                                  <p className="font-semibold">{formatName(client)}</p>
                                  <p className="text-xs text-text-secondary">{client.affiliate_code_input || '-'}</p>
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
          ))
        )}
      </div>
    </div>
  );
}
