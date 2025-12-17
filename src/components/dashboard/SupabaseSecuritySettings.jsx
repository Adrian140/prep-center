// FILE: src/components/dashboard/SupabaseSecuritySettings.jsx
import React, { useEffect, useState } from 'react';
import { Shield, Key, Eye, EyeOff, ShieldCheck } from 'lucide-react';
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
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaNotice, setMfaNotice] = useState(null);
  const [mfaFactor, setMfaFactor] = useState(null);
  const [pendingFactor, setPendingFactor] = useState(null);
  const [enrollData, setEnrollData] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [mfaDisabling, setMfaDisabling] = useState(false);

  const loadMfaFactors = async () => {
    if (!user) return;
    setMfaLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMfaNotice({
        type: 'error',
        text: error.message || t('security.twofa.loadError'),
      });
      setMfaLoading(false);
      return;
    }
    const totpFactors = data?.totp || [];
    const verified = totpFactors.find((factor) => factor.status === 'verified');
    const pending = totpFactors.find((factor) => factor.status !== 'verified');
    setMfaFactor(verified || null);
    setPendingFactor(pending || null);
    setMfaLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      await loadMfaFactors();
    };
    if (user?.id) {
      load();
    }
  }, [user?.id]);

  const handleStartMfa = async () => {
    setMfaNotice(null);
    setMfaEnrolling(true);
    try {
      if (pendingFactor?.id) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
        if (error) throw error;
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setEnrollData(data);
      setPendingFactor({ id: data?.id, status: data?.status || 'unverified' });
      setMfaNotice({ type: 'success', text: t('security.twofa.enrollReady') });
    } catch (error) {
      setMfaNotice({
        type: 'error',
        text: error.message || t('security.twofa.enrollError'),
      });
    }
    setMfaEnrolling(false);
  };

  const handleVerifyMfa = async (event) => {
    event.preventDefault();
    setMfaNotice(null);
    if (!totpCode.trim()) {
      setMfaNotice({ type: 'error', text: t('security.twofa.codeRequired') });
      return;
    }
    if (!enrollData?.id) {
      setMfaNotice({ type: 'error', text: t('security.twofa.enrollMissing') });
      return;
    }
    setMfaVerifying(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollData.id,
      });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollData.id,
        challengeId: challengeData?.id,
        code: totpCode.trim(),
      });
      if (verifyError) throw verifyError;
      setEnrollData(null);
      setTotpCode('');
      setMfaNotice({ type: 'success', text: t('security.twofa.verified') });
      await loadMfaFactors();
    } catch (error) {
      setMfaNotice({
        type: 'error',
        text: error.message || t('security.twofa.verifyError'),
      });
    }
    setMfaVerifying(false);
  };

  const handleDisableMfa = async () => {
    if (!mfaFactor?.id) return;
    const confirmed = window.confirm(t('security.twofa.disableConfirm'));
    if (!confirmed) return;
    setMfaNotice(null);
    setMfaDisabling(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactor.id });
    if (error) {
      setMfaNotice({
        type: 'error',
        text: error.message || t('security.twofa.disableError'),
      });
      setMfaDisabling(false);
      return;
    }
    setEnrollData(null);
    setTotpCode('');
    setMfaNotice({ type: 'success', text: t('security.twofa.disabled') });
    await loadMfaFactors();
    setMfaDisabling(false);
  };

  const qrCode = enrollData?.totp?.qr_code;
  const isSvgQr = typeof qrCode === 'string' && qrCode.trim().startsWith('<svg');
  const qrImgSrc =
    typeof qrCode === 'string' && !isSvgQr && qrCode.startsWith('data:image')
      ? qrCode
      : null;

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
  const mfaNoticeClass =
    mfaNotice?.type === 'success'
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

      {/* Two-factor Authentication */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center mb-4">
          <ShieldCheck className="w-6 h-6 text-primary mr-3" />
          <h3 className="text-lg font-semibold text-text-primary">{t('security.twofa.title')}</h3>
        </div>

        <p className="text-sm text-text-secondary mb-4">{t('security.twofa.description')}</p>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>{t('security.twofa.statusLabel')}</span>
            {mfaLoading ? (
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                {t('security.twofa.statusLoading')}
              </span>
            ) : (
              <span
                className={`px-2 py-1 rounded-full ${
                  mfaFactor
                    ? 'bg-green-100 text-green-800'
                    : pendingFactor
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {mfaFactor
                  ? t('security.twofa.statusEnabled')
                  : pendingFactor
                    ? t('security.twofa.statusPending')
                    : t('security.twofa.statusDisabled')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!mfaFactor && (
              <button
                type="button"
                onClick={handleStartMfa}
                disabled={mfaEnrolling}
                className="bg-primary text-white px-5 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {mfaEnrolling
                  ? t('security.twofa.enrolling')
                  : pendingFactor
                    ? t('security.twofa.restart')
                    : t('security.twofa.enable')}
              </button>
            )}
            {mfaFactor && (
              <button
                type="button"
                onClick={handleDisableMfa}
                disabled={mfaDisabling}
                className="border border-gray-300 text-text-primary px-5 py-2 rounded-lg font-semibold hover:border-gray-400 transition-colors disabled:opacity-50"
              >
                {mfaDisabling ? t('security.twofa.disabling') : t('security.twofa.disable')}
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-text-secondary mb-4">{t('security.twofa.optional')}</p>

        {mfaNotice && <div className={`px-4 py-3 rounded-lg mb-4 ${mfaNoticeClass}`}>{mfaNotice.text}</div>}

        {pendingFactor && !enrollData && !mfaFactor && (
          <div className="text-sm text-text-secondary mb-4">{t('security.twofa.pendingNote')}</div>
        )}

        {enrollData && (
          <div className="grid gap-6 md:grid-cols-[200px_1fr] items-start">
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm font-medium text-text-primary">{t('security.twofa.qrTitle')}</span>
              {isSvgQr && (
                <div
                  className="w-40 h-40 p-2 bg-white border border-gray-200 rounded-lg"
                  dangerouslySetInnerHTML={{ __html: qrCode }}
                />
              )}
              {qrImgSrc && (
                <img
                  src={qrImgSrc}
                  alt={t('security.twofa.qrAlt')}
                  className="w-40 h-40 p-2 bg-white border border-gray-200 rounded-lg"
                />
              )}
              {!qrImgSrc && !isSvgQr && (
                <div className="text-xs text-text-light text-center">
                  {t('security.twofa.qrFallback')}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-text-primary mb-1">
                  {t('security.twofa.helpTitle')}
                </div>
                <ol className="list-decimal list-inside text-sm text-text-secondary space-y-1">
                  <li>{t('security.twofa.step1')}</li>
                  <li>{t('security.twofa.step2')}</li>
                  <li>{t('security.twofa.step3')}</li>
                </ol>
                <p className="text-xs text-text-light mt-2">{t('security.twofa.note')}</p>
              </div>

              {enrollData?.totp?.secret && (
                <div>
                  <div className="text-sm font-medium text-text-primary mb-1">
                    {t('security.twofa.secretLabel')}
                  </div>
                  <div className="font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    {enrollData.totp.secret}
                  </div>
                </div>
              )}

              <form onSubmit={handleVerifyMfa} className="space-y-3">
                <div>
                  <label htmlFor="totpCode" className="block text-sm font-medium text-text-primary mb-2">
                    {t('security.twofa.codeLabel')}
                  </label>
                  <input
                    id="totpCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totpCode}
                    onChange={(event) =>
                      setTotpCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))
                    }
                    className="w-full max-w-xs px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder={t('security.twofa.codePlaceholder')}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={mfaVerifying}
                  className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {mfaVerifying ? t('security.twofa.verifying') : t('security.twofa.verify')}
                </button>
              </form>
            </div>
          </div>
        )}
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
