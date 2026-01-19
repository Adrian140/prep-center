// FILE: src/components/dashboard/SupabaseDashboard.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  Users,
  CreditCard,
  FileText,
  Shield,
  MapPin,
  Package,
  Boxes,
  BarChart3,
  RotateCcw,
  Download,
  Truck,
  Link2,
  ChevronDown,
  Settings
} from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../translations';

import SupabasePersonalProfile from './SupabasePersonalProfile';
import SupabaseBillingProfiles from './SupabaseBillingProfiles';
import SupabaseInvoicesList from './SupabaseInvoicesList';
import SupabaseSecuritySettings from './SupabaseSecuritySettings';
import SupabaseClientSettings from './SupabaseClientSettings';
import SupabaseClientActivity from "./client/SupabaseClientActivity";
import ClientAnalytics from "./client/ClientAnalytics";

import ClientStock from './client/ClientStock';
import ClientReturns from './client/ClientReturns';
import ClientExports from './client/ClientExports';
import ClientReceiving from './client/ClientReceiving';
import ClientIntegrations from './client/ClientIntegrations';
import ClientPrepShipments from './client/ClientPrepShipments';
import ClientDealsPopover from './client/ClientDealsPopover';
import ClientBalanceBar from './client/ClientBalanceBar';
import ClientAffiliates from './client/ClientAffiliates';
import ClientBoxEstimator from './client/ClientBoxEstimator';
import { tabSessionStorage } from '@/utils/tabStorage';
import { supabaseHelpers } from '@/config/supabase';
import { Star, X } from 'lucide-react';

const REPORT_TABS = [
  { id: 'reports-shipments', labelKey: 'reportsMenu.shipments', icon: Package },
  { id: 'reports-receiving', labelKey: 'reportsMenu.receiving', icon: Truck },
  { id: 'reports-returns', labelKey: 'reportsMenu.returns', icon: RotateCcw }
];

function SupabaseDashboard() {
  const { t } = useDashboardTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const validTabs = [
    'activity',
    'analytics',
    'stock',
    'exports',
    'profile',
    'billing',
    'invoices',
    'integrations',
    'affiliates',
    'security',
    'settings',
    ...REPORT_TABS.map((rt) => rt.id)
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
  const [reportsOpen, setReportsOpen] = useState(() =>
    REPORT_TABS.some((rt) => rt.id === activeTab)
  );

useEffect(() => {
  try {
    tabSessionStorage.setItem('clientDashboardTab', activeTab);
  } catch (err) {
    // ignore storage errors
  }
  const current = new URLSearchParams(location.search).get('tab');
  if (current !== activeTab) {
    navigate(`/dashboard?tab=${activeTab}`, { replace: true });
  }
}, [activeTab, location.search, navigate]);

useEffect(() => {
  if (REPORT_TABS.some((rt) => rt.id === activeTab)) {
    setReportsOpen(true);
  }
}, [activeTab]);

  const { user, profile } = useSupabaseAuth();
  const isLimitedAdmin = Boolean(profile?.is_limited_admin);

  useEffect(() => {
    if (isLimitedAdmin && activeTab === 'invoices') {
      setActiveTab('activity');
    }
  }, [isLimitedAdmin, activeTab]);

  const companyId = profile?.company_id;
  const [reviewPrompt, setReviewPrompt] = useState({
    loading: true,
    eligible: false,
    hasReview: false,
    show: false
  });
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, text: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const tabs = useMemo(() => {
    const list = [
      // Operations
      { id: 'activity', label: t('sidebar.activity'), icon: FileText, group: 'Operations' },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Operations' },
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
      profile.store_name ||
      [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
      profile.email ||
      user?.email ||
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
    case 'activity':  return <SupabaseClientActivity />;
    case 'analytics': return <ClientAnalytics />;
    case 'stock':     return <ClientStock />;
    case 'exports':   return <ClientExports />;
    case 'box-estimator': return <ClientBoxEstimator />;
    case 'reports-shipments': return <ClientPrepShipments />;
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
}, [activeTab, isLimitedAdmin, t]);

  const groups = [
    { key: 'Operations', label: t('common.groups.operations') },
    { key: 'Account',    label: t('common.groups.account') },
  ];

  return (
    <>
    <div className="min-h-screen bg-gray-50 py-4">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
        {activeTab === 'activity' && (
          <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
            <ClientDealsPopover companyId={companyId} />
            {!isLimitedAdmin && (
              <ClientBalanceBar companyId={companyId} variant="compact" />
            )}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6 lg:gap-8">
          {/* Sidebar */}
          <div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              {groups.map((g) => (
                <div key={g.key} className="mb-6">
                  <div className="px-1 pb-2 text-[11px] uppercase tracking-wide text-text-light">
                    {g.label}
                  </div>
                  <nav className="space-y-1.5">
                    {tabs
                      .filter((tab) => tab.group === g.key)
                      .map((tab) => (
                        <React.Fragment key={tab.id}>
                          <button
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm transition-colors ${
                              activeTab === tab.id
                                ? 'bg-primary text-white'
                                : 'text-text-secondary hover:bg-gray-50'
                            }`}
                          >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                          </button>

                          {g.key === 'Operations' && tab.id === 'stock' && (
                            <div className="ml-2 mt-2">
                              <button
                                onClick={() => setReportsOpen((v) => !v)}
                                className="w-full flex items-center justify-between px-3 py-2 text-left rounded-lg border text-sm text-text-secondary hover:bg-gray-50"
                              >
                                <span className="flex items-center gap-2">
                                  <FileText className="w-4 h-4" />
                                  {t('sidebar.reports')}
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${
                                    reportsOpen ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                              {reportsOpen && (
                                <div className="mt-2 space-y-1.5 pl-5">
                                  {REPORT_TABS.map((reportTab) => (
                                    <button
                                      key={reportTab.id}
                                      onClick={() => setActiveTab(reportTab.id)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm transition-colors ${
                                        activeTab === reportTab.id
                                          ? 'bg-primary/90 text-white'
                                          : 'text-text-secondary hover:bg-gray-50'
                                      }`}
                                    >
                                      <reportTab.icon className="w-4 h-4" />
                                      {t(reportTab.labelKey)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
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
              <div className="mb-4 flex items-center gap-4 p-4 rounded-xl border bg-blue-50/70 text-sm text-text-primary">
                <div className="p-2 rounded-full bg-blue-100 text-blue-700">
                  <Star className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{t('reviewPrompt.title')}</div>
                  <div className="text-text-secondary text-xs">{t('reviewPrompt.subtitle')}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => setReviewModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm"
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
            <div className="bg-white rounded-xl shadow-sm p-5 animate-fade-in">
              {renderTabContent}
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
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
              >
                {reviewSubmitting ? t('reviewPrompt.modalSubmitting') : t('reviewPrompt.modalSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SupabaseDashboard;
