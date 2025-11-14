// FILE: src/contexts/SupabaseAuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase, supabaseHelpers } from '../config/supabase';
import { useLanguage } from './LanguageContext'; // ← folosim contextul de limbă

const SupabaseAuthContext = createContext();

export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
};

export const SupabaseAuthProvider = ({ children }) => {
  const { currentLanguage, changeLanguage } = useLanguage(); // ← lingua curentă & setter
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const lastUserIdRef = useRef(null);

  const status = loading ? 'loading' : 'ready';
  const isAuthenticated = !!user;
  const isEmailVerified =
    !!(user?.email_confirmed_at || user?.confirmed_at || session?.user?.email_confirmed_at);

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem('preferredLanguage') ||
        localStorage.getItem('appLang') ||
        'fr';
      if (stored && stored !== currentLanguage) {
        changeLanguage(stored);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;

    const safety = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    const handleAuthChange = async (event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      const u = nextSession?.user ?? null;
      const sameUser = lastUserIdRef.current && u?.id && lastUserIdRef.current === u.id;

      if (event === 'TOKEN_REFRESHED' && sameUser) {
        // doar actualizăm sesiunea/tokenul fără să rerulăm întreg flow-ul
        return;
      }

      setUser(u);
      lastUserIdRef.current = u?.id || null;
      setLoading(false);

      if (u) {
        setProfileLoading(true);
        loadUserProfile(u.id).catch((err) => {
          console.error('loadUserProfile error:', err);
          setProfileLoading(false);
        });
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(handleAuthChange);

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextSession = data?.session ?? null;
      setSession(nextSession);
      const u = nextSession?.user ?? null;
      setUser(u);
      lastUserIdRef.current = u?.id || null;
      setLoading(false);

      if (u) {
        setProfileLoading(true);
        loadUserProfile(u.id).catch((err) => {
          console.error('loadUserProfile error:', err);
          setProfileLoading(false);
        });
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safety);
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const ls =
      localStorage.getItem('preferredLanguage') ||
      localStorage.getItem('appLang') ||
      '';

    if (ls) {
      changeLanguage(ls);
      return;
    }

    const fromProfile = profile?.language && String(profile.language);
    if (fromProfile) {
      changeLanguage(fromProfile);
    }
  }, [profile?.language, changeLanguage]);

  const loadUserProfile = async (userId) => {
    try {
      setProfileLoading(true);
      const { data, error } = await supabaseHelpers.getProfile(userId);
      if (error) {
        console.error('Error loading profile:', error);
        setProfile(null);
        return null;
      }
      setProfile(data);
      return data;
    } catch (e) {
      console.error('loadUserProfile exception:', e);
      setProfile(null);
      return null;
    } finally {
      setProfileLoading(false);
    }
  };

  const signUp = async (email, password, userData = {}) => {
    setLoading(true);
    const { data, error } = await supabaseHelpers.signUp(email, password, userData);
    setLoading(false);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Account created. Please verify your email to activate access.' };
  };

  const signIn = async (email, password) => {
    setLoading(true);
    const { data: signInData, error } = await supabaseHelpers.signIn(email, password);
    if (error) {
      setLoading(false);
      return { success: false, error: error.message };
    }

    if (signInData?.user) {
      const { data: profileData, error: profileError } = await supabaseHelpers.getProfile(signInData.user.id);
      setLoading(false);
      if (profileError) {
        return { success: true, user: signInData.user, profile: null };
      }
      setProfile(profileData);
      return {
        success: true,
        user: signInData.user,
        profile: profileData,
        emailVerified: !!(signInData.user.email_confirmed_at || signInData.user.confirmed_at),
      };
    }

    setLoading(false);
    return { success: false, error: 'An unknown error occurred.' };
  };

  const signOut = async () => {
    setLoading(true);
    const { error } = await supabaseHelpers.signOut();
    setLoading(false);
    if (error) return { success: false, error: error.message };
    setProfile(null);
    setProfileLoading(false);
    return { success: true };
  };

const resetPassword = async (email) => {
  const { error } = await supabaseHelpers.resetPassword(email);

  if (error) {
    // map a few common cases, then fall back to a safe generic
    const msg = (() => {
      const m = (error.message || '').toLowerCase();
      if (m.includes('invalid email')) return 'Please enter a valid email address.';
      if (m.includes('rate limit') || m.includes('too many'))
        return 'Too many requests. Please try again in a minute.';
      if (m.includes('not found') || m.includes('user'))
        return 'If this email exists, we’ll send a reset link.';
      return 'Something went wrong. Please try again.';
    })();

    return { success: false, error: msg };
  }

  return { success: true, message: 'Password reset link has been sent to your email.' };
};

  const updateProfile = async (updates) => {
    if (!user) return { success: false, error: 'You are not signed in.' };
    setLoading(true);
    const { data, error } = await supabaseHelpers.updateProfile(user.id, updates);
    setLoading(false);
    if (error) return { success: false, error: error.message };
    setProfile(data[0]);
    setProfileLoading(false);
    return { success: true, data: data[0] };
  };

  const value = {
    user,
    profile,
    session,
    loading,
    profileLoading,
    status,
    isAuthenticated,
    isEmailVerified,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    loadUserProfile,
  };

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
};
