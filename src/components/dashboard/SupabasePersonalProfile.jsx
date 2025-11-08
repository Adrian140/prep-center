// FILE: src/components/dashboard/SupabasePersonalProfile.jsx
import React, { useState, useEffect } from 'react';
import { Save, Edit } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useDashboardTranslation } from '../../translations';
import { useLanguage } from '../../contexts/LanguageContext';

function SupabasePersonalProfile() {
  const { changeLanguage } = useLanguage();
  const { t } = useDashboardTranslation();
  const { user, profile, updateProfile } = useSupabaseAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    country: 'FR',
    language: 'en',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const countries = [
    { code: 'RO', name: 'Romania' },
    { code: 'FR', name: 'France' },
    { code: 'DE', name: 'Germany' },
    { code: 'IT', name: 'Italy' },
    { code: 'ES', name: 'Spain' },
    { code: 'NL', name: 'Netherlands' },
  ];

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'ro', name: 'Română' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'es', name: 'Español' },
  ];

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
        country: profile.country || 'FR',
        language: profile.language || 'en',
      });
        // sincronizează UI cu limba din profil (dacă există)
     if (profile.language) {
       changeLanguage(profile.language);
       try { localStorage.setItem('appLang', profile.language); } catch {}
     }
    }
  }, [profile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const result = await updateProfile(formData);

    if (result.success) {
      setMessage(t('profile.flashOk'));
      setIsEditing(false);

      // Apply language immediately and persist
      if (formData?.language) {
       changeLanguage(formData.language);
       try { localStorage.setItem('appLang', formData.language); } catch {}
     }
    } else {
      setMessage(result.error || t('profile.flashErr'));
    }

    setLoading(false);
  };

  const handleChange = (e) => {
    setFormData((s) => ({
      ...s,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-text-primary">{t('profile.title')}</h2>
        <button
          onClick={() => setIsEditing((v) => !v)}
          className="flex items-center px-4 py-2 text-primary hover:text-primary-dark transition-colors"
        >
          <Edit className="w-4 h-4 mr-2" />
          {isEditing ? t('profile.cancel') : t('profile.edit')}
        </button>
      </div>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg ${
            message.toLowerCase().includes('success')
              ? 'bg-green-50 border border-green-200 text-green-600'
              : 'bg-red-50 border border-red-200 text-red-600'
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-text-primary mb-2">
              {t('profile.fields.firstName')}
            </label>
            <input
              type="text"
              id="first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              disabled={!isEditing}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50"
            />
          </div>

          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-text-primary mb-2">
             {t('profile.fields.lastName')}
            </label>
            <input
              type="text"
              id="last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              disabled={!isEditing}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
            {t('profile.fields.email')}
          </label>
          <input
            type="email"
            id="email"
            value={user?.email || ''}
            disabled
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
          />
          <p className="text-sm text-text-light mt-1">
            {t('profile.fields.emailNote')}
          </p>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-text-primary mb-2">
            {t('profile.fields.phone')}
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            disabled={!isEditing}
            placeholder={t('profile.fields.phonePh')}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-text-primary mb-2">
              {t('profile.fields.country')}
            </label>
            <select
              id="country"
              name="country"
              value={formData.country}
              onChange={handleChange}
              disabled={!isEditing}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {t(`profile.countries.${c.code}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="language" className="block text-sm font-medium text-text-primary mb-2">
              {t('profile.fields.language')}
            </label>
            <select
              id="language"
              name="language"
              value={formData.language}
              onChange={handleChange}
              disabled={!isEditing}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {t(`profile.languages.${l.code}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isEditing && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? t('profile.saving') : t('profile.save')}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default SupabasePersonalProfile;
