// FILE: src/components/dashboard/SupabaseDashboard.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User, CreditCard, FileText, Shield, MapPin, LogOut,
  Package, Boxes, RotateCcw, Download, Truck, Link2
} from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../translations';

import SupabasePersonalProfile from './SupabasePersonalProfile';
import SupabaseBillingProfiles from './SupabaseBillingProfiles';
import SupabaseInvoicesList from './SupabaseInvoicesList';
import SupabaseSecuritySettings from './SupabaseSecuritySettings';
import SupabaseClientActivity from "./client/SupabaseClientActivity";

import ClientFBAReport from './client/ClientFBAReport';
import ClientFBMReport from './client/ClientFBMReport';
import ClientStock from './client/ClientStock';
import ClientReturns from './client/ClientReturns';
import ClientExports from './client/ClientExports';
import ClientReceiving from './client/ClientReceiving';
import ClientIntegrations from './client/ClientIntegrations';

function SupabaseDashboard() {
  const { t, tp } = useDashboardTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Save & restore last selected tab
  const [activeTab, setActiveTab] = useState(() => {
  const params = new URLSearchParams(window.location.search);
  const initialTab = params.get('tab');
  const saved = localStorage.getItem('clientDashboardTab');
  const validTabs = [
    'activity', 'receiving', 'fba', 'fbm', 'stock',
    'returns', 'exports', 'profile', 'billing', 'invoices', 'security'
  ];
  if (initialTab && validTabs.includes(initialTab)) return initialTab;
  return validTabs.includes(saved) ? saved : 'fba';
});

useEffect(() => {
  localStorage.setItem('clientDashboardTab', activeTab);
  const current = new URLSearchParams(location.search).get('tab');
  if (current !== activeTab) {
    navigate(`/dashboard?tab=${activeTab}`, { replace: true });
  }
}, [activeTab, location.search, navigate]);

  const { user, profile, signOut } = useSupabaseAuth();

  const tabs = [
    // Operations
    { id: 'activity', label: t('sidebar.activity'), icon: FileText,  group: 'Operations' },
    { id: 'receiving', label: 'Réception', icon: Truck, group: 'Operations' },
    { id: 'fba',      label: t('sidebar.fba'),      icon: Package,   group: 'Operations' },
    { id: 'fbm',      label: t('sidebar.fbm'),      icon: Package,   group: 'Operations' },
    { id: 'stock',    label: t('sidebar.stock'),    icon: Boxes,     group: 'Operations' },
    { id: 'returns',  label: t('sidebar.returns'),  icon: RotateCcw, group: 'Operations' },
    { id: 'exports',  label: t('sidebar.exports'),  icon: Download,  group: 'Operations' },

    // Account
    { id: 'profile',      label: t('sidebar.profile'),      icon: User,      group: 'Account' },
    { id: 'billing',      label: t('sidebar.billing'),      icon: CreditCard, group: 'Account' },
    { id: 'invoices',     label: t('sidebar.invoices'),     icon: FileText,  group: 'Account' },
    { id: 'integrations', label: 'Integrations',            icon: Link2,     group: 'Account' },
    { id: 'security',     label: t('sidebar.security'),     icon: Shield,    group: 'Account' },
  ];

const renderTabContent = useMemo(() => {
  switch (activeTab) {
    case 'activity':  return <SupabaseClientActivity />;
    case 'receiving': return <ClientReceiving />;
    case 'fba':       return <ClientFBAReport />;
    case 'fbm':       return <ClientFBMReport />;
    case 'stock':     return <ClientStock />;
    case 'returns':   return <ClientReturns />;
    case 'exports':   return <ClientExports />;

    case 'profile':   return <SupabasePersonalProfile />;
    case 'billing':   return <SupabaseBillingProfiles />;
    case 'invoices':  return <SupabaseInvoicesList />;
    case 'integrations': return <ClientIntegrations />;
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

  const displayName =
    profile?.first_name || user?.user_metadata?.firstName || 'User';

  const groups = [
    { key: 'Operations', label: t('common.groups.operations') },
    { key: 'Account',    label: t('common.groups.account') },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                {tp('common.greeting', { name: displayName })}
              </h1>
              <p className="text-text-secondary">{t('common.subtitle')}</p>
            </div>
            <button
              onClick={signOut}
              className="flex items-center px-4 py-2 text-text-secondary hover:text-red-600 transition-colors"
            >
              <LogOut className="w-5 h-5 mr-2" />
              {t('common.signOut')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6">
              {groups.map((g) => (
                <div key={g.key} className="mb-6">
                  <div className="px-2 pb-2 text-xs uppercase tracking-wide text-text-light">
                    {g.label}
                  </div>
                  <nav className="space-y-2">
                    {tabs
                      .filter((t) => t.group === g.key)
                      .map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors ${
                            activeTab === tab.id
                              ? 'bg-primary text-white'
                              : 'text-text-secondary hover:bg-gray-50'
                          }`}
                        >
                          <tab.icon className="w-5 h-5 mr-3" />
                          {tab.label}
                        </button>
                      ))}
                  </nav>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl shadow-sm p-6 animate-fade-in">
              {renderTabContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SupabaseDashboard;
