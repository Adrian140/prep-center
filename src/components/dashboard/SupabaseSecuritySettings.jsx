// FILE: src/components/dashboard/SupabaseSecuritySettings.jsx
import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { supabase } from '../../config/supabase';
import { useDashboardTranslation } from '../../translations';

function SupabaseSecuritySettings() {
  const { t } = useDashboardTranslation();
  const { user } = useSupabaseAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (newPassword !== confirmPassword) {
      setMessage(t('security.flash.pwdMismatch'));
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
     setMessage(t('security.flash.pwdTooShort'));
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setMessage(t('security.flash.pwdOk'));
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage(error.message || t('security.flash.pwdErr'));
    }

    setLoading(false);
  };

  const successClass =
    message.toLowerCase().includes('success') || message.toLowerCase().includes('changed')
      ? 'bg-green-50 border border-green-200 text-green-600'
      : 'bg-red-50 border border-red-200 text-red-600';

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-text-primary mb-6">{t('security.title')}</h2>
      </div>

      {message && <div className={`px-4 py-3 rounded-lg ${successClass}`}>{message}</div>}

      {/* Password Change */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center mb-6">
          <Key className="w-6 h-6 text-primary mr-3" />
          <h3 className="text-lg font-semibold text-text-primary">{t('security.changePwd.title')}</h3>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-text-primary mb-2">
               {t('security.changePwd.new')}
            </label>
            <div className="relative">
              <input
                type={showPasswords ? 'text' : 'password'}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                 placeholder={t('security.changePwd.newPh')}
              />
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-light hover:text-text-secondary"
              >
                {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-2">
              {t('security.changePwd.confirm')}
            </label>
            <input
              type={showPasswords ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder={t('security.changePwd.confirmPh')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? t('security.changePwd.changing') : t('security.changePwd.submit')}
          </button>
        </form>
      </div>

      {/* Account Information */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center mb-6">
          <Shield className="w-6 h-6 text-primary mr-3" />
          <h3 className="text-lg font-semibold text-text-primary">{t('security.accountInfo.title')}</h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">{t('security.accountInfo.emailVerified')}</span>
            <span
              className={`px-3 py-1 text-sm rounded-full ${
                user?.email_confirmed_at ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {user?.email_confirmed_at ? t('security.accountInfo.verified') : t('security.accountInfo.unverified')}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-secondary">{t('security.accountInfo.lastSignIn')}</span>
            <span className="text-text-primary">
              {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('en-GB') : 'N/A'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-secondary">{t('security.accountInfo.createdAt')}</span>
            <span className="text-text-primary">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB') : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Security Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t('security.tips.title')}</h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start"><span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>{t('security.tips.t1')}</li>
          <li className="flex items-start"><span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>{t('security.tips.t2')}</li>
          <li className="flex items-start"><span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>{t('security.tips.t3')}</li>
          <li className="flex items-start"><span className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>{t('security.tips.t4')}</li>
        </ul>
      </div>
    </div>
  );
}

export default SupabaseSecuritySettings;
