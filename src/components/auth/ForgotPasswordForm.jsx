import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { resetPassword } = useSupabaseAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const result = await resetPassword(email);

    if (result.success) {
      setMessage(result.message);
      setEmail('');
    } else {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            Forgot password
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Enter your email address and we’ll send you a reset link.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
              {message}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="your.email@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>

          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm text-primary hover:text-primary-dark"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ForgotPasswordForm;
