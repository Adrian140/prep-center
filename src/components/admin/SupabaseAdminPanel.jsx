import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import AdminProfiles from './AdminProfiles';
import AdminPrepBusinessIntegrations from './AdminPrepBusinessIntegrations';
import { supabaseHelpers } from '@/config/supabase';
import AdminAnalytics from "./AdminAnalytics";
import AdminCompanyDashboard from "./AdminCompanyDashboard";
import AdminUserDetail from './AdminUserDetail';
import AdminReceiving from './AdminReceiving';
import { PlayCircle /* ...rest */ } from 'lucide-react';
import AdminUserGuide from './AdminUserGuide';
import AdminAffiliates from './AdminAffiliates';
import { supabase } from '@/config/supabase';
import AdminBoxes from './AdminBoxes';
import AdminPricing from './AdminPricing';
import AdminShippingRates from './AdminShippingRates';
import AdminReturns from './AdminReturns';
import AdminChat from './AdminChat';
import AdminUPS from './AdminUPS';
import AdminChatWidget from './AdminChatWidget';
import AdminInvoicesOverview from './AdminInvoicesOverview';
import { getTabId } from '@/utils/tabIdentity';
import { tabSessionStorage } from '@/utils/tabStorage';
import SupabaseSecuritySettings from '@/components/dashboard/SupabaseSecuritySettings';
import { useMarket } from '@/contexts/MarketContext';

const SERVICE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'ro', label: 'Română' }
];

import {
  Settings, DollarSign, Package, FileText, Plus, Edit, Trash2, Save, X,
  Star, Users, BarChart3, PackageCheck, Truck, Boxes, Shield, Link2
} from 'lucide-react';
import AdminPrepRequests from './AdminPrepRequests';
import { useAdminTranslation } from '@/i18n/useAdminTranslation';

