import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';

export default function AmazonIntegrationCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing…');

  useEffect(() => {
    const code = params.get('spapi_oauth_code') || params.get('code');
    const state = params.get('state');
    const sellingPartnerId = params.get('selling_partner_id') || params.get('sellingPartnerId');
    const marketplaceId = params.get('marketplace_id') || params.get('marketplaceId');

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization data.');
      return;
    }

    const run = async () => {
      setStatus('processing');
      setMessage('Saving integration…');
      const { data, error } = await supabase.functions.invoke('amazon_oauth_callback', {
        body: {
          code,
          state,
          sellingPartnerId,
          marketplaceId
        }
      });

      if (error || data?.ok === false) {
        let extra = '';
        if (error?.context?.response) {
          try {
            extra = await error.context.response.text();
          } catch (_err) {
            // ignore
          }
        }
        const fallback = error?.message || data?.error || 'Unable to save integration.';
        setStatus('error');
        setMessage(extra ? `${fallback}: ${extra}` : fallback);
        if (extra) console.error('amazon_oauth_callback error:', extra);
        return;
      }

      setStatus('success');
      setMessage('Integration saved successfully. Redirecting…');
      setTimeout(() => navigate('/dashboard?tab=integrations', { replace: true }), 2000);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const getStyles = () => {
    if (status === 'success') return 'text-emerald-600';
    if (status === 'error') return 'text-red-600';
    return 'text-text-secondary';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center space-y-3">
        <div className={`text-lg font-semibold ${getStyles()}`}>
          {status === 'success' ? 'All good!' : status === 'error' ? 'Oops…' : 'Please wait'}
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
