import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../translations';

function UpdatePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const copy = {
    title: t('authResetTitle'),
    subtitle: t('authResetSubtitle'),
    newLabel: t('authResetNewLabel'),
    confirmLabel: t('authResetConfirmLabel'),
    hint: t('authResetHint'),
    save: t('authResetSave'),
    success: t('authResetSuccess'),
    errorLength: t('authResetErrorLength'),
    errorMismatch: t('authResetErrorMismatch')
  };

  useEffect(() => {
    let isMounted = true;

    const cleanUrl = (next) => {
      if (typeof window === 'undefined') return;
      window.history.replaceState({}, document.title, next);
    };

    const trySetSessionFromHash = async () => {
      if (typeof window === 'undefined') return null;
      const hash = window.location.hash || '';
      if (!hash.includes('access_token') || !hash.includes('refresh_token')) return null;
      const params = new URLSearchParams(hash.replace('#', '?'));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (!access_token || !refresh_token) return null;
      const { data, error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sessionError) throw sessionError;
      cleanUrl(`${window.location.pathname}${window.location.search}`);
      return data?.session ?? null;
    };

    const tryExchangeCode = async () => {
      if (typeof window === 'undefined') return null;
      const search = window.location.search || '';
      if (!search.includes('code=')) return null;
      const params = new URLSearchParams(search);
      const code = params.get('code');
      if (!code) return null;
      const { data, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
      if (codeError) throw codeError;
      params.delete('code');
      params.delete('state');
      const nextSearch = params.toString();
      const nextUrl = nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname;
      cleanUrl(nextUrl);
      return data?.session ?? null;
    };

    const ensureSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        let activeSession = data?.session ?? null;

        if (!activeSession) {
          activeSession = await trySetSessionFromHash();
        }

        if (!activeSession) {
          activeSession = await tryExchangeCode();
        }

        if (!activeSession) {
          throw new Error('missing_session');
        }

        if (isMounted) {
          setSessionReady(true);
          setError('');
        }
      } catch (err) {
        console.error('Password reset session error:', err);
        if (!isMounted) return;
        const friendlyMessage = err?.message === 'missing_session'
          ? 'Password reset session missing or expired. Please reopen the link from your email.'
          : 'Unable to validate this reset link. Request a new password reset email and try again.';
        setError(friendlyMessage);
        setSessionReady(false);
      } finally {
        if (isMounted) {
          setCheckingLink(false);
        }
      }
    };

    ensureSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY' && currentSession) {
        setSessionReady(true);
        setCheckingLink(false);
        setError('');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (!sessionReady) {
      setError('Password reset session missing or expired. Please use the latest email link to continue.');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError(copy.errorLength || 'Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(copy.errorMismatch || 'Passwords do not match.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      setMessage(copy.success || 'Password updated successfully! You will be redirected to the sign-in page.');
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => navigate('/login'), 3000);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            {copy.title || 'Set a new password'}
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            {copy.subtitle || 'Enter your new password below.'}
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          {checkingLink && !error && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg">
              Validating your reset link…
            </div>
          )}
          
          {message && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
              {message}
            </div>
          )}
          
          <div className="space-y-6">
            <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
              {copy.newLabel || 'New password'}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder={copy.newLabel || 'Enter new password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-light hover:text-text-secondary"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              {copy.hint ||
                'Use at least 8 characters and mix upper/lowercase letters, numbers, and symbols for a stronger password.'}
            </p>
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-text-primary mb-2">
              {copy.confirmLabel || 'Confirm new password'}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
              <input
                id="confirm-password"
                name="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                className="pl-10 pr-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder={copy.confirmLabel || 'Re-enter new password'}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-light hover:text-text-secondary"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          </div>

          <button
            type="submit"
            disabled={loading || checkingLink || !sessionReady}
            className="w-full bg-primary text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : copy.save || 'Save password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default UpdatePasswordForm;
