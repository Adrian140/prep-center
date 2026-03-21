import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { PKCE_STORAGE_PREFIX } from '@/components/dashboard/client/ClientEtsyIntegration';
import { useEtsyI18n } from '@/i18n/etsyI18n';

export default function EtsyIntegrationCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useEtsyI18n();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState(t('client.callback.processing'));

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const errorCode = params.get('error');
    const errorDescription = params.get('error_description');

    if (errorCode) {
      setStatus('error');
      setMessage(errorDescription || errorCode || t('client.callback.failed'));
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage(t('client.callback.missingData'));
      return;
    }

    let nonce = '';
    try {
      const parsed = JSON.parse(atob(state));
      nonce = parsed?.nonce || '';
    } catch {
      nonce = '';
    }

    const codeVerifier = nonce ? sessionStorage.getItem(`${PKCE_STORAGE_PREFIX}${nonce}`) || '' : '';
    if (!codeVerifier) {
      setStatus('error');
      setMessage(t('client.callback.missingVerifier'));
      return;
    }

    const run = async () => {
      setStatus('processing');
      setMessage(t('client.callback.saving'));
      const { data, error } = await supabase.functions.invoke('etsy_oauth_callback', {
        body: { code, state, code_verifier: codeVerifier }
      });

      sessionStorage.removeItem(`${PKCE_STORAGE_PREFIX}${nonce}`);

      if (error || data?.ok === false) {
        let extra = '';
        if (error?.context?.response) {
          try {
            extra = await error.context.response.text();
          } catch {
            extra = '';
          }
        }
        const fallback = error?.message || data?.error || t('client.callback.failed');
        setStatus('error');
        setMessage(extra ? `${fallback}: ${extra}` : fallback);
        return;
      }

      setStatus('success');
      setMessage(t('client.callback.success'));
      setTimeout(() => navigate('/dashboard?tab=integrations', { replace: true }), 1800);
    };

    run();
  }, [params, navigate, t]);

  const statusClass =
    status === 'success'
      ? 'text-emerald-600'
      : status === 'error'
      ? 'text-red-600'
      : 'text-text-secondary';

  const title =
    status === 'success'
      ? t('client.callback.titleSuccess')
      : status === 'error'
      ? t('client.callback.titleError')
      : t('client.callback.titlePending');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center space-y-3">
        <div className={`text-lg font-semibold ${statusClass}`}>{title}</div>
        <p className="text-sm text-text-secondary">{message}</p>
        {status === 'error' && (
          <button
            onClick={() => navigate('/dashboard?tab=integrations', { replace: true })}
            className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white"
          >
            {t('client.actions.back')}
          </button>
        )}
      </div>
    </div>
  );
}
