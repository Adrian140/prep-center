import React, { useEffect, useMemo, useState } from 'react';
import { supabaseHelpers } from '@/config/supabaseHelpers';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '@/translations';
import {
  AlertCircle,
  Clipboard,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Sparkles,
  Users
} from 'lucide-react';

const formatClientName = (client) => {
  const bits = [client?.first_name, client?.last_name].filter(Boolean);
  if (bits.length) return bits.join(' ');
  if (client?.company_name) return client.company_name;
  if (client?.store_name) return client.store_name;
  return '—';
};

const euroFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2
});

const randomCode = () => {
  const chunk = () => Math.random().toString(36).substring(2, 4).toUpperCase();
  return `AF-${chunk()}${chunk()}-${Math.floor(Math.random() * 90 + 10)}`;
};

const computeCommission = (amount, code) => {
  if (!code) return 0;
  const value = Number(amount || 0);
  if (value <= 0) return 0;
  const payoutType = code.payout_type || 'percentage';
  if (payoutType === 'fixed') {
    const threshold = Number(code.threshold_amount || 0);
    if (!code.fixed_amount) return 0;
    return threshold && value < threshold ? 0 : Number(code.fixed_amount);
  }
  if (payoutType === 'threshold') {
    const threshold = Number(code.threshold_amount || 0);
    const below = Number(code.percent_below_threshold || 0);
    const above = Number(code.percent_above_threshold || below);
    const percent = threshold && value >= threshold ? above : below;
    return (value * percent) / 100;
  }
  const percent =
    Number(code.percent_below_threshold || 0) || Number(code.percent_above_threshold || 0);
  return (value * percent) / 100;
};

