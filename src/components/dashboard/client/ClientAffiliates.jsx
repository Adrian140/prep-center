import React, { useEffect, useMemo, useState } from 'react';
import { supabaseHelpers } from '@/config/supabaseHelpers';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '@/translations';
import { useLanguage } from '@/contexts/LanguageContext';
import { MARKETS } from '@/contexts/MarketContext';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
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

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const MARKET_LABELS = {
  en: { FR: 'France', DE: 'Germany' },
  fr: { FR: 'France', DE: 'Allemagne' },
  ro: { FR: 'Franța', DE: 'Germania' },
  de: { FR: 'Frankreich', DE: 'Deutschland' },
  it: { FR: 'Francia', DE: 'Germania' },
  es: { FR: 'Francia', DE: 'Alemania' }
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
  const { currentLanguage } = useLanguage();
  const [status, setStatus] = useState('loading');
  const [clientStatus, setClientStatus] = useState(null);
  const [ownerSnapshots, setOwnerSnapshots] = useState({});
  const [error, setError] = useState('');
  const [requestForm, setRequestForm] = useState({ preferredCode: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState(null);
  const [copied, setCopied] = useState('');
  const [creditUsageByCodeMarket, setCreditUsageByCodeMarket] = useState({});
  const [creditAmounts, setCreditAmounts] = useState({});
  const [creditLoadingByMarket, setCreditLoadingByMarket] = useState({});
  const [creditFlashByMarket, setCreditFlashByMarket] = useState({});
  const [showAllMembersByMarket, setShowAllMembersByMarket] = useState({});
  const [expandedByMarket, setExpandedByMarket] = useState({});
  const [aliasCode, setAliasCode] = useState('');
  const [aliasSubmitting, setAliasSubmitting] = useState(false);
  const [aliasFlash, setAliasFlash] = useState(null);
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const [billingMonth, setBillingMonth] = useState(currentMonth);

  const marketsToShow = useMemo(() => Object.keys(MARKETS), []);
  const marketCards = useMemo(
    () =>
      marketsToShow.flatMap((market) => {
        const snapshot = ownerSnapshots?.[market];
        const codes = Array.isArray(snapshot?.codes) ? snapshot.codes : [];
        return codes.map((code, index) => ({
          key: `${market}:${code.id}`,
          market,
          code,
          isPrimary: index === 0,
          snapshot,
          members: (snapshot?.members || []).filter((member) => member.affiliate_code_id === code.id)
        }));
      }),
    [ownerSnapshots, marketsToShow]
  );

  const hasCode = marketCards.length > 0;
  const hasExpandedCard = useMemo(
    () => Object.values(expandedByMarket || {}).some(Boolean),
    [expandedByMarket]
  );
  const pendingRequest = clientStatus?.request || null;

  const resolvePercent = (code, amount) => {
    const payoutTiers = normalizeTiers(code?.payout_tiers || []);
    const base =
      Number(code?.percent_below_threshold || 0) ||
      Number(code?.percent_above_threshold || 0) ||
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

  const buildMembers = (code, members = []) => {
    if (!code || !Array.isArray(members)) return [];
    const type = code.payout_type || 'percentage';
    const mapped = members.map((member) => {
      const billed = Number(member.billing_total || 0);
      let payout = 0;
      let percent = 0;
      let thresholdMeta = null;
      if (type === 'threshold') {
        const threshold = Number(code.threshold_amount || 0);
        const fixed = Number(code.fixed_amount || 0);
        const reached = threshold > 0 && billed >= threshold;
        payout = reached ? fixed : 0;
        thresholdMeta = { threshold, fixed, reached };
      } else {
        percent = resolvePercent(code, billed);
        payout = (billed * percent) / 100;
      }
      return {
        ...member,
        billing_total: round2(billed),
        payout: round2(payout),
        percent,
        thresholdMeta
      };
    });
    return mapped.sort((a, b) => (b.billing_total || 0) - (a.billing_total || 0));
  };

  const buildTotals = (members = []) =>
    members.reduce(
      (acc, member) => {
        acc.billed += member.billing_total;
        acc.payout += member.payout || 0;
        acc.count += 1;
        return acc;
      },
      { billed: 0, payout: 0, count: 0 }
    );

  useEffect(() => {
    if (!profile?.id) return;
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, billingMonth]);

  const loadState = async () => {
    if (!profile?.id) return;
    setStatus('loading');
    setError('');
    try {
      const [clientInfo, ...ownerInfos] = await Promise.all([
        supabaseHelpers.getAffiliateClientStatus(profile.id),
        ...marketsToShow.map((market) =>
          supabaseHelpers.getAffiliateOwnerSnapshot(profile.id, {
            billingMonth: billingMonth || null,
            country: market
          })
        )
      ]);
      setClientStatus(clientInfo);
      const nextSnapshots = {};
      ownerInfos.forEach((info, idx) => {
        const market = marketsToShow[idx];
        nextSnapshots[market] = info?.data || null;
      });
      setOwnerSnapshots(nextSnapshots);
      const ownerCodeIds = Array.from(
        new Set(
          Object.values(nextSnapshots || {})
            .flatMap((snapshot) => (snapshot?.codes || []).map((code) => code.id))
            .filter(Boolean)
        )
      );
      if (profile?.company_id && ownerCodeIds.length > 0) {
        const credits = {};
        const creditResults = await Promise.all(
          ownerCodeIds.flatMap((codeId) =>
            marketsToShow.map((market) =>
            supabaseHelpers.getAffiliateCreditUsage({
              companyId: profile.company_id,
              codeId,
              billingMonth: billingMonth || null,
              country: market
            })
            )
          )
        );
        let idx = 0;
        ownerCodeIds.forEach((codeId) => {
          marketsToShow.forEach((market) => {
            credits[`${market}:${codeId}`] = Number(creditResults[idx]?.data?.used || 0);
            idx += 1;
          });
        });
        setCreditUsageByCodeMarket(credits);
      } else {
        setCreditUsageByCodeMarket({});
      }
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

  const buildAffiliateLink = (code) => {
    const raw = String(code || '').trim().toUpperCase();
    if (!raw) return '';
    const origin = window.location?.origin || '';
    return `${origin}/register?affiliate=${encodeURIComponent(raw)}`;
  };

  const handleCopyValue = async (value, token) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(token);
      setTimeout(() => setCopied(''), 1800);
    } catch (err) {
      console.error('copy affiliate code', err);
    }
  };

  const handleCreateAlias = async (event) => {
    event.preventDefault();
    const nextCode = String(aliasCode || '').trim().toUpperCase();
    if (!nextCode) {
      setAliasFlash({ type: 'error', message: t('ClientAffiliates.alias.errorRequired') });
      return;
    }
    setAliasSubmitting(true);
    setAliasFlash(null);
    try {
      const { error: requestError } = await supabaseHelpers.createAffiliateRequest({
        profile_id: profile?.id,
        preferred_code: nextCode,
        notes: t('ClientAffiliates.alias.requestNote')
      });
      if (requestError) throw requestError;
      setAliasCode('');
      setAliasFlash({ type: 'success', message: t('ClientAffiliates.alias.success') });
    } catch (err) {
      console.error('request affiliate alias', err);
      setAliasFlash({
        type: 'error',
        message: err.message || t('ClientAffiliates.alias.errorGeneric')
      });
    } finally {
      setAliasSubmitting(false);
    }
  };

  const handleRedeemCredit = async (cardKey, market, availableCredit) => {
    const raw = String(creditAmounts[cardKey] || '').replace(',', '.');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      setCreditFlashByMarket((prev) => ({
        ...prev,
        [cardKey]: { type: 'error', message: t('ClientAffiliates.credit.errorAmount') }
      }));
      return;
    }
    // toleranță de 1 cent pentru erorile de rotunjire
    const roundedAvailable = Math.floor(availableCredit * 100 + 0.0001) / 100;
    if (value > roundedAvailable + 0.009) {
      setCreditFlashByMarket((prev) => ({
        ...prev,
        [cardKey]: {
          type: 'error',
          message: tp('ClientAffiliates.credit.errorMax', {
            amount: euroFormatter.format(roundedAvailable)
          })
        }
      }));
      return;
    }
    setCreditLoadingByMarket((prev) => ({ ...prev, [cardKey]: true }));
    setCreditFlashByMarket((prev) => ({ ...prev, [cardKey]: null }));
    try {
      const { data, error } = await supabaseHelpers.redeemAffiliateCredit({
        amount: value,
        country: market
      });
      if (error) {
        throw error;
      }
      const payload = Array.isArray(data) ? data[0] : data;
      const applied = payload?.applied ?? Math.min(value, roundedAvailable);
      setCreditAmounts((prev) => ({ ...prev, [cardKey]: '' }));
      setCreditFlashByMarket((prev) => ({
        ...prev,
        [cardKey]: {
          type: 'success',
          message: tp('ClientAffiliates.credit.success', {
            amount: euroFormatter.format(applied)
          })
        }
      }));
      await loadState();
    } catch (err) {
      console.error('redeem affiliate credit', err);
      setCreditFlashByMarket((prev) => ({
        ...prev,
        [cardKey]: {
          type: 'error',
          message: err.message || t('ClientAffiliates.credit.errorApply')
        }
      }));
    } finally {
      setCreditLoadingByMarket((prev) => ({ ...prev, [cardKey]: false }));
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

      {hasCode && (
        <div className="border rounded-xl p-4 bg-white space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-secondary">
              {t('ClientAffiliates.alias.title')}
            </p>
            <p className="text-sm text-text-secondary mt-1">
              {t('ClientAffiliates.alias.description')}
            </p>
          </div>
          <form onSubmit={handleCreateAlias} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <input
              type="text"
              value={aliasCode}
              onChange={(e) => setAliasCode(e.target.value.toUpperCase())}
              placeholder={t('ClientAffiliates.alias.placeholder')}
              className="border rounded-lg px-3 py-2 uppercase flex-1"
              disabled={aliasSubmitting}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAliasCode(randomCode())}
                className="px-3 py-2 border rounded-lg text-sm text-text-secondary hover:text-text-primary"
                disabled={aliasSubmitting}
              >
                {t('ClientAffiliates.alias.generate')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
                disabled={aliasSubmitting}
              >
                {aliasSubmitting
                  ? t('ClientAffiliates.alias.submitting')
                  : t('ClientAffiliates.alias.submit')}
              </button>
            </div>
          </form>
          {aliasFlash && (
            <div
              className={`text-sm ${
                aliasFlash.type === 'success' ? 'text-green-700' : 'text-red-600'
              }`}
            >
              {aliasFlash.message}
            </div>
          )}
        </div>
      )}

      {hasCode && hasExpandedCard && (
        <div className="p-3 border rounded-xl bg-blue-50/80 text-sm text-text-secondary">
          {t('ClientAffiliates.rules.bonus')}
        </div>
      )}

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
        <div className="space-y-8">
          {marketCards.map((card) => {
            const { market, code, members: rawMembers, isPrimary } = card;
            const members = buildMembers(code, rawMembers);
            const totalsRaw = buildTotals(members);
            const totals = {
              ...totalsRaw,
              billed: round2(totalsRaw.billed),
              payout: round2(totalsRaw.payout)
            };
            const cardKey = `${market}:${code.id}`;
            const creditUsed = Number(creditUsageByCodeMarket?.[cardKey] || 0);
            const availableCredit = Math.max(round2((totals.payout || 0) - creditUsed), 0);
            const creditAmount = creditAmounts?.[cardKey] || '';
            const creditLoading = Boolean(creditLoadingByMarket?.[cardKey]);
            const creditFlash = creditFlashByMarket?.[cardKey] || null;
            const marketMeta = MARKETS[market] || { name: market, flag: '' };
            const localizedMarketName =
              MARKET_LABELS[currentLanguage]?.[market] ||
              MARKET_LABELS.en?.[market] ||
              marketMeta.name;
            const positiveMembers = members.filter((member) => Number(member.payout || 0) > 0);
            const zeroMembers = members.filter((member) => Number(member.payout || 0) <= 0);
            const showAllMembers = Boolean(showAllMembersByMarket?.[cardKey]);
            const visibleMembers = showAllMembers ? members : positiveMembers;
            const isExpanded = Boolean(expandedByMarket?.[cardKey]);
            return (
              <div key={cardKey} className="border rounded-2xl p-5 space-y-5 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{marketMeta.flag}</span>
                    <h3 className="text-lg font-semibold text-text-primary">{localizedMarketName}</h3>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg text-text-secondary hover:text-text-primary hover:border-text-primary/40 transition-colors"
                    onClick={() =>
                      setExpandedByMarket((prev) => ({ ...prev, [cardKey]: !prev?.[cardKey] }))
                    }
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {isExpanded
                      ? t('ClientAffiliates.actions.closeDetails') || 'Close'
                      : t('ClientAffiliates.actions.openDetails') || 'Open'}
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-5">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-secondary">
                        {t('ClientAffiliates.codeCard.title')}
                      </p>
                      <div className="flex items-center justify-between mt-2 gap-3">
                        <span className="text-2xl font-semibold break-all">{code?.code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyValue(code?.code, `${cardKey}-code`)}
                          className="text-sm text-primary flex items-center gap-1 shrink-0"
                        >
                          {copied === `${cardKey}-code` ? <ClipboardCheck className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                          {copied === `${cardKey}-code`
                            ? t('ClientAffiliates.codeCard.copied')
                            : t('ClientAffiliates.codeCard.copy')}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">
                        {code?.active
                          ? t('ClientAffiliates.codeCard.active')
                          : t('ClientAffiliates.codeCard.inactive')}
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-text-secondary">
                        {t('ClientAffiliates.codeCard.linkLabel')}
                      </p>
                      <a
                        href={buildAffiliateLink(code?.code)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-all text-xs text-primary hover:underline"
                      >
                        {buildAffiliateLink(code?.code)}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyValue(
                            buildAffiliateLink(code?.code),
                            `${cardKey}-link`
                          )
                        }
                        className="mt-2 text-xs text-primary inline-flex items-center gap-1"
                      >
                        {copied === `${cardKey}-link` ? <ClipboardCheck className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
                        {copied === `${cardKey}-link`
                          ? t('ClientAffiliates.codeCard.copied')
                          : t('ClientAffiliates.codeCard.copyLink')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-wide text-text-secondary">
                        {t('ClientAffiliates.stats.title')}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border rounded hover:bg-slate-100"
                            onClick={() => {
                              const prev = new Date(billingMonth || currentMonth);
                              prev.setMonth(prev.getMonth() - 1);
                              setBillingMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
                            }}
                          >
                            ‹
                          </button>
                          <input
                            type="month"
                            value={billingMonth}
                            onChange={(e) => setBillingMonth(e.target.value)}
                            className="border rounded px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            className="px-2 py-1 text-xs border rounded hover:bg-slate-100"
                            onClick={() => {
                              const next = new Date(billingMonth || currentMonth);
                              next.setMonth(next.getMonth() + 1);
                              setBillingMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
                            }}
                          >
                            ›
                          </button>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-text-secondary underline"
                          onClick={() => setBillingMonth(currentMonth)}
                        >
                          {t('ClientAffiliates.actions.resetMonth') || 'Current month'}
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4 space-y-2 text-sm text-text-secondary">
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
                      <div className="flex items-center justify-between">
                        <span>{t('ClientAffiliates.credit.used')}</span>
                        <strong className="text-text-primary">
                          {euroFormatter.format(creditUsed)}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t('ClientAffiliates.credit.remaining') || 'Remaining'}</span>
                        <strong className="text-text-primary">
                          {euroFormatter.format(Math.max(0, totals.payout - creditUsed))}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <>
                <div className="border-t pt-5 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-text-secondary">
                    {t('ClientAffiliates.rules.title')}
                  </p>
                  <p className="text-sm text-text-secondary">{t('ClientAffiliates.rules.bonus')}</p>
                  <PayoutSummary code={code} />
                </div>

                {isPrimary && (
                <div className="border-t pt-5 space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs uppercase tracking-wide text-text-secondary">
                      {t('ClientAffiliates.credit.title')}
                    </p>
                    <div className="text-sm text-text-secondary">
                      {t('ClientAffiliates.credit.used')}:{" "}
                      <strong className="text-text-primary">
                        {euroFormatter.format(creditUsed)}
                      </strong>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-text-secondary">
                      {t('ClientAffiliates.credit.available')}:{" "}
                      <strong className="text-text-primary">
                        {euroFormatter.format(availableCredit)}
                      </strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="border rounded-lg px-3 py-2 w-32 text-right"
                        placeholder={t('ClientAffiliates.credit.amountPh')}
                        value={creditAmount}
                        onChange={(e) =>
                          setCreditAmounts((prev) => ({ ...prev, [cardKey]: e.target.value }))
                        }
                        disabled={creditLoading || availableCredit <= 0}
                      />
                      <button
                        type="button"
                        className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
                        disabled={creditLoading || availableCredit <= 0}
                        onClick={() => handleRedeemCredit(cardKey, market, availableCredit)}
                      >
                        {creditLoading
                          ? t('ClientAffiliates.credit.applying')
                          : t('ClientAffiliates.credit.apply')}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 bg-gray-100 text-text-primary rounded-lg text-sm disabled:opacity-50"
                        disabled={creditLoading || availableCredit <= 0}
                        onClick={() => {
                          setCreditAmounts((prev) => ({
                            ...prev,
                            [cardKey]: String(availableCredit.toFixed(2))
                          }));
                          handleRedeemCredit(cardKey, market, availableCredit);
                        }}
                      >
                        {t('ClientAffiliates.credit.applyAll') || 'Apply all'}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {t('ClientAffiliates.credit.note')}
                  </p>
                  {creditFlash && (
                    <div
                      className={`text-sm ${
                        creditFlash.type === 'success'
                          ? 'text-green-700'
                          : 'text-red-600'
                      }`}
                    >
                      {creditFlash.message}
                    </div>
                  )}
                </div>
                )}

                <div className="border-t pt-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-text-secondary" />
                    <h3 className="font-semibold">{t('ClientAffiliates.members.title')}</h3>
                  </div>
                  {visibleMembers.length === 0 ? (
                    <p className="text-sm text-text-secondary">
                      {t('ClientAffiliates.members.empty')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {visibleMembers.map((member) => (
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
                              {t('ClientAffiliates.members.billed')}:{" "}
                              <strong className="text-text-primary">
                                {euroFormatter.format(member.billing_total)}
                              </strong>
                            </span>
                            {(code?.payout_type || 'percentage') === 'threshold' ? (
                              member.thresholdMeta?.reached ? (
                                <span className="text-text-primary font-semibold">
                                  {tp('ClientAffiliates.members.thresholdReached', {
                                    payout: euroFormatter.format(member.payout || Number(code?.fixed_amount || 0))
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
                                })}{" "}
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
                  {zeroMembers.length > 0 && !showAllMembers && (
                    <button
                      type="button"
                      className="mt-3 text-sm text-primary underline"
                      onClick={() =>
                        setShowAllMembersByMarket((prev) => ({ ...prev, [cardKey]: true }))
                      }
                    >
                      {t('ClientAffiliates.members.seeAll') || 'See all'}
                    </button>
                  )}
                  <p className="text-xs text-text-secondary mt-3">
                    {t('ClientAffiliates.members.hint')}
                  </p>
                </div>
                  </>
                )}
              </div>
            );
          })}
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
              <p className="text-xs text-text-secondary mt-1">{t('ClientAffiliates.request.applyCta')}</p>
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
  return null;
};
