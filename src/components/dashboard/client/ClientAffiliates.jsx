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

const normalizeTiers = (tiers) => {
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

export default function ClientAffiliates() {
  const { profile } = useSupabaseAuth();
  const { t, tp } = useDashboardTranslation();
  const [status, setStatus] = useState('loading');
  const [clientStatus, setClientStatus] = useState(null);
  const [ownerSnapshot, setOwnerSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [requestForm, setRequestForm] = useState({ preferredCode: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [copied, setCopied] = useState(false);

  const payoutCode = ownerSnapshot?.code || null;
  const payoutTiers = useMemo(
    () => normalizeTiers(payoutCode?.payout_tiers || []),
    [payoutCode?.payout_tiers]
  );

  const hasCode = !!ownerSnapshot?.code;
  const payoutType = payoutCode?.payout_type || 'percentage';
  const pendingRequest = clientStatus?.request || null;

  const resolvePercent = (amount) => {
    const base =
      Number(payoutCode?.percent_below_threshold || 0) ||
      Number(payoutCode?.percent_above_threshold || 0) ||
      0;
    if (payoutTiers.length === 0) return base;
    let percent = base;
    payoutTiers.forEach((tier) => {
      if (amount >= tier.min_amount) {
        percent = tier.percent;
      }
    });
    return percent;
  };

  const members = useMemo(() => {
    if (!ownerSnapshot?.members || !payoutCode) return [];
    const type = payoutCode.payout_type || 'percentage';
    return ownerSnapshot.members.map((member) => {
      const billed = Number(member.billing_total || 0);
      let payout = 0;
      let percent = 0;
      let thresholdMeta = null;
      if (type === 'threshold') {
        const threshold = Number(payoutCode.threshold_amount || 0);
        const fixed = Number(payoutCode.fixed_amount || 0);
        const reached = threshold > 0 && billed >= threshold;
        payout = reached ? fixed : 0;
        thresholdMeta = { threshold, fixed, reached };
      } else {
        percent = resolvePercent(billed);
        payout = (billed * percent) / 100;
      }
      return {
        ...member,
        billing_total: billed,
        payout,
        percent,
        thresholdMeta
      };
    });
  }, [ownerSnapshot, payoutCode, payoutTiers]);

  const totals = useMemo(() => {
    return members.reduce(
      (acc, member) => {
        acc.billed += member.billing_total;
        acc.payout += member.payout || 0;
        acc.count += 1;
        return acc;
      },
      { billed: 0, payout: 0, count: 0 }
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
                    {euroFormatter.format(totals.payout)}
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
                      {payoutType === 'threshold' ? (
                        member.thresholdMeta?.reached ? (
                          <span className="text-text-primary font-semibold">
                            {tp('ClientAffiliates.members.thresholdReached', {
                              payout: euroFormatter.format(member.payout || Number(payoutCode?.fixed_amount || 0))
                            })}
                          </span>
                        ) : member.thresholdMeta?.threshold ? (
                          <span>
                            {tp('ClientAffiliates.members.thresholdProgress', {
                              billed: euroFormatter.format(member.billing_total),
                              threshold: euroFormatter.format(member.thresholdMeta.threshold)
                            })}
                          </span>
                        ) : null
                      ) : (
                        <span>
                          {tp('ClientAffiliates.members.payoutPercent', {
                            percent: member.percent || 0
                          })}{' '}
                          <strong className="text-text-primary">
                            {euroFormatter.format(member.payout || 0)}
                          </strong>
                        </span>
                      )}
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
              {tp('ClientAffiliates.request.details', {
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
  const { t, tp } = useDashboardTranslation();
  if (!code) {
    return <p className="text-sm text-text-secondary">{t('ClientAffiliates.rules.missing')}</p>;
  }
  const payoutType = code.payout_type || 'percentage';
  if (payoutType === 'threshold') {
    return (
      <p className="text-sm text-text-secondary">
        {tp('ClientAffiliates.rules.fixed', {
          threshold: euroFormatter.format(Number(code.threshold_amount || 0)),
          amount: euroFormatter.format(Number(code.fixed_amount || 0))
        })}
      </p>
    );
  }
  const tiers = normalizeTiers(code.payout_tiers || []);
  if (tiers.length > 0) {
    return (
      <ul className="text-xs text-text-secondary space-y-1">
        {tiers.map((tier, index) => (
          <li key={index}>
            {tp('ClientAffiliates.rules.tier', {
              amount: euroFormatter.format(tier.min_amount),
              percent: tier.percent
            })}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-sm text-text-secondary">
      {tp('ClientAffiliates.rules.percent', {
        percent: Number(code.percent_below_threshold || code.percent_above_threshold || 0)
      })}
    </p>
  );
};
