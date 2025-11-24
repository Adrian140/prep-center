// FILE: src/App.jsx
import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import TermsOfService from './components/TermsOfService';
import Header from './components/Header';
import Footer from './components/Footer';
import CookieBanner from './components/CookieBanner';

import Home from './pages/Home';
import ServicesPricing from './pages/ServicesPricing';
import About from './pages/About';
import Contact from './pages/Contact';
import PrivacyPolicy from './components/PrivacyPolicy';
import AuthCallback from './pages/AuthCallback';
import AmazonIntegrationCallback from './pages/AmazonIntegrationCallback';

import AdminLoginInfo from './components/AdminLoginInfo';
import SupabaseAdminPanel from './components/admin/SupabaseAdminPanel';
import AdminRoute from './components/AdminRoute';
import ClientRoute from './components/routes/ClientRoute';

import SupabaseLoginForm from './components/auth/SupabaseLoginForm';
import SupabaseRegisterForm from './components/auth/SupabaseRegisterForm';
import ForgotPasswordForm from './components/auth/ForgotPasswordForm';
import UpdatePasswordForm from './components/auth/UpdatePasswordForm';

import SupabaseDashboard from './components/dashboard/SupabaseDashboard';
import AdminAnalytics from './components/admin/AdminAnalytics';

import { supabase } from './config/supabase';
import { tabSessionStorage, tabLocalStorage } from './utils/tabStorage';

const LAST_PATH_KEY = 'lastPath';

const setTabLastPath = (value) => {
  try {
    tabSessionStorage.setItem(LAST_PATH_KEY, value);
  } catch (err) {
    // sessionStorage might be unavailable (older safari/private). Ignore.
  }
};

const getTabLastPath = () => {
  try {
    const value = tabSessionStorage.getItem(LAST_PATH_KEY);
    if (value) return value;
  } catch (err) {
    // ignore
  }
  // migrate legacy localStorage entry if still around
  try {
    const legacy = tabLocalStorage.getItem(LAST_PATH_KEY) || (typeof window !== 'undefined' ? window.localStorage?.getItem(LAST_PATH_KEY) : null);
    if (legacy) {
      window?.localStorage?.removeItem?.(LAST_PATH_KEY);
      return legacy;
    }
  } catch (err) {
    // ignore
  }
  return null;
};

function RoutePersistence() {
  const location = useLocation();
  React.useEffect(() => {
    const p = location.pathname;
    const skip = ['/login', '/register', '/forgot-password', '/reset-password', '/auth/callback', '/auth/amazon/callback'];
    if (!skip.includes(p)) {
      setTabLastPath(p + location.search + location.hash);
    }
  }, [location]);
  return null;
}

function StartupRedirect() {
  const navigate = useNavigate();
  React.useEffect(() => {
    const last = getTabLastPath();
    if (window.location.pathname === '/' && last && last !== '/') {
      navigate(last, { replace: true });
    }
  }, [navigate]);
  return null;
}

function MaintenanceGate({ children }) {
  const [state, setState] = React.useState({ loading: true, enabled: false, message: '' });

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.value) {
        setState({
          loading: false,
          enabled: !!data.value.enabled,
          message: data.value.message || "Nous effectuons une courte maintenance. Merci de réessayer dans quelques minutes."
        });
      } else {
        setState({ loading: false, enabled: false, message: '' });
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-500 text-sm">Chargement…</div>
      </div>
    );
  }

  if (state.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-600 mx-auto text-xl font-bold">
            !
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Maintenance en cours</h1>
          <p className="text-gray-700">
            {state.message}
          </p>
          <p className="text-gray-400 text-xs">
            Merci pour ta compréhension.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

export default function App() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        <RoutePersistence />
        <StartupRedirect />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services-pricing" element={<ServicesPricing />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />

          {/* ✅ Portal Client - protejat de mentenanță */}
          <Route
            path="/register"
            element={
              <MaintenanceGate>
                <SupabaseRegisterForm />
              </MaintenanceGate>
            }
          />
          <Route
            path="/login"
            element={
              <MaintenanceGate>
                <SupabaseLoginForm />
              </MaintenanceGate>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <MaintenanceGate>
                <ForgotPasswordForm />
              </MaintenanceGate>
            }
          />
          <Route
            path="/reset-password"
            element={
              <MaintenanceGate>
                <UpdatePasswordForm />
              </MaintenanceGate>
            }
          />
          <Route
            path="/auth/callback"
            element={
              <MaintenanceGate>
                <AuthCallback />
              </MaintenanceGate>
            }
          />
          <Route
            path="/auth/amazon/callback"
            element={
              <MaintenanceGate>
                <ClientRoute>
                  <AmazonIntegrationCallback />
                </ClientRoute>
              </MaintenanceGate>
            }
          />
          <Route
            path="/dashboard"
            element={
              <MaintenanceGate>
                <ClientRoute>
                  <SupabaseDashboard />
                </ClientRoute>
              </MaintenanceGate>
            }
          />

          {/* ✅ Admin Panel - neprotejat, acces complet */}
          <Route path="/admin-login" element={<SupabaseLoginForm />} />
          <Route path="/admin-info" element={<AdminLoginInfo />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <SupabaseAdminPanel />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/analytics"
            element={
              <AdminRoute>
                <AdminAnalytics />
              </AdminRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}
