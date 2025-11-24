// FILE: src/components/auth/SupabaseLoginForm.jsx
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

function SupabaseLoginForm() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // adăugat: loadUserProfile este folosit mai jos, trebuie destructurat din context
  const { signIn, loadUserProfile } = useSupabaseAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const fromLocation = location.state?.from;
  const from =
    fromLocation
      ? `${fromLocation.pathname || ''}${fromLocation.search || ''}${fromLocation.hash || ''}`
      : '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn(formData.email, formData.password);

    if (result.success) {
      // 1) Admins -> /admin
      if (
        result.profile?.account_type === 'admin' ||
        result.user?.user_metadata?.account_type === 'admin'
      ) {
        setLoading(false);
        navigate('/admin', { replace: true });
        return;
      }

      // 2) dacă profilul n-a venit încă, încearcă reîncărcarea rapidă
      if (result.user?.id) {
        const reloaded = await loadUserProfile(result.user.id);
        if (reloaded?.account_type === 'admin') {
          setLoading(false);
          navigate('/admin', { replace: true });
          return;
        }
      }

      // 3) Email neconfirmat
      if (result.emailVerified === false) {
        setLoading(false);
        setError(
          'You need to confirm your email address before continuing. Please check your inbox/spam and click the confirmation link.'
        );
        return;
      }

      // 4) Client normal
      setLoading(false);
      navigate(from, { replace: true });
    } else {
      let errorMessage = result.error || 'An unknown error occurred.';
      if (errorMessage === 'Invalid login credentials') {
        errorMessage = 'Incorrect email or password. Please try again.';
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            Sign in
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

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
        </form>
      </div>
    </div>
  );
}

export default SupabaseLoginForm;
