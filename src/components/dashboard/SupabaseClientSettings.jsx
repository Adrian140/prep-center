import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../translations';

function SupabaseClientSettings() {
  const { t } = useDashboardTranslation();
  const { profile, updateProfile } = useSupabaseAuth();
  const [prepShipments, setPrepShipments] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPrepShipments(profile?.notify_prep_shipments ?? true);
  }, [profile?.notify_prep_shipments]);

  const handleToggle = async () => {
    const next = !prepShipments;
    setPrepShipments(next);
    setSaving(true);
    setMessage('');
    const result = await updateProfile({ notify_prep_shipments: next });
    if (!result?.success) {
      setPrepShipments(!next);
      setMessage(result?.error || t('settings.notifications.error'));
      setSaving(false);
      return;
    }
    setMessage(t('settings.notifications.updated'));
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">{t('settings.title')}</h2>
        <p className="text-sm text-text-secondary">{t('settings.subtitle')}</p>
      </div>

      {message && (
        <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-600">
          {message}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              {t('settings.notifications.title')}
            </h3>
            <p className="text-sm text-text-secondary">
              {t('settings.notifications.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t('settings.notifications.prepShipments')}
            </p>
            <p className="text-xs text-text-secondary">
              {t('settings.notifications.prepShipmentsDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              prepShipments ? 'bg-primary' : 'bg-gray-300'
            } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-pressed={prepShipments}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                prepShipments ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <p className="text-xs text-text-light">{t('settings.notifications.note')}</p>
      </div>
    </div>
  );
}

export default SupabaseClientSettings;