function SupabaseAdminPanel() {
  const tabId = getTabId();
  const { user, signOut } = useSupabaseAuth();
  const { currentMarket } = useMarket();
  const { t } = useAdminTranslation();
  const [isAdmin, setIsAdmin] = useState(false);
const [checkingAdmin, setCheckingAdmin] = useState(true);

useEffect(() => {
  const checkAdmin = async () => {
    if (!user) {
      setIsAdmin(false);
      setCheckingAdmin(false);
      return;
    }

    const { data, error } = await supabaseHelpers.getProfile(user.id);
    if (error) {
      console.error("Error checking admin:", error);
      setIsAdmin(false);
    } else {
      setIsAdmin(data?.is_admin === true || data?.account_type === 'admin');
    }
    setCheckingAdmin(false);
  };

  checkAdmin();
}, [user]);

  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProfile, setSelectedProfile] = useState(null);
  const lastUrlTabRef = useRef(null);
  const validTabs = [
    'analytics', 'dashboard', 'profiles', 'receiving', 'prep-requests', 'returns',
    'chat', 'ups', 'pricing', 'boxes', 'prep-business', 'reviews', 'user-guide', 'security', 'invoices', 'settings'
  ];
  // ✅ Save & restore last selected admin tab
  const [activeTab, setActiveTab] = useState(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const initialTab = params.get('tab');
    let saved = null;
    try {
      saved = tabSessionStorage.getItem('adminDashboardTab');
    } catch (err) {
      saved = null;
    }
    if (initialTab && validTabs.includes(initialTab)) return initialTab;
    return validTabs.includes(saved) ? saved : 'profiles';
  });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('tabId') !== tabId) {
      params.set('tabId', tabId);
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate, tabId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlTab = params.get('tab');
    if (!urlTab || !validTabs.includes(urlTab)) return;
    if (lastUrlTabRef.current === urlTab) return;
    lastUrlTabRef.current = urlTab;
    if (urlTab !== activeTab) setActiveTab(urlTab);
  }, [location.search, activeTab, validTabs]);

  useEffect(() => {
    try {
      tabSessionStorage.setItem('adminDashboardTab', activeTab);
    } catch (err) {
      // ignore storage write failures
    }
    const params = new URLSearchParams(location.search);
    const current = params.get('tab');
    if (current !== activeTab) {
      params.set('tab', activeTab);
      if (!params.get('tabId')) params.set('tabId', tabId);
      navigate(`/admin?${params.toString()}`);
    }
    lastUrlTabRef.current = activeTab;
  }, [activeTab, navigate, tabId]);

  const syncProfileParam = (profileId) => {
    const params = new URLSearchParams(location.search);
    if (profileId) params.set('profile', profileId);
    else params.delete('profile');
    if (!params.get('tab')) params.set('tab', activeTab);
    if (!params.get('tabId')) params.set('tabId', tabId);
    navigate(`/admin?${params.toString()}`);
  };

  const handleSelectProfile = (profile) => {
    if (!profile) return;
    setSelectedProfile(profile);
    syncProfileParam(profile.id);
  };

  const handleCloseProfile = () => {
    setSelectedProfile(null);
    syncProfileParam(null);
  };
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const profileId = params.get('profile');
    if (activeTab !== 'profiles' || !profileId) return;
    if (selectedProfile?.id === profileId) return;

    let mounted = true;
    (async () => {
      const { data, error } = await supabaseHelpers.getProfile(profileId);
      if (!mounted) return;
      if (!error && data) {
        setSelectedProfile(data);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [activeTab, location.search, selectedProfile?.id]);

  const [services, setServices] = useState([]);
  const [maintenance, setMaintenance] = useState({
    enabled: false,
    message: 'Site en maintenance. Nous revenons vite.'
    });
  const [notifSettings, setNotifSettings] = useState({
    receptions: {
      FR: { enabled: true, email: '' },
      DE: { enabled: true, email: '' }
    },
    prep_requests: {
      FR: { enabled: true, email: '' },
      DE: { enabled: true, email: '' }
    }
  });
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(''); // Changed to message
  const [pendingPrepCount, setPendingPrepCount] = useState(0);
  const [pendingReturnsCount, setPendingReturnsCount] = useState(0);
  const [pendingAffiliateCount, setPendingAffiliateCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const pendingCountsInFlightRef = useRef(false);
  const pendingCountsLastRunRef = useRef(0);
  const chatUnreadInFlightRef = useRef(false);
  const chatUnreadLastRunRef = useRef(0);
  const [reviews, setReviews] = useState([]); // Added reviews state
  const [contentData, setContentData] = useState({}); // Added contentData state
  const [servicesLanguage, setServicesLanguage] = useState('en');
  const [integrationLang, setIntegrationLang] = useState('ro');
  const [integrationContent, setIntegrationContent] = useState({});
  const tabs = useMemo(() => ([
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'profiles', label: t('sidebar.profiles'), icon: Users },
    { id: 'receiving', label: t('sidebar.receiving'), icon: Truck },
    { id: 'prep-requests', label: t('sidebar.prepRequests'), icon: PackageCheck },
    { id: 'returns', label: 'Returns', icon: Package },
    { id: 'chat', label: 'Chat', icon: Users },
    { id: 'ups', label: 'UPS', icon: Truck },
    { id: 'pricing', label: t('sidebar.pricing'), icon: DollarSign },
    { id: 'boxes', label: 'Boxes', icon: Boxes },
    { id: 'prep-business', label: 'Integrations', icon: Link2 },
    { id: 'reviews', label: t('sidebar.reviews'), icon: Star },
    { id: 'user-guide', label: t('sidebar.userGuide'), icon: PlayCircle },
    { id: 'affiliates', label: t('sidebar.affiliates'), icon: Users },
    { id: 'security', label: t('sidebar.security'), icon: Shield },
    { id: 'analytics', label: t('sidebar.analytics'), icon: BarChart3 },
    { id: 'invoices', label: t('sidebar.invoices'), icon: FileText },
    { id: 'settings', label: t('sidebar.settings'), icon: Settings }
  ]), [t]);

  useEffect(() => {
     if (user) { // Changed to user
     fetchServices();
     fetchContentData(); // Fetch content data
     fetchReviews(); // Fetch reviews
     fetchIntegrationContent(integrationLang);
     fetchMaintenance();
     fetchNotifSettings();
    }
   }, [user, integrationLang]); // Changed to user

  useEffect(() => {
    let mounted = true;
    const loadPendingCounts = async () => {
      if (pendingCountsInFlightRef.current) return;
      const now = Date.now();
      if (now - pendingCountsLastRunRef.current < 2000) return;
      pendingCountsInFlightRef.current = true;
      try {
        let prepQuery = supabase
          .from('prep_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        let returnsQuery = supabase
          .from('returns')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (currentMarket) {
          prepQuery = prepQuery.eq('warehouse_country', currentMarket);
          returnsQuery = returnsQuery.eq('warehouse_country', currentMarket);
        }
        const affiliateQuery = supabase
          .from('affiliate_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        let [prepRes, returnsRes, affiliateRes] = await Promise.all([
          prepQuery,
          returnsQuery,
          affiliateQuery
        ]);
        const missingWarehouse = (err) =>
          String(err?.message || '').toLowerCase().includes('warehouse_country');
        if (currentMarket && (missingWarehouse(prepRes?.error) || missingWarehouse(returnsRes?.error))) {
          [prepRes, returnsRes, affiliateRes] = await Promise.all([
            supabase
              .from('prep_requests')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending'),
            supabase
              .from('returns')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending'),
            affiliateQuery
          ]);
        }
        if (!mounted) return;
        setPendingPrepCount(prepRes?.count || 0);
        setPendingReturnsCount(returnsRes?.count || 0);
        setPendingAffiliateCount(affiliateRes?.count || 0);
        pendingCountsLastRunRef.current = Date.now();
      } finally {
        pendingCountsInFlightRef.current = false;
      }
    };
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadPendingCounts();
    };
    tick();
    const intervalId = setInterval(tick, 60 * 1000);
    const handleVisibility = () => tick();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    return () => {
      mounted = false;
      clearInterval(intervalId);
      pendingCountsInFlightRef.current = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [currentMarket]);

  useEffect(() => {
    let mounted = true;
    const loadChatUnread = async () => {
      if (!user?.id) return;
      if (chatUnreadInFlightRef.current) return;
      const now = Date.now();
      if (now - chatUnreadLastRunRef.current < 3000) return;
      chatUnreadInFlightRef.current = true;
      try {
        const convRes = await supabaseHelpers.listChatConversations({
          country: currentMarket || null
        });
        const rows = convRes?.data || [];
        const unreadEntries = await Promise.all(
          rows.map(async (conv) => {
            const res = await supabaseHelpers.getChatUnreadCount({ conversationId: conv.id });
            return Number(res?.data || 0);
          })
        );
        if (!mounted) return;
        setChatUnreadCount(unreadEntries.reduce((sum, n) => sum + n, 0));
        chatUnreadLastRunRef.current = Date.now();
      } finally {
        chatUnreadInFlightRef.current = false;
      }
    };
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadChatUnread();
    };
    tick();
    const intervalId = setInterval(tick, 5000);
    const onVisibility = () => tick();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      mounted = false;
      clearInterval(intervalId);
      chatUnreadInFlightRef.current = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [user?.id, currentMarket]);

  const fetchServices = async () => {
    try {
      const { data, error } = await supabaseHelpers.getServices();
      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  // Fetch content data
  const fetchContentData = async () => {
    try {
      const { data, error } = await supabaseHelpers.getContent();
      if (error) throw error;
      setContentData(data || {});
    } catch (error) {
      console.error('Error fetching content data:', error);
    }
  };

  const handleLocalizedContentChange = (field, lang, value) => {
    const key = `${field}_${lang}`;
    setContentData((prev) => ({ ...prev, [key]: value }));
  };

  // Fetch reviews
  const fetchReviews = async () => {
    try {
      const { data, error } = await supabaseHelpers.getReviews();
      if (error) throw error;
      setReviews(data || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  };
  const fetchIntegrationContent = async (lang = 'ro') => {
    try {
      const { data, error } = await supabaseHelpers.getIntegrationPageContent(lang);
      if (error) throw error;
      setIntegrationContent(data || {});
    } catch (error) {
      console.error('Error fetching integration content:', error);
    }
  };
const fetchMaintenance = async () => {
const { data, error } = await supabase
.from('app_settings')
.select('value')
.eq('key', 'maintenance_mode')
.maybeSingle();

if (!error && data?.value) {
setMaintenance({
enabled: !!data.value.enabled,
message: data.value.message || 'Site en maintenance. Nous revenons vite.'
});
}
};

const fetchNotifSettings = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'notifications_admin')
    .maybeSingle();

  if (!error && data?.value) {
    setNotifSettings((prev) => ({
      ...prev,
      ...data.value
    }));
  }
};

const saveMaintenance = async (customState) => {
  const newValue = customState || maintenance;
  const { error } = await supabase
    .from('app_settings')
    .upsert({
      key: 'maintenance_mode',
      value: newValue,
      updated_at: new Date().toISOString()
    });

  if (!error) {
    setMessage(
      newValue.enabled
        ? 'Modul de mentenanță a fost activat.'
        : 'Modul de mentenanță a fost dezactivat.'
    );
  } else {
    setMessage('Eroare la salvarea mentenanței.');
  }
};

const saveNotifSettings = async () => {
  const { error } = await supabase
    .from('app_settings')
    .upsert({
      key: 'notifications_admin',
      value: notifSettings,
      updated_at: new Date().toISOString()
    });
  if (error) {
    setMessage('Eroare la salvarea notificărilor.');
  } else {
    setMessage('Notificările au fost salvate.');
  }
};


  const handleSaveService = async (serviceData) => {
    setLoading(true);
    setMessage('');

    try {
      if (serviceData.id) {
        const { error } = await supabaseHelpers.updateService(serviceData.id, serviceData);
        if (error) throw error;
        setMessage('Serviciul a fost actualizat cu succes');
      } else {
        const { error } = await supabaseHelpers.createService(serviceData);
        if (error) throw error;
        setMessage('Serviciul a fost creat cu succes');
      }
      setIsEditing(null);
      setEditForm({});
      fetchServices();
    } catch (error) {
      setMessage(error.message || 'Eroare la salvarea serviciului');
    }

    setLoading(false);
  };

  const handleIntegrationSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabaseHelpers.upsertIntegrationPageContent(integrationLang, integrationContent);
      if (error) throw error;
      setMessage('Conținutul paginii Integrations a fost salvat.');
    } catch (error) {
      console.error('Error saving integration content:', error);
      setMessage('Eroare la salvarea conținutului Integrations.');
    } finally {
      setLoading(false);
    }
  };

  // Handle saving review
  const handleSaveReview = async (reviewData) => {
    setLoading(true);
    setMessage('');

    try {
      if (reviewData.id) {
        // No update function for reviews yet, only create/delete
        setMessage('Actualizarea recenziilor nu este încă implementată.');
      } else {
        const { error } = await supabaseHelpers.createReview(reviewData);
        if (error) throw error;
        setMessage('Recenzia a fost adăugată cu succes');
      }
      fetchReviews();
    } catch (error) {
      setMessage(error.message || 'Eroare la salvarea recenziei');
    }
    setLoading(false);
  };

  // Handle deleting review
  const handleDeleteReview = async (reviewId) => {
    if (!confirm('Ești sigur că vrei să ștergi această recenzie?')) return;
    try {
      const { error } = await supabaseHelpers.deleteReview(reviewId);
      if (error) throw error;
      setMessage('Recenzia a fost ștearsă cu succes');
      fetchReviews();
    } catch (error) {
      setMessage(error.message || 'Eroare la ștergerea recenziei');
    }
  };

  const handleDeleteService = async (serviceId) => {
    if (!confirm('Ești sigur că vrei să ștergi acest serviciu?')) return;

    try {
      const { error } = await supabaseHelpers.deleteService(serviceId);
      if (error) throw error;
      setMessage('Serviciul a fost șters cu succes');
      fetchServices();
    } catch (error) {
      setMessage(error.message || 'Eroare la ștergerea serviciului');
    }
  };

  const startEdit = (service) => {
    setIsEditing(service.id || 'new');
    setEditForm(service);
  };

  const cancelEdit = () => {
    setIsEditing(null);
    setEditForm({});
  };

  // Handler for saving content data
  const handleContentSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabaseHelpers.updateContent(contentData);
      if (error) throw error;
      setMessage('Conținutul a fost salvat cu succes');
    } catch (error) {
      setMessage(error.message || 'Eroare la salvarea conținutului');
    }
    setLoading(false);
  };

  const renderServicesTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text-primary">Gestionare Servicii</h2>
        <button
          onClick={() => startEdit({ title: '', description: '', features: [''], price: '', unit: '', category: '', active: true })}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Adaugă Serviciu
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <div key={service.id} className="bg-white border border-gray-200 rounded-xl p-6">
            {isEditing === service.id ? (
              <div className="space-y-4">
                <input
                  type="text"
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Titlu serviciu"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Descriere"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={editForm.price || ''}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    placeholder="Preț"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={editForm.unit || ''}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    placeholder="Unitate"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <select
                  value={editForm.category || ''}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Selectează categoria</option>
                  <option value="fba">FBA Prep</option>
                  <option value="fbm">FBM Shipping</option>
                  <option value="storage">Storage</option>
                  <option value="additional">Additional Services</option>
                </select>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleSaveService(editForm)}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Salvează
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Anulează
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{service.title}</h3>
                <p className="text-text-secondary mb-4">{service.description}</p>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-bold text-primary">{service.price}</span>
                  <span className="text-sm text-text-secondary">{service.unit}</span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => startEdit(service)}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Editează
                  </button>
                  <button
                    onClick={() => handleDeleteService(service.id)}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Șterge
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add New Service Form */}
        {isEditing === 'new' && (
          <div className="bg-white border-2 border-primary rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Serviciu Nou</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={editForm.title || ''}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Titlu serviciu"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Descriere"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={editForm.price || ''}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  placeholder="Preț (ex: €0.50)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  type="text"
                  value={editForm.unit || ''}
                  onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                  placeholder="Unitate (ex: per product)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <select
                value={editForm.category || ''}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Selectează categoria</option>
                <option value="fba">FBA Prep</option>
                <option value="fbm">FBM Shipping</option>
                <option value="storage">Storage</option>
                <option value="additional">Additional Services</option>
              </select>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSaveService(editForm)}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvează
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Anulează
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderReviewsTab = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">Gestionare Recenzii</h2>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Adaugă Recenzie Nouă</h3>
        <form onSubmit={(e) => {
          e.preventDefault();
          handleSaveReview({
            reviewer_name: e.target.reviewer_name.value,
            rating: parseInt(e.target.rating.value, 10),
            review_text: e.target.review_text.value,
            review_link: e.target.review_link.value
          });
          e.target.reset(); // Clear form after submission
        }} className="space-y-4">
          <div>
            <label htmlFor="reviewer_name" className="block text-sm font-medium text-text-primary mb-2">Nume persoană *</label>
            <input type="text" id="reviewer_name" name="reviewer_name" required className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label htmlFor="rating" className="block text-sm font-medium text-text-primary mb-2">Rating (1-5 Stele) *</label>
            <input type="number" id="rating" name="rating" required min="1" max="5" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label htmlFor="review_text" className="block text-sm font-medium text-text-primary mb-2">Text Recenzie *</label>
            <textarea id="review_text" name="review_text" required rows="4" className="w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea>
          </div>
          <div>
            <label htmlFor="review_link" className="block text-sm font-medium text-text-primary mb-2">Link Recenzie (opțional)</label>
            <input type="url" id="review_link" name="review_link" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors">
            Adaugă Recenzie
          </button>
        </form>
      </div>

      <h3 className="text-xl font-bold text-text-primary mb-4">Recenzii Existente</h3>
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <p className="text-text-secondary">Nu există recenzii adăugate.</p>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="bg-white border border-gray-200 rounded-xl p-6 flex justify-between items-start">
              <div>
                <div className="flex items-center mb-2">
                  {[...Array(review.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-lg font-semibold text-text-primary">{review.reviewer_name}</p>
                <p className="text-text-secondary mb-2">{review.review_text}</p>
                {review.review_link && (
                  <a href={review.review_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">Vezi recenzia originală</a>
                )}
              </div>
              <button
                onClick={() => handleDeleteReview(review.id)}
                className="text-red-600 hover:text-red-800 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

const renderPricingTab = () => (
  <div className="space-y-10">
    <AdminPricing />
    <AdminShippingRates />
  </div>
);


  const renderContentTab = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">Editare Conținut</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hero Section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Secțiunea Hero</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Titlu Principal</label>
              <input
                 type="text"
                value={contentData.hero_title || ''}
                onChange={(e) => setContentData({ ...contentData, hero_title: e.target.value })}
               className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Subtitlu</label>
              <textarea
                 value={contentData.hero_subtitle || ''}
                onChange={(e) => setContentData({ ...contentData, hero_subtitle: e.target.value })}
               rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Services Section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Secțiunea Servicii</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Titlu Standard FBA</label>
              <input
                 type="text"
                value={contentData.standard_fba_title || ''}
                onChange={(e) => setContentData({ ...contentData, standard_fba_title: e.target.value })}
               className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Subtitlu Standard FBA</label>
              <input
                type="text"
                 value={contentData.standard_fba_subtitle || ''}
                onChange={(e) => setContentData({ ...contentData, standard_fba_subtitle: e.target.value })}
               className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Titlu FNSKU Labeling</label>
              <input
                type="text"
                 value={contentData.fnsku_labeling_title || ''}
                onChange={(e) => setContentData({ ...contentData, fnsku_labeling_title: e.target.value })}
               className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Private Label Section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Secțiunea Private Label</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Titlu Private Label</label>
              <input
                 type="text"
                value={contentData.private_label_title || ''}
                onChange={(e) => setContentData({ ...contentData, private_label_title: e.target.value })}
               className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Subtitlu Private Label</label>
              <textarea
                 value={contentData.private_label_subtitle || ''}
                onChange={(e) => setContentData({ ...contentData, private_label_subtitle: e.target.value })}
               rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Storage Section */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Secțiunea Storage</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Titlu Storage</label>
              <input
                 type="text"
                value={contentData.storage_title || ''}
                onChange={(e) => setContentData({ ...contentData, storage_title: e.target.value })}
               className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Subtitlu Storage</label>
              <input
                type="text"
                 value={contentData.storage_subtitle || ''}
                onChange={(e) => setContentData({ ...contentData, storage_subtitle: e.target.value })}
               className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleContentSave}
         className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-dark transition-colors"
     >
        Salvează Tot Conținutul
      </button>
    </div>
  );

  const renderServicesPageContentTab = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">Conținut Pagină Servicii & Prețuri</h2>

      {/* Page Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Antet Pagină</h3>
        <p className="text-sm text-text-secondary mb-4">
          Configurează titlul și subtitlul în fiecare limbă. Dacă nu completezi o limbă, se folosește
          textul fallback sau traducerea automată.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {SERVICE_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setServicesLanguage(lang.code)}
              className={`px-3 py-1.5 rounded-full border text-sm ${
                servicesLanguage === lang.code
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text-primary border-gray-200 hover:bg-gray-50'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Titlu ({SERVICE_LANGUAGES.find((lang) => lang.code === servicesLanguage)?.label})
            </label>
            <input
              type="text"
              value={contentData[`services_title_${servicesLanguage}`] || ''}
              onChange={(e) =>
                handleLocalizedContentChange('services_title', servicesLanguage, e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Subtitlu ({SERVICE_LANGUAGES.find((lang) => lang.code === servicesLanguage)?.label})
            </label>
            <textarea
              rows={3}
              value={contentData[`services_subtitle_${servicesLanguage}`] || ''}
              onChange={(e) =>
                handleLocalizedContentChange('services_subtitle', servicesLanguage, e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="mt-6 pt-4 border-t space-y-4">
          <p className="text-sm font-semibold text-text-primary">Fallback (folosit dacă nu există traducere)</p>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Titlu fallback</label>
            <input
              type="text"
              value={contentData.services_title || ''}
              onChange={(e) => setContentData({ ...contentData, services_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Subtitlu fallback</label>
            <textarea
              rows={3}
              value={contentData.services_subtitle || ''}
              onChange={(e) => setContentData({ ...contentData, services_subtitle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Bonus Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Banner Bonus Client Nou</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Titlu Bonus</label>
            <input type="text" value={contentData.bonus_title || ''} onChange={(e) => setContentData({ ...contentData, bonus_title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Subtitlu Bonus 1</label>
            <input type="text" value={contentData.bonus_subtitle1 || ''} onChange={(e) => setContentData({ ...contentData, bonus_subtitle1: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            <p className="text-xs text-gray-500 mt-1">Folosește {'{new_customer_rate}'} și {'{standard_rate}'} pentru a insera prețurile dinamice.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Subtitlu Bonus 2</label>
            <input type="text" value={contentData.bonus_subtitle2 || ''} onChange={(e) => setContentData({ ...contentData, bonus_subtitle2: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
        </div>
      </div>

      {/* FBA Services */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Secțiune Servicii FBA</h3>
        <div className="grid grid-cols-2 gap-4">
          <input type="text" placeholder="Recepție & inspecție" value={contentData.fba_reception || ''} onChange={(e) => setContentData({ ...contentData, fba_reception: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Polybagging" value={contentData.fba_polybagging || ''} onChange={(e) => setContentData({ ...contentData, fba_polybagging: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetare FNSKU" value={contentData.fba_labeling || ''} onChange={(e) => setContentData({ ...contentData, fba_labeling: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Protecție" value={contentData.fba_dunnage || ''} onChange={(e) => setContentData({ ...contentData, fba_dunnage: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Tarif Standard" value={contentData.fba_rate_label || ''} onChange={(e) => setContentData({ ...contentData, fba_rate_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Unitate" value={contentData.fba_unit_label || ''} onChange={(e) => setContentData({ ...contentData, fba_unit_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Client Nou" value={contentData.fba_new_customer_label || ''} onChange={(e) => setContentData({ ...contentData, fba_new_customer_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
      </div>

      {/* FBM & Private Label */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Secțiune FBM & Private Label</h3>
        <div className="grid grid-cols-2 gap-4">
          <input type="text" placeholder="Titlu Private Label" value={contentData.pl_partnership_title || ''} onChange={(e) => setContentData({ ...contentData, pl_partnership_title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Titlu FBM" value={contentData.fbm_title || ''} onChange={(e) => setContentData({ ...contentData, fbm_title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Packaging" value={contentData.pl_packaging_label || ''} onChange={(e) => setContentData({ ...contentData, pl_packaging_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Valoare Packaging" value={contentData.pl_packaging_value || ''} onChange={(e) => setContentData({ ...contentData, pl_packaging_value: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Sourcing" value={contentData.pl_sourcing_label || ''} onChange={(e) => setContentData({ ...contentData, pl_sourcing_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Valoare Sourcing" value={contentData.pl_sourcing_value || ''} onChange={(e) => setContentData({ ...contentData, pl_sourcing_value: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Compliance" value={contentData.pl_compliance_label || ''} onChange={(e) => setContentData({ ...contentData, pl_compliance_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Valoare Compliance" value={contentData.pl_compliance_value || ''} onChange={(e) => setContentData({ ...contentData, pl_compliance_value: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Amazon FBM" value={contentData.fbm_amazon_label || ''} onChange={(e) => setContentData({ ...contentData, fbm_amazon_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Valoare Amazon FBM" value={contentData.fbm_amazon_value || ''} onChange={(e) => setContentData({ ...contentData, fbm_amazon_value: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă eBay" value={contentData.fbm_ebay_label || ''} onChange={(e) => setContentData({ ...contentData, fbm_ebay_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Valoare eBay" value={contentData.fbm_ebay_value || ''} onChange={(e) => setContentData({ ...contentData, fbm_ebay_value: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Shopify" value={contentData.fbm_shopify_label || ''} onChange={(e) => setContentData({ ...contentData, fbm_shopify_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Valoare Shopify" value={contentData.fbm_shopify_value || ''} onChange={(e) => setContentData({ ...contentData, fbm_shopify_value: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </div>
      </div>
      {/* Calculator */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Calculator Preț</h3>
        <div className="grid grid-cols-2 gap-4">
          <input type="text" placeholder="Titlu Calculator" value={contentData.calculator_title || ''} onChange={(e) => setContentData({ ...contentData, calculator_title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Subtitlu Calculator" value={contentData.calculator_subtitle || ''} onChange={(e) => setContentData({ ...contentData, calculator_subtitle: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Unități" value={contentData.calculator_units_label || ''} onChange={(e) => setContentData({ ...contentData, calculator_units_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Comenzi FBM" value={contentData.calculator_fbm_label || ''} onChange={(e) => setContentData({ ...contentData, calculator_fbm_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Paleți" value={contentData.calculator_pallets_label || ''} onChange={(e) => setContentData({ ...contentData, calculator_pallets_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Selectare Servicii" value={contentData.calculator_select_label || ''} onChange={(e) => setContentData({ ...contentData, calculator_select_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Nume Serviciu 1" value={contentData.calculator_service1 || ''} onChange={(e) => setContentData({ ...contentData, calculator_service1: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Nume Serviciu 2" value={contentData.calculator_service2 || ''} onChange={(e) => setContentData({ ...contentData, calculator_service2: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Nume Serviciu 3" value={contentData.calculator_service3 || ''} onChange={(e) => setContentData({ ...contentData, calculator_service3: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Etichetă Total" value={contentData.calculator_total_label || ''} onChange={(e) => setContentData({ ...contentData, calculator_total_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <input type="text" placeholder="Text Buton" value={contentData.calculator_button_text || ''} onChange={(e) => setContentData({ ...contentData, calculator_button_text: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Etichetă Cartoane Expediere</label>
            <input type="text" placeholder="Cartoane Expediere" value={contentData.shipping_cartons_label || ''} onChange={(e) => setContentData({ ...contentData, shipping_cartons_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>

        </div>
      </div>

      {/* Pagina Integrations */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h3 className="text-lg font-semibold text-text-primary">Pagina “Integrations”</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary">Limba</label>
            <select
              value={integrationLang}
              onChange={(e) => setIntegrationLang(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="ro">Română</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
            </select>
            <button
              type="button"
              onClick={() => fetchIntegrationContent(integrationLang)}
              className="px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200"
            >
              Reîncarcă
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Hero title</label>
            <input
              type="text"
              value={integrationContent.hero_title || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, hero_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Hero subtitle</label>
            <textarea
              rows={2}
              value={integrationContent.hero_subtitle || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, hero_subtitle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {[1, 2, 3].map((n) => (
          <div key={n} className="grid md:grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Feature {n} titlu</label>
              <input
                type="text"
                value={integrationContent[`feature${n}_title`] || ''}
                onChange={(e) => setIntegrationContent({ ...integrationContent, [`feature${n}_title`]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Feature {n} descriere</label>
              <textarea
                rows={2}
                value={integrationContent[`feature${n}_body`] || ''}
                onChange={(e) => setIntegrationContent({ ...integrationContent, [`feature${n}_body`]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        ))}

        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Flow titlu</label>
            <input
              type="text"
              value={integrationContent.flow_title || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, flow_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Flow Pas 1</label>
            <input
              type="text"
              value={integrationContent.flow_step1 || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, flow_step1: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Flow Pas 2</label>
            <input
              type="text"
              value={integrationContent.flow_step2 || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, flow_step2: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Flow Pas 3</label>
            <input
              type="text"
              value={integrationContent.flow_step3 || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, flow_step3: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Screenshot 1 URL</label>
            <input
              type="url"
              value={integrationContent.screenshot1_url || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, screenshot1_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Screenshot 2 URL</label>
            <input
              type="url"
              value={integrationContent.screenshot2_url || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, screenshot2_url: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">FAQ Titlu</label>
            <input
              type="text"
              value={integrationContent.faq_title || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, faq_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">FAQ Întrebare</label>
            <input
              type="text"
              value={integrationContent.faq_q1 || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, faq_q1: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text-primary mb-1">FAQ Răspuns</label>
            <textarea
              rows={2}
              value={integrationContent.faq_a1 || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, faq_a1: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">CTA Titlu</label>
            <input
              type="text"
              value={integrationContent.cta_title || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, cta_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">CTA Subtitlu</label>
            <textarea
              rows={2}
              value={integrationContent.cta_subtitle || ''}
              onChange={(e) => setIntegrationContent({ ...integrationContent, cta_subtitle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleIntegrationSave}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark"
            disabled={loading}
          >
            {loading ? 'Se salvează...' : 'Salvează conținut Integrations'}
          </button>
        </div>
      </div>

      <button
        onClick={handleContentSave}
        className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-dark transition-colors"
      >
        Salvează Conținutul Paginii de Servicii
      </button>
    </div>
  );

const renderSettingsTab = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">Setări Generale</h2>

      {/* Company / Warehouse / Contact cards */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Company / Warehouse / Contact</h3>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Company information</p>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Company name</label>
              <input
                type="text"
                value={contentData.company_info_name || ''}
                onChange={(e) => setContentData({ ...contentData, company_info_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">SIRET</label>
              <input
                type="text"
                value={contentData.company_info_siret || ''}
                onChange={(e) => setContentData({ ...contentData, company_info_siret: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">VAT</label>
              <input
                type="text"
                value={contentData.company_info_vat || ''}
                onChange={(e) => setContentData({ ...contentData, company_info_vat: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Warehouse & operations</p>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Hub name</label>
              <input
                type="text"
                value={contentData.warehouse_name || ''}
                onChange={(e) => setContentData({ ...contentData, warehouse_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Address</label>
              <textarea
                rows={3}
                value={contentData.warehouse_address || ''}
                onChange={(e) => setContentData({ ...contentData, warehouse_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Phone</label>
                <input
                  type="text"
                  value={contentData.warehouse_phone || ''}
                  onChange={(e) => setContentData({ ...contentData, warehouse_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
                <input
                  type="email"
                  value={contentData.warehouse_email || ''}
                  onChange={(e) => setContentData({ ...contentData, warehouse_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Contact</p>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Primary email</label>
              <input
                type="email"
                value={contentData.contact_email || ''}
                onChange={(e) => setContentData({ ...contentData, contact_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Primary phone</label>
              <input
                type="text"
                value={contentData.contact_phone || ''}
                onChange={(e) => setContentData({ ...contentData, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Address</label>
              <textarea
                rows={3}
                value={contentData.contact_address || ''}
                onChange={(e) => setContentData({ ...contentData, contact_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Mentenanță Site</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              Stare mentenanță:
            </span>
            <button
              onClick={() => {
                const newState = !maintenance.enabled;
                const updated = { ...maintenance, enabled: newState };
                setMaintenance(updated);
                saveMaintenance(updated);
              }}
              className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                maintenance.enabled
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {maintenance.enabled ? 'Mentenanță activă' : 'Mentenanță dezactivată'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Mesaj afișat către clienți
            </label>
            <textarea
              rows={3}
              value={maintenance.message}
              onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <button
            onClick={() => saveMaintenance(maintenance)}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors"
          >
            Salvează Mentenanța
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Notificări admin (per țară)</h3>
        <p className="text-sm text-text-secondary mb-3">
          Setează emailul de notificare pentru recepții și confirmări de prep, separat pentru FR și DE. Poți dezactiva notificările pe fiecare țară.
        </p>
        {['FR', 'DE'].map((code) => (
          <div key={code} className="border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-text-primary">Țara: {code}</div>
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notifSettings.receptions?.[code]?.enabled !== false}
                    onChange={(e) =>
                      setNotifSettings((prev) => ({
                        ...prev,
                        receptions: {
                          ...prev.receptions,
                          [code]: {
                            ...(prev.receptions?.[code] || {}),
                            enabled: e.target.checked
                          }
                        }
                      }))
                    }
                  />
                  Recepții active
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={notifSettings.prep_requests?.[code]?.enabled !== false}
                    onChange={(e) =>
                      setNotifSettings((prev) => ({
                        ...prev,
                        prep_requests: {
                          ...prev.prep_requests,
                          [code]: {
                            ...(prev.prep_requests?.[code] || {}),
                            enabled: e.target.checked
                          }
                        }
                      }))
                    }
                  />
                  Prep active
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Email notificări recepții ({code})
                </label>
                <input
                  type="email"
                  value={notifSettings.receptions?.[code]?.email || ''}
                  onChange={(e) =>
                    setNotifSettings((prev) => ({
                      ...prev,
                      receptions: {
                        ...prev.receptions,
                        [code]: {
                          ...(prev.receptions?.[code] || {}),
                          email: e.target.value
                        }
                      }
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="ex: fr-ops@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Email notificări prep ({code})
                </label>
                <input
                  type="email"
                  value={notifSettings.prep_requests?.[code]?.email || ''}
                  onChange={(e) =>
                    setNotifSettings((prev) => ({
                      ...prev,
                      prep_requests: {
                        ...prev.prep_requests,
                        [code]: {
                          ...(prev.prep_requests?.[code] || {}),
                          email: e.target.value
                        }
                      }
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="ex: de-ops@example.com"
                />
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={saveNotifSettings}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark transition-colors"
        >
          Salvează notificările
        </button>
      </div>

      <button
        onClick={handleContentSave}
        className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary-dark transition-colors"
      >
        Salvează Setările
      </button>
    </div>
  );
};

const renderTabContent = () => {
  switch (activeTab) {
    case 'analytics': return <AdminAnalytics />;
    case 'dashboard': return <AdminCompanyDashboard />;
    case 'profiles': return selectedProfile
      ? <AdminUserDetail profile={selectedProfile} onBack={handleCloseProfile} />
      : <AdminProfiles onSelect={handleSelectProfile} />;
    case 'receiving': return <AdminReceiving />;
    case 'prep-requests': return <AdminPrepRequests />;
    case 'returns': return <AdminReturns />;
    case 'services': return renderServicesTab();
    case 'pricing': return renderPricingTab();
    case 'boxes': return <AdminBoxes />;
    case 'reviews': return renderReviewsTab();
    case 'user-guide': return <AdminUserGuide />;
    case 'affiliates': return <AdminAffiliates />;
    case 'chat': return <AdminChat />;
    case 'ups': return <AdminUPS />;
    case 'prep-business': return <AdminPrepBusinessIntegrations />;
    case 'security': return <SupabaseSecuritySettings />;
    case 'invoices': return <AdminInvoicesOverview />;
    case 'settings': return renderSettingsTab();
    default:
      return (
        <div className="text-center text-gray-500 py-10">
          <p>Unknown tab: <strong>{activeTab}</strong></p>
          <p className="text-sm mt-2">Please reload the page or contact support.</p>
        </div>
      );
  }
};
if (checkingAdmin) {
  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

if (!isAdmin) {
  return (
    <div className="flex flex-col justify-center items-center min-h-screen text-center text-gray-600">
      <p className="text-xl mb-2">{t('common.accessDeniedTitle')}</p>
      <p className="text-sm">{t('common.accessDeniedDesc')}</p>
      <button
        onClick={signOut}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark"
      >
        {t('common.signOut')}
      </button>
    </div>
  );
}

 return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg ${
            message.includes('succes') 
              ? 'bg-green-50 border border-green-200 text-green-600'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6 lg:gap-8">
          {/* Sidebar */}
          <div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <nav className="space-y-1.5">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-left rounded-lg text-sm transition-colors ${
                      tab.id === 'prep-requests' && pendingPrepCount > 0
                        ? activeTab === tab.id
                          ? 'bg-green-600 text-white'
                          : 'bg-green-50 text-green-700 hover:bg-green-100'
                        : tab.id === 'returns' && pendingReturnsCount > 0
                          ? activeTab === tab.id
                            ? 'bg-green-600 text-white'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                          : tab.id === 'affiliates' && pendingAffiliateCount > 0
                            ? activeTab === tab.id
                              ? 'bg-green-600 text-white'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          : tab.id === 'chat' && chatUnreadCount > 0
                            ? activeTab === tab.id
                              ? 'bg-red-600 text-white'
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          : activeTab === tab.id
                            ? 'bg-primary text-white'
                            : 'text-text-secondary hover:bg-gray-50'
                    }`}
                  >
                    <tab.icon className="w-4 h-4 mr-2" />
                    {tab.label}
                    {tab.id === 'chat' && chatUnreadCount > 0 && (
                      <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                        activeTab === tab.id ? 'bg-white text-red-600' : 'bg-red-600 text-white'
                      }`}>
                        {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div>
           <div className="bg-white rounded-xl shadow-sm p-6 animate-fade-in">
             {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                renderTabContent() // ✅ apelează funcția și returnează elementul React
              )}
            </div>
          </div>
        </div>
      </div>
      <AdminChatWidget />
    </div>
  );
}

export default SupabaseAdminPanel;
