// FILE: src/components/dashboard/SupabaseDashboard.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  User,
  Users,
  CreditCard,
  FileText,
  Shield,
  MapPin,
  Package,
  Boxes,
  RotateCcw,
  Download,
  Truck,
  Link2,
  ChevronDown,
  Settings,
  Store
} from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../translations';

import SupabasePersonalProfile from './SupabasePersonalProfile';
import SupabaseBillingProfiles from './SupabaseBillingProfiles';
import SupabaseInvoicesList from './SupabaseInvoicesList';
import SupabaseSecuritySettings from './SupabaseSecuritySettings';
import SupabaseClientSettings from './SupabaseClientSettings';
import SupabaseClientActivity from "./client/SupabaseClientActivity";

import ClientStock from './client/ClientStock';
import ClientReturns from './client/ClientReturns';
import ClientExports from './client/ClientExports';
import ClientReceiving from './client/ClientReceiving';
import ClientIntegrations from './client/ClientIntegrations';
import ClientPrepShipments from './client/ClientPrepShipments';
import ClientDealsPopover from './client/ClientDealsPopover';
import ClientAffiliates from './client/ClientAffiliates';
import ClientBoxEstimator from './client/ClientBoxEstimator';
import ClientQogitaShipments from './client/ClientQogitaShipments';
import ClientEtsyWorkspace from './client/ClientEtsyWorkspace';
import ClientFbaShipmentDetailsDrawer from './client/ClientFbaShipmentDetailsDrawer';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { tabSessionStorage } from '@/utils/tabStorage';
import { supabaseHelpers } from '@/config/supabase';
import { supabase } from '@/config/supabase';
import { Star, X } from 'lucide-react';

const BASE_REPORT_TABS = [
  { id: 'reports-shipments', labelKey: 'reportsMenu.shipments', icon: Package },
  { id: 'reports-receiving', labelKey: 'reportsMenu.receiving', icon: Truck },
  { id: 'reports-returns', labelKey: 'reportsMenu.returns', icon: RotateCcw }
];

