import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../translations';

function SupabaseClientSettings() {
  const { t } = useDashboardTranslation();
  const { profile, updateProfile } = useSupabaseAuth();
  const [prepShipments, setPrepShipments] = useState(true);
  const [receptionEmails, setReceptionEmails] = useState(true);
  const [receptionPush, setReceptionPush] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPrepShipments(profile?.notify_prep_shipments ?? true);
    setReceptionEmails(profile?.notify_reception_updates ?? true);
    setReceptionPush(profile?.notify_reception_push ?? false);
  }, [profile?.notify_prep_shipments, profile?.notify_reception_updates, profile?.notify_reception_push]);

  const handleToggle = async ({ field, value, setter }) => {
    const next = !value;
    setter(next);
    setSaving(true);
    setMessage('');
    const result = await updateProfile({ [field]: next });
    if (!result?.success) {
      setter(!next);
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
            onClick={() =>
              handleToggle({
                field: 'notify_prep_shipments',
                value: prepShipments,
                setter: setPrepShipments
              })
            }
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

        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Reception management updates (email)
            </p>
            <p className="text-xs text-text-secondary">
              Latest stable reception snapshot after 1 hour without changes.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              handleToggle({
                field: 'notify_reception_updates',
                value: receptionEmails,
                setter: setReceptionEmails
              })
            }
            disabled={saving}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              receptionEmails ? 'bg-primary' : 'bg-gray-300'
            } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-pressed={receptionEmails}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                receptionEmails ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Reception management updates (push)
            </p>
            <p className="text-xs text-text-secondary">
              Enable push notifications for reception updates.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              handleToggle({
                field: 'notify_reception_push',
                value: receptionPush,
                setter: setReceptionPush
              })
            }
            disabled={saving}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              receptionPush ? 'bg-primary' : 'bg-gray-300'
            } ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-pressed={receptionPush}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                receptionPush ? 'translate-x-6' : 'translate-x-1'
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
