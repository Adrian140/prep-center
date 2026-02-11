// FILE: src/components/auth/SupabaseLoginForm.jsx
import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { supabase } from '../../config/supabase';

function SupabaseLoginForm() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState(null);
  const [mfaChallengeId, setMfaChallengeId] = useState(null);
  const [pendingResult, setPendingResult] = useState(null);

  // adăugat: loadUserProfile este folosit mai jos, trebuie destructurat din context
  const { signIn, loadUserProfile } = useSupabaseAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const fromLocation = location.state?.from;
  const from =
    fromLocation
      ? `${fromLocation.pathname || ''}${fromLocation.search || ''}${fromLocation.hash || ''}`
      : '/dashboard';

  const finishLogin = async (result) => {
    if (
      result?.profile?.account_type === 'admin' ||
      result?.user?.user_metadata?.account_type === 'admin'
    ) {
      setLoading(false);
      navigate('/admin', { replace: true });
      return;
    }

    if (result?.user?.id) {
      const reloaded = await loadUserProfile(result.user.id);
      if (reloaded?.account_type === 'admin') {
        setLoading(false);
        navigate('/admin', { replace: true });
        return;
      }
    }

    if (result?.emailVerified === false) {
      setLoading(false);
      setError(
        'You need to confirm your email address before continuing. Please check your inbox/spam and click the confirmation link.'
      );
      return;
    }

    setLoading(false);
    navigate(from, { replace: true });
  };

  const startMfaChallenge = async (result) => {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) {
      throw assuranceError;
    }
    if (assurance?.nextLevel !== 'aal2') {
      return false;
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const verifiedFactor = (factors?.totp || []).find((factor) => factor.status === 'verified');
    if (!verifiedFactor) {
      throw new Error(
        'Two-factor authentication is enabled, but no verified authenticator was found. Please contact support.'
      );
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: verifiedFactor.id
    });
    if (challengeError) throw challengeError;

    setPendingResult(result);
    setMfaRequired(true);
    setMfaFactorId(verifiedFactor.id);
    setMfaChallengeId(challenge?.id || null);
    setMfaCode('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const timeoutMs = 12000;
    const result = await Promise.race([
      signIn(formData.email, formData.password),
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              success: false,
              error: 'Login timeout. Please try again.'
            }),
          timeoutMs
        )
      )
    ]);

    if (!result.success) {
      let errorMessage = result.error || 'An unknown error occurred.';
      if (errorMessage === 'Invalid login credentials') {
        errorMessage = 'Incorrect email or password. Please try again.';
      }
      setError(errorMessage);
      setLoading(false);
      return;
    }

    if (result.emailVerified === false) {
      setLoading(false);
      setError(
        'You need to confirm your email address before continuing. Please check your inbox/spam and click the confirmation link.'
      );
      return;
    }

    try {
      const needsMfa = await startMfaChallenge(result);
      if (needsMfa) {
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(err.message || 'Unable to start two-factor verification.');
      setLoading(false);
      return;
    }

    await finishLogin(result);
  };

  const handleVerifyMfa = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code: mfaCode.trim()
      });
      if (verifyError) throw verifyError;

      setMfaRequired(false);
      setMfaCode('');
      setMfaFactorId(null);
      setMfaChallengeId(null);
      const result = pendingResult;
      setPendingResult(null);

      if (result) {
        await finishLogin(result);
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      await finishLogin({
        success: true,
        user: userData?.user || null,
        profile: null,
        emailVerified: true
      });
    } catch (err) {
      setError(err.message || 'Invalid verification code.');
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const mfaPrompt = useMemo(
    () =>
      'Enter the 6-digit code from your authenticator app to finish signing in.',
    []
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            {mfaRequired ? 'Two-factor verification' : 'Sign in'}
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={mfaRequired ? handleVerifyMfa : handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          {mfaRequired ? (
            <>
              <p className="text-sm text-text-secondary">{mfaPrompt}</p>
              <div>
                <label htmlFor="mfaCode" className="block text-sm font-medium text-text-primary mb-2">
                  Verification code
                </label>
                <input
                  id="mfaCode"
                  name="mfaCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="123456"
                  autoComplete="one-time-code"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify & continue'}
              </button>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light w-5 h-5" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="your.email@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light w-5 h-5" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="pl-10 pr-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Your password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light hover:text-text-secondary"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Link to="/forgot-password" className="text-sm text-primary hover:text-primary-dark">
                  Forgot your password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default SupabaseLoginForm;