function SupabaseDashboard() {
  const { t } = useDashboardTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasQogita, setHasQogita] = useState(false);
  const [qogitaLoading, setQogitaLoading] = useState(true);
  const [hasEtsy, setHasEtsy] = useState(false);
  const [etsyLoading, setEtsyLoading] = useState(true);
  const reportTabs = BASE_REPORT_TABS;

  const validTabs = [
    'activity',
    'stock',
    'box-estimator',
    'exports',
    'profile',
    'billing',
    'invoices',
    'integrations',
    'affiliates',
    'security',
    'settings',
    ...reportTabs.map((rt) => rt.id),
    'reports-qogita',
    'products-etsy'
  ];

  const normalizeTab = (tab) => {
    if (tab === 'receiving') return 'reports-receiving';
    if (tab === 'returns-report') return 'reports-returns';
    return tab;
  };
  const [activeTab, setActiveTab] = useState(() => {
    const params =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const initialTab = normalizeTab(params.get('tab'));
    let saved = null;
    try {
      const stored = tabSessionStorage.getItem('clientDashboardTab');
      saved = stored ? normalizeTab(stored) : null;
    } catch (err) {
      // sessionStorage might be unavailable (Safari private mode); fall back silently
      saved = null;
    }
    if (initialTab && validTabs.includes(initialTab)) return initialTab;
    return validTabs.includes(saved) ? saved : 'activity';
  });
  const [reportsOpen, setReportsOpen] = useState(false);
  const lastUrlTabRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlTab = normalizeTab(params.get('tab'));
    if (!urlTab || !validTabs.includes(urlTab)) return;
    if (lastUrlTabRef.current === urlTab) return;
    lastUrlTabRef.current = urlTab;
    if (urlTab !== activeTab) setActiveTab(urlTab);
  }, [location.search, activeTab, validTabs]);

  useEffect(() => {
    try {
      tabSessionStorage.setItem('clientDashboardTab', activeTab);
    } catch (err) {
      // ignore storage errors
    }
    const params = new URLSearchParams(location.search);
    const current = normalizeTab(params.get('tab'));
    if (current !== activeTab) {
      params.set('tab', activeTab);
      navigate(`/dashboard?${params.toString()}`);
    }
    lastUrlTabRef.current = activeTab;
  }, [activeTab, navigate]);

  useEffect(() => {
    if (reportTabs.some((rt) => rt.id === activeTab)) {
      setReportsOpen(true);
    }
  }, [activeTab, reportTabs]);

  const { user, profile } = useSupabaseAuth();
  const isLimitedAdmin = Boolean(profile?.is_limited_admin);

  useEffect(() => {
    if (isLimitedAdmin && activeTab === 'invoices') {
      setActiveTab('activity');
    }
  }, [isLimitedAdmin, activeTab]);

  useEffect(() => {
    let cancelled = false;
    const loadQogita = async () => {
      setQogitaLoading(true);
      if (!user?.id) {
        setHasQogita(false);
        setQogitaLoading(false);
        return;
      }
      const { data } = await supabase
        .from('qogita_connections')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setHasQogita(!!data);
      setQogitaLoading(false);
    };
    loadQogita();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadEtsy = async () => {
      setEtsyLoading(true);
      if (!user?.id) {
        setHasEtsy(false);
        setEtsyLoading(false);
        return;
      }
      const { data } = await supabase
        .from('etsy_integrations')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['active', 'connected'])
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setHasEtsy(!!data);
      setEtsyLoading(false);
    };
    loadEtsy();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'reports-qogita' && !qogitaLoading && !hasQogita) {
      setActiveTab('activity');
    }
  }, [activeTab, hasQogita, qogitaLoading]);

  useEffect(() => {
    if (activeTab === 'products-etsy' && !etsyLoading && !hasEtsy) {
      setActiveTab('stock');
    }
  }, [activeTab, hasEtsy, etsyLoading]);

  const companyId = profile?.company_id;
  const isAdmin =
    profile?.account_type === 'admin' ||
    profile?.is_admin === true ||
    user?.user_metadata?.account_type === 'admin';

  if (isAdmin && !isLimitedAdmin) {
    return <Navigate to="/admin" replace />;
  }
  const [reviewPrompt, setReviewPrompt] = useState({
    loading: true,
    eligible: false,
    hasReview: false,
    show: false
  });
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [fbaDetailsDrawer, setFbaDetailsDrawer] = useState({
    open: false,
    requestId: null,
    shipmentId: null
  });

  const openFbaDetailsDrawer = useCallback(({ requestId, shipmentId } = {}) => {
    if (!requestId && !shipmentId) return;
    setFbaDetailsDrawer({
      open: true,
      requestId,
      shipmentId: shipmentId || null
    });
  }, []);

  const closeFbaDetailsDrawer = useCallback(() => {
    setFbaDetailsDrawer((prev) => ({ ...prev, open: false }));
  }, []);

  const tabs = useMemo(() => {
    const list = [
      // Operations
      { id: 'activity', label: t('sidebar.activity'), icon: FileText, group: 'Operations' },
      { id: 'stock', label: t('sidebar.stock'), icon: Boxes, group: 'Operations' },
      { id: 'box-estimator', label: 'Box Estimator', icon: Truck, group: 'Operations' },
      { id: 'exports', label: t('sidebar.exports'), icon: Download, group: 'Operations' },

      // Account
      { id: 'profile', label: t('sidebar.profile'), icon: User, group: 'Account' },
      { id: 'billing', label: t('sidebar.billing'), icon: CreditCard, group: 'Account' },
      { id: 'invoices', label: t('sidebar.invoices'), icon: FileText, group: 'Account' },
      { id: 'integrations', label: 'Integrations', icon: Link2, group: 'Account' },
      { id: 'affiliates', label: t('sidebar.affiliates'), icon: Users, group: 'Account' },
      { id: 'security', label: t('sidebar.security'), icon: Shield, group: 'Account' },
      { id: 'settings', label: t('sidebar.settings'), icon: Settings, group: 'Account' }
    ];
    if (isLimitedAdmin) {
      return list.filter((tab) => tab.id !== 'invoices');
    }
    return list;
  }, [t, isLimitedAdmin]);

  // Review prompt pentru clienți (>60 zile de la prima recepție/prep)
  useEffect(() => {
    let mounted = true;
    const loadPrompt = async () => {
      if (!profile?.id) {
        if (mounted) setReviewPrompt((p) => ({ ...p, loading: false, show: false }));
        return;
      }
      const storageKey = `reviewPrompt:${profile.id}`;
      let snoozeUntil = null;
      let dismissed = false;
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey) || '{}');
        snoozeUntil = cached.snoozeUntil ? new Date(cached.snoozeUntil) : null;
        dismissed = cached.dismissed || false;
      } catch {}

      const now = new Date();
      if (dismissed || (snoozeUntil && snoozeUntil > now)) {
        if (mounted) setReviewPrompt((p) => ({ ...p, loading: false, show: false }));
        return;
      }

      const { data: firstReception } = await supabaseHelpers.getFirstReceptionDate(profile.id);
      const firstDate = firstReception ? new Date(firstReception) : null;
      const diffDays = firstDate ? (now - firstDate) / (1000 * 60 * 60 * 24) : 0;
      const eligible = firstDate && diffDays >= 60;

      let hasReview = false;
      const reviewerName =
        profile.store_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
        profile.email ||
        user?.email;
      if (reviewerName) {
        const { data: existing } = await supabaseHelpers.getUserReviewByName(reviewerName);
        hasReview = !!existing;
      }

      if (mounted) {
        setReviewPrompt({
          loading: false,
          eligible: !!eligible,
          hasReview,
          show: !!eligible && !hasReview
        });
      }
    };
    loadPrompt();
    return () => {
      mounted = false;
    };
  }, [profile?.id, profile?.store_name, profile?.first_name, profile?.last_name, profile?.email, user?.email]);

  const persistPromptState = (data) => {
    if (!profile?.id) return;
    const storageKey = `reviewPrompt:${profile.id}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}
  };

  const snoozePrompt = (days) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    persistPromptState({ snoozeUntil: until, dismissed: false });
    setReviewPrompt((p) => ({ ...p, show: false }));
  };

  const dismissPrompt = () => {
    persistPromptState({ dismissed: true });
    setReviewPrompt((p) => ({ ...p, show: false }));
  };

  const submitReview = async () => {
    if (!profile?.id) return;
    setReviewSubmitting(true);
    const reviewerName =
      [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
      'Client PrepCenter';
    try {
      await supabaseHelpers.createReview({
        reviewer_name: reviewerName,
        rating: reviewForm.rating || 5,
        review_text: reviewForm.text || 'Feedback intern',
        review_link: null
      });
      persistPromptState({ dismissed: true });
      setReviewPrompt((p) => ({ ...p, show: false, hasReview: true }));
      setReviewModal(false);
    } catch (e) {
      console.error('submit review failed', e);
    } finally {
      setReviewSubmitting(false);
    }
  };

const renderTabContent = useMemo(() => {
  switch (activeTab) {
    case 'activity':
      return <SupabaseClientActivity onOpenFbaShipmentDetails={openFbaDetailsDrawer} />;
    case 'stock':     return <ClientStock />;
    case 'products-etsy': return <ClientEtsyWorkspace />;
    case 'exports':   return <ClientExports />;
    case 'box-estimator': return <ClientBoxEstimator />;
    case 'reports-shipments': return <ClientPrepShipments />;
    case 'reports-qogita': return <ClientQogitaShipments />;
    case 'reports-receiving': return <ClientReceiving />;
    case 'reports-returns': return <ClientReturns />;

    case 'profile':   return <SupabasePersonalProfile />;
    case 'billing':   return <SupabaseBillingProfiles />;
    case 'invoices':
      return isLimitedAdmin ? (
        <div className="bg-white border rounded-xl p-6 text-sm text-text-secondary">
          Access restricted for this account.
        </div>
      ) : (
        <SupabaseInvoicesList />
      );
    case 'integrations': return <ClientIntegrations />;
    case 'affiliates': return <ClientAffiliates />;
    case 'security':  return <SupabaseSecuritySettings />;
    case 'settings': return <SupabaseClientSettings />;

    default:
      return (
        <div className="text-center text-gray-500 py-10">
          <p>Unknown tab: <strong>{activeTab}</strong></p>
          <p className="text-sm mt-2">Please reload the page or contact support.</p>
        </div>
      );
  }
}, [activeTab, isLimitedAdmin, t, openFbaDetailsDrawer]);

  const groups = [
    { key: 'Operations', label: t('common.groups.operations') },
    { key: 'Account',    label: t('common.groups.account') },
  ];

  return (
    <>
    <div className="min-h-screen bg-[#F8FAFB] py-2 notranslate" translate="no">
      <div className="w-full max-w-none mx-auto px-0 lg:px-0">
        {activeTab === 'activity' && isAdmin ? (
          <div className="flex flex-wrap items-center justify-end gap-3 mb-3">
            <ClientDealsPopover companyId={companyId} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-3 lg:gap-4">
          {/* Sidebar */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="bg-[#1B3A4B] rounded-r-xl lg:rounded-l-none lg:rounded-r-xl shadow-md p-3">
              {groups.map((g) => (
                <div key={g.key} className="mb-4">
                  <div className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-sky-300/60 font-semibold">
                    {g.label}
                  </div>
                  <nav className="space-y-0.5">
                    {tabs
                      .filter((tab) => tab.group === g.key)
                      .map((tab) => (
                        <React.Fragment key={tab.id}>
                          <button
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-md text-[13px] transition-all duration-200 ${
                              activeTab === tab.id
                                ? 'bg-gradient-to-r from-[#0EA5E9] to-[#14B8A6] text-white shadow-sm shadow-cyan-500/20'
                                : 'text-slate-300/80 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <tab.icon className="w-3.5 h-3.5 flex-shrink-0" />
                            {tab.label}
                          </button>

                          {g.key === 'Operations' && tab.id === 'stock' && (
                            <div className="ml-1 mt-1">
                              <button
                                onClick={() => setReportsOpen((v) => !v)}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 text-left rounded-md border border-white/10 text-[13px] text-slate-300/70 hover:bg-white/10 hover:text-white transition-all duration-200"
                              >
                                <span className="flex items-center gap-2">
                                  <FileText className="w-3.5 h-3.5" />
                                  {t('sidebar.reports')}
                                </span>
                                <ChevronDown
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    reportsOpen ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                              {reportsOpen && (
                                <div className="mt-1 space-y-0.5 pl-4">
                                  {reportTabs.map((reportTab) => (
                                    <button
                                      key={reportTab.id}
                                      onClick={() => setActiveTab(reportTab.id)}
                                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-md text-[13px] transition-all duration-200 ${
                                        activeTab === reportTab.id
                                          ? 'bg-gradient-to-r from-[#0EA5E9] to-[#14B8A6] text-white shadow-sm shadow-cyan-500/20'
                                          : 'text-slate-300/70 hover:bg-white/10 hover:text-white'
                                      }`}
                                    >
                                      <reportTab.icon className="w-3.5 h-3.5" />
                                      {t(reportTab.labelKey)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {g.key === 'Operations' && tab.id === 'stock' && hasEtsy && (
                            <button
                              onClick={() => setActiveTab('products-etsy')}
                              className={`ml-1 w-[calc(100%-0.25rem)] flex items-center gap-2 px-2.5 py-1.5 text-left rounded-md text-[13px] mt-1 border border-white/10 transition-all duration-200 ${
                                activeTab === 'products-etsy'
                                  ? 'bg-gradient-to-r from-[#0EA5E9] to-[#14B8A6] text-white shadow-sm shadow-cyan-500/20'
                                  : 'text-slate-300/70 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <Store className="w-3.5 h-3.5" />
                              Etsy
                            </button>
                          )}

                          {g.key === 'Operations' && tab.id === 'stock' && hasQogita && (
                            <button
                              onClick={() => setActiveTab('reports-qogita')}
                              className={`ml-1 w-[calc(100%-0.25rem)] flex items-center gap-2 px-2.5 py-1.5 text-left rounded-md text-[13px] mt-1 border border-white/10 transition-all duration-200 ${
                                activeTab === 'reports-qogita'
                                  ? 'bg-gradient-to-r from-[#0EA5E9] to-[#14B8A6] text-white shadow-sm shadow-cyan-500/20'
                                  : 'text-slate-300/70 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              {t('reportsMenu.qogita', 'Qogita')}
                            </button>
                          )}
                        </React.Fragment>
                      ))}
                  </nav>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div>
            {reviewPrompt.show && (
              <div className="mb-4 flex items-center gap-4 p-4 rounded-xl border border-cyan-200/60 bg-cyan-50/50 text-sm text-text-primary">
                <div className="p-2 rounded-full bg-[#0EA5E9]/15 text-[#0EA5E9]">
                  <Star className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{t('reviewPrompt.title')}</div>
                  <div className="text-text-secondary text-xs">{t('reviewPrompt.subtitle')}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => setReviewModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#0EA5E9] text-white text-sm hover:bg-[#0284C7] transition-colors"
                    >
                      {t('reviewPrompt.ctaNow')}
                    </button>
                    <button
                      onClick={() => snoozePrompt(30)}
                      className="px-3 py-1.5 rounded-lg border text-sm"
                    >
                      {t('reviewPrompt.snooze30')}
                    </button>
                    <button
                      onClick={() => snoozePrompt(60)}
                      className="px-3 py-1.5 rounded-lg border text-sm"
                    >
                      {t('reviewPrompt.snooze60')}
                    </button>
                    <button
                      onClick={dismissPrompt}
                      className="px-3 py-1.5 rounded-lg border text-sm text-text-secondary"
                    >
                      {t('reviewPrompt.dismiss')}
                    </button>
                  </div>
                </div>
                <button onClick={dismissPrompt} className="text-text-secondary hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div key={activeTab} className="bg-gradient-to-br from-white via-white to-sky-50/30 rounded-xl shadow-sm shadow-slate-200/50 border border-slate-200/60 p-5 animate-fade-in">
              <ErrorBoundary>
                {renderTabContent}
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>

    {reviewModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-text-primary">
                <Star className="w-5 h-5 text-amber-500" />
                <span className="font-semibold">{t('reviewPrompt.modalTitle')}</span>
              </div>
              <button onClick={() => setReviewModal(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {[1,2,3,4,5].map((r) => (
                <button
                  key={r}
                  onClick={() => setReviewForm((f) => ({ ...f, rating: r }))}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center ${
                    reviewForm.rating === r ? 'bg-amber-100 border-amber-400 text-amber-600' : 'bg-white'
                  }`}
                >
                  {r}★
                </button>
              ))}
            </div>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={4}
              placeholder={t('reviewPrompt.modalPlaceholder')}
              value={reviewForm.text}
              onChange={(e) => setReviewForm((f) => ({ ...f, text: e.target.value }))}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReviewModal(false)}
                className="px-3 py-1.5 rounded-lg border text-sm text-text-secondary"
              >
                {t('reviewPrompt.modalCancel')}
              </button>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting}
                className="px-3 py-1.5 rounded-lg bg-[#0EA5E9] text-white text-sm disabled:opacity-60 hover:bg-[#0284C7] transition-colors"
              >
                {reviewSubmitting ? t('reviewPrompt.modalSubmitting') : t('reviewPrompt.modalSubmit')}
              </button>
            </div>
          </div>
        </div>
    )}

    <ClientFbaShipmentDetailsDrawer
      open={fbaDetailsDrawer.open}
      requestId={fbaDetailsDrawer.requestId}
      shipmentId={fbaDetailsDrawer.shipmentId}
      onClose={closeFbaDetailsDrawer}
    />
    </>
  );
}

export default SupabaseDashboard;
