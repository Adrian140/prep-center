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
  RotateCcw,
  Download,
  Truck,
  Link2,
  ChevronDown
} from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../translations';

import SupabasePersonalProfile from './SupabasePersonalProfile';
import SupabaseBillingProfiles from './SupabaseBillingProfiles';
import SupabaseInvoicesList from './SupabaseInvoicesList';
import SupabaseSecuritySettings from './SupabaseSecuritySettings';
import SupabaseClientActivity from "./client/SupabaseClientActivity";

import ClientStock from './client/ClientStock';
import ClientReturns from './client/ClientReturns';
import ClientExports from './client/ClientExports';
import ClientReceiving from './client/ClientReceiving';
import ClientIntegrations from './client/ClientIntegrations';
import ClientPrepShipments from './client/ClientPrepShipments';
import ClientDealsPopover from './client/ClientDealsPopover';
import ClientBalanceBar from './client/ClientBalanceBar';
import ClientAffiliates from './client/ClientAffiliates';
import { tabSessionStorage } from '@/utils/tabStorage';

const REPORT_TABS = [
  { id: 'reports-shipments', labelKey: 'reportsMenu.shipments', icon: Package },
  { id: 'reports-receiving', labelKey: 'reportsMenu.receiving', icon: Truck }
];

function SupabaseDashboard() {
  const { t } = useDashboardTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const validTabs = [
    'activity',
    'stock',
    'returns',
    'exports',
    'profile',
    'billing',
    'invoices',
    'integrations',
    'affiliates',
    'security',
    ...REPORT_TABS.map((rt) => rt.id)
  ];

  const normalizeTab = (tab) => (tab === 'receiving' ? 'reports-receiving' : tab);
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
  const companyId = profile?.company_id;

  const tabs = [
    // Operations
    { id: 'activity', label: t('sidebar.activity'), icon: FileText, group: 'Operations' },
    { id: 'stock', label: t('sidebar.stock'), icon: Boxes, group: 'Operations' },
    { id: 'returns', label: t('sidebar.returns'), icon: RotateCcw, group: 'Operations' },
    { id: 'exports', label: t('sidebar.exports'), icon: Download, group: 'Operations' },

    // Account
    { id: 'profile', label: t('sidebar.profile'), icon: User, group: 'Account' },
    { id: 'billing', label: t('sidebar.billing'), icon: CreditCard, group: 'Account' },
    { id: 'invoices', label: t('sidebar.invoices'), icon: FileText, group: 'Account' },
    { id: 'integrations', label: 'Integrations', icon: Link2, group: 'Account' },
    { id: 'affiliates', label: t('sidebar.affiliates'), icon: Users, group: 'Account' },
    { id: 'security', label: t('sidebar.security'), icon: Shield, group: 'Account' }
  ];

const renderTabContent = useMemo(() => {
  switch (activeTab) {
    case 'activity':  return <SupabaseClientActivity />;
    case 'stock':     return <ClientStock />;
    case 'returns':   return <ClientReturns />;
    case 'exports':   return <ClientExports />;
    case 'reports-shipments': return <ClientPrepShipments />;
    case 'reports-receiving': return <ClientReceiving />;

    case 'profile':   return <SupabasePersonalProfile />;
    case 'billing':   return <SupabaseBillingProfiles />;
    case 'invoices':  return <SupabaseInvoicesList />;
    case 'integrations': return <ClientIntegrations />;
    case 'affiliates': return <ClientAffiliates />;
    case 'security':  return <SupabaseSecuritySettings />;

    default:
      return (
        <div className="text-center text-gray-500 py-10">
          <p>Unknown tab: <strong>{activeTab}</strong></p>
          <p className="text-sm mt-2">Please reload the page or contact support.</p>
        </div>
      );
  }
}, [activeTab]);

  const groups = [
    { key: 'Operations', label: t('common.groups.operations') },
    { key: 'Account',    label: t('common.groups.account') },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-4">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">
        {activeTab === 'activity' && (
          <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
            <ClientDealsPopover companyId={companyId} />
            <ClientBalanceBar companyId={companyId} variant="compact" />
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
            <div className="bg-white rounded-xl shadow-sm p-5 animate-fade-in">
              {renderTabContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SupabaseDashboard;