export default function ClientAffiliates() {
  const { profile } = useSupabaseAuth();
  const { t } = useDashboardTranslation();
  const [status, setStatus] = useState('loading');
  const [clientStatus, setClientStatus] = useState(null);
  const [ownerSnapshot, setOwnerSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [requestForm, setRequestForm] = useState({ preferredCode: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [copied, setCopied] = useState(false);

  const hasCode = !!ownerSnapshot?.code;
  const pendingRequest = clientStatus?.request || null;

  const members = useMemo(() => {
    if (!ownerSnapshot?.members) return [];
    return ownerSnapshot.members.map((member) => {
      const billed = Number(member.billing_total || 0);
      const commission = computeCommission(billed, ownerSnapshot.code);
      return {
        ...member,
        billing_total: billed,
        commission
      };
    });
  }, [ownerSnapshot]);

  const totals = useMemo(() => {
    return members.reduce(
      (acc, member) => {
        acc.billed += member.billing_total;
        acc.commission += member.commission;
        acc.count += 1;
        return acc;
      },
      { billed: 0, commission: 0, count: 0 }
    );
  }, [members]);

  useEffect(() => {
    if (!profile?.id) return;
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const loadState = async () => {
    if (!profile?.id) return;
    setStatus('loading');
    setError('');
    try {
      const [clientInfo, ownerInfo] = await Promise.all([
        supabaseHelpers.getAffiliateClientStatus(profile.id),
        supabaseHelpers.getAffiliateOwnerSnapshot(profile.id)
      ]);
      setClientStatus(clientInfo);
      setOwnerSnapshot(ownerInfo?.data || null);
      setStatus('ready');
    } catch (err) {
      console.error('load affiliate state', err);
      setError(err.message || 'Failed to load affiliate information.');
      setStatus('error');
    }
  };

  const handleRequest = async (event) => {
    event.preventDefault();
    if (!profile?.id || hasCode || pendingRequest) return;
    setSubmitting(true);
    setFlash(null);
    try {
      await supabaseHelpers.createAffiliateRequest({
        profile_id: profile.id,
        preferred_code: requestForm.preferredCode,
        notes: requestForm.notes
      });
      setRequestForm({ preferredCode: '', notes: '' });
      setFlash({ type: 'success', message: t('ClientAffiliates.flash.requestSent') });
      await loadState();
    } catch (err) {
      console.error('createAffiliateRequest', err);
      setFlash({
        type: 'error',
        message: err.message || t('ClientAffiliates.flash.requestError')
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!ownerSnapshot?.code?.code) return;
    try {
      await navigator.clipboard.writeText(ownerSnapshot.code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('copy affiliate code', err);
    }
  };

  const requestStatusMessage = pendingRequest
    ? t(`ClientAffiliates.status.${pendingRequest.status || 'pending'}`)
    : t('ClientAffiliates.status.needCode');

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-text-secondary">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
        <button
          type="button"
          className="mt-3 text-sm text-red-700 underline"
          onClick={loadState}
        >
          {t('ClientAffiliates.actions.refresh')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">
            {t('ClientAffiliates.title')}
          </h2>
          <p className="text-sm text-text-secondary">{t('ClientAffiliates.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={loadState}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg text-text-secondary hover:text-text-primary hover:border-text-primary/40 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> {t('ClientAffiliates.actions.refresh')}
        </button>
      </div>

      {flash && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            flash.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {flash.message}
        </div>
      )}

      {hasCode ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-text-secondary">
                {t('ClientAffiliates.codeCard.title')}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-2xl font-semibold">{ownerSnapshot.code.code}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-sm text-primary flex items-center gap-1"
                >
                  {copied ? <ClipboardCheck className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                  {copied
                    ? t('ClientAffiliates.codeCard.copied')
                    : t('ClientAffiliates.codeCard.copy')}
                </button>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {ownerSnapshot.code.active
                  ? t('ClientAffiliates.codeCard.active')
                  : t('ClientAffiliates.codeCard.inactive')}
              </p>
            </div>

            <div className="border rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-text-secondary">
                {t('ClientAffiliates.rules.title')}
              </p>
              <PayoutSummary code={ownerSnapshot.code} />
            </div>

            <div className="border rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-text-secondary">
                {t('ClientAffiliates.stats.title')}
              </p>
              <div className="mt-2 space-y-1 text-sm text-text-secondary">
                <div className="flex items-center justify-between">
                  <span>{t('ClientAffiliates.stats.clients')}</span>
                  <strong className="text-text-primary">{totals.count}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('ClientAffiliates.stats.billed')}</span>
                  <strong className="text-text-primary">
                    {euroFormatter.format(totals.billed)}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('ClientAffiliates.stats.payout')}</span>
                  <strong className="text-text-primary">
                    {euroFormatter.format(totals.commission)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-text-secondary" />
              <h3 className="font-semibold">{t('ClientAffiliates.members.title')}</h3>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-text-secondary">
                {t('ClientAffiliates.members.empty')}
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border rounded-lg p-3"
                  >
                    <div>
                      <p className="font-medium">{formatClientName(member)}</p>
                      <p className="text-xs text-text-secondary">
                        {member.company_name || member.store_name || member.country || ''}
                      </p>
                    </div>
                    <div className="text-sm text-text-secondary flex flex-wrap gap-4">
                      <span>
                        {t('ClientAffiliates.members.billed')}:{' '}
                        <strong className="text-text-primary">
                          {euroFormatter.format(member.billing_total)}
                        </strong>
                      </span>
                      <span>
                        {t('ClientAffiliates.members.payout')}:{' '}
                        <strong className="text-text-primary">
                          {euroFormatter.format(member.commission)}
                        </strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-text-secondary mt-3">
              {t('ClientAffiliates.members.hint')}
            </p>
          </div>
        </div>
      ) : pendingRequest ? (
        <div className="border rounded-xl p-6 bg-slate-50 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-text-primary">
                {t('ClientAffiliates.request.pendingTitle')}
              </h3>
              <p className="text-sm text-text-secondary">{requestStatusMessage}</p>
            </div>
          </div>
          <div className="text-sm text-text-secondary">
            <p>
              {t('ClientAffiliates.request.details', {
                code: pendingRequest.preferred_code || '—'
              })}
            </p>
            {pendingRequest.notes && (
              <p className="mt-1 italic text-text-secondary">{pendingRequest.notes}</p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleRequest} className="border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold">{t('ClientAffiliates.request.title')}</h3>
              <p className="text-sm text-text-secondary">{t('ClientAffiliates.request.desc')}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-1 block">
                {t('ClientAffiliates.request.preferred')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={requestForm.preferredCode}
                  onChange={(e) =>
                    setRequestForm((prev) => ({ ...prev, preferredCode: e.target.value.toUpperCase() }))
                  }
                  placeholder={t('ClientAffiliates.request.preferredPh')}
                  className="w-full border rounded-lg px-3 py-2 uppercase"
                />
                <button
                  type="button"
                  onClick={() =>
                    setRequestForm((prev) => ({ ...prev, preferredCode: randomCode() }))
                  }
                  className="text-sm px-3 py-2 border rounded-lg text-text-secondary hover:text-text-primary"
                >
                  {t('ClientAffiliates.request.generate')}
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                {t('ClientAffiliates.request.preferredHint')}
              </p>
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-1 block">
                {t('ClientAffiliates.request.notes')}
              </label>
              <textarea
                rows={3}
                value={requestForm.notes}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder={t('ClientAffiliates.request.notesPh')}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting
                ? t('ClientAffiliates.request.submitting')
                : t('ClientAffiliates.request.submit')}
            </button>
            <p className="text-xs text-text-secondary">{t('ClientAffiliates.request.footer')}</p>
          </div>
        </form>
      )}
    </div>
  );
}

const PayoutSummary = ({ code }) => {
  const { t } = useDashboardTranslation();
  if (!code) {
    return <p className="text-sm text-text-secondary">{t('ClientAffiliates.rules.missing')}</p>;
  }
  const payoutType = code.payout_type || 'percentage';
  if (payoutType === 'fixed') {
    return (
      <p className="text-sm text-text-secondary">
        {t('ClientAffiliates.rules.fixed', {
          threshold: euroFormatter.format(Number(code.threshold_amount || 0)),
          amount: euroFormatter.format(Number(code.fixed_amount || 0))
        })}
      </p>
    );
  }
  if (payoutType === 'threshold') {
    return (
      <p className="text-sm text-text-secondary">
        {t('ClientAffiliates.rules.threshold', {
          threshold: euroFormatter.format(Number(code.threshold_amount || 0)),
          below: Number(code.percent_below_threshold || 0),
          above: Number(code.percent_above_threshold || 0)
        })}
      </p>
    );
  }
  return (
    <p className="text-sm text-text-secondary">
      {t('ClientAffiliates.rules.percent', {
        percent: Number(code.percent_below_threshold || code.percent_above_threshold || 0)
      })}
    </p>
  );
};
