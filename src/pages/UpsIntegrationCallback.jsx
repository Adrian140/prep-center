import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';

export default function UpsIntegrationCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing UPS authorization...');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const errorCode = params.get('error');
    const errorDescription = params.get('error_description');

    if (errorCode) {
      setStatus('error');
      setMessage(errorDescription || errorCode || 'UPS authorization failed.');
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization data from UPS callback.');
      return;
    }

    const run = async () => {
      setStatus('processing');
      setMessage('Saving UPS integration...');
      const { data, error } = await supabase.functions.invoke('ups_oauth_callback', {
        body: { code, state }
      });

      if (error || data?.ok === false) {
        let extra = '';
        if (error?.context?.response) {
          try {
            extra = await error.context.response.text();
          } catch {
            extra = '';
          }
        }
        const fallback = error?.message || data?.error || 'Unable to save UPS integration.';
        setStatus('error');
        setMessage(extra ? `${fallback}: ${extra}` : fallback);
        return;
      }

      setStatus('success');
      setMessage('UPS connected successfully. Redirecting...');
      setTimeout(() => navigate('/dashboard?tab=integrations', { replace: true }), 1800);
    };

    run();
  }, [params, navigate]);

  const statusClass =
    status === 'success'
      ? 'text-emerald-600'
      : status === 'error'
      ? 'text-red-600'
      : 'text-text-secondary';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center space-y-3">
        <div className={`text-lg font-semibold ${statusClass}`}>
          {status === 'success' ? 'UPS Connected' : status === 'error' ? 'UPS Error' : 'Please wait'}
        </div>
        <p className="text-sm text-text-secondary">{message}</p>
        {status === 'error' && (
          <button
            onClick={() => navigate('/dashboard?tab=integrations', { replace: true })}
            className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white"
          >
            Back to dashboard
          </button>
        )}
      </div>
    </div>
  );
}
