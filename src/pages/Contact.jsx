import React, { useState } from 'react';
import { MapPin, Phone, Mail, MessageCircle, Calendar } from 'lucide-react';
import { useContactTranslation } from '../translations/contact';
import { useLanguage } from '../contexts/LanguageContext';

function Contact() {
  const { currentLanguage } = useLanguage();
  const { t } = useContactTranslation(currentLanguage);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    reason: '',
    otherDetails: '',
    message: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('https://formspree.io/f/xandwobv', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setMessage(t('successMessage'));
        setFormData({ name: '', email: '', company: '', reason: '', otherDetails: '', phone: '', message: '' });
      } else {
        const data = await response.json();
        if (Object.hasOwn(data, 'errors')) {
          setMessage(data["errors"].map(error => error["message"]).join(", "));
        } else {
          setMessage(t('errorMessage'));
        }
      }
    } catch (error) {
      setMessage(error.message || t('errorMessage'));
    }

    setLoading(false);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            {t('pageTitle')}
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            {t('pageSubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div>
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-text-primary mb-6">{t('sendMessage')}</h2>
              
              {message && (
                <div className={`mb-6 px-4 py-3 rounded-lg ${
                  message.includes('succes') || message === t('successMessage')
                    ? 'bg-green-50 border border-green-200 text-green-600'
                    : 'bg-red-50 border border-red-200 text-red-600'
                }`}>
                  {message}
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-text-primary mb-2">
                    {t('nameLabel')}
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder={t('namePlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
                    {t('emailLabel')}
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder={t('emailPlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-text-primary mb-2">
                    {t('companyLabel')}
                  </label>
                  <input
                    type="text"
                    id="company"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder={t('companyPlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-text-primary mb-2">
                    {t('reasonLabel')}
                  </label>
                  <select
                    id="reason"
                    name="reason"
                    required
                    value={formData.reason}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">{t('reasonPlaceholder')}</option>
                    <option value="Request a Quote">{t('Reques Quote')}</option>
                    <option value="General Inquiry">{t('General Inquiry')}</option>
                    <option value="Technical Issue">{t('Technical Issue')}</option>
                    <option value="Partnership Request">{t('Partnership Request')}</option>
                    <option value="Other">{t('Other')}</option>
                  </select>
                </div>
                {formData.reason === 'Other' && (
                  <div>
                    <label htmlFor="otherDetails" className="block text-sm font-medium text-text-primary mb-2">
                      {t('otherDetailsLabel')}
                    </label>
                    <input
                      type="text"
                      id="otherDetails"
                      name="otherDetails"
                      required
                      value={formData.otherDetails}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder={t('otherDetailsPlaceholder')}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-text-primary mb-2">
                    {t('phoneLabel')}
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder={t('phonePlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-text-primary mb-2">
                    {t('messageLabel')}
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder={t('messagePlaceholder')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white py-3 px-6 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('sendingButton') : t('sendButton')}
                </button>
              </form>
            </div>
          </div>

          {/* Contact Info & Quick Actions */}
          <div className="space-y-8">
            {/* Quick Actions */}
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-8">
              <h3 className="text-xl font-bold text-text-primary mb-6">{t('quickContact')}</h3>
              <div className="space-y-4">
                <a
                  href="https://wa.me/33675116218"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full bg-accent text-white py-4 px-6 rounded-lg font-semibold hover:bg-accent-dark transition-colors"
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  {t('chatWhatsApp')}
                </a>
                <a
                  href="https://calendly.com/adrian-bucur/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full bg-primary text-white py-4 px-6 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                >
                  <Calendar className="w-5 h-5 mr-2" />
                  {t('bookZoomMeeting')}
                </a>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <h3 className="text-xl font-bold text-text-primary mb-6">{t('contactInformation')}</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-text-primary">{t('addressLabel')}</p>
                    <p className="text-text-secondary">
                      {t('addressValue')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Phone className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-text-primary">{t('phoneLabel')}</p>
                    <p className="text-text-secondary">{t('phoneValue')}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Mail className="w-5 h-5 text-primary flex-shrink-0" />
                  <div>
                    <p className="font-medium text-text-primary">{t('emailLabel')}</p>
                    <p className="text-text-secondary">{t('emailValue')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Business Hours */}
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <h3 className="text-xl font-bold text-text-primary mb-6">{t('businessHours')}</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">{t('mondayFriday')}</span>
                  <span className="text-text-primary font-medium">{t('mondayFridayHours')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">{t('saturday')}</span>
                  <span className="text-text-primary font-medium">{t('saturdayHours')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">{t('sunday')}</span>
                  <span className="text-text-primary font-medium">{t('sundayHours')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Map Section */}
        <section className="mt-20">
          <h2 className="text-3xl font-bold text-text-primary mb-8 text-center">{t('ourLocation')}</h2>
          <div className="rounded-xl overflow-hidden shadow-lg">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2659.8234567890123!2d-1.8234567890123456!3d48.61234567890123!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x480e9a1234567890%3A0x1234567890abcdef!2s35350%20La%20Gouesnière%2C%20France!5e0!3m2!1sen!2sus!4v1234567890123"
              width="100%"
              height="400"
              style={{ border: 0 }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={t('mapTitle')}
            ></iframe>
          </div>
          <div className="mt-6 text-center">
            <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 px-6 py-4 shadow-sm">
              <MapPin className="w-5 h-5 text-primary mr-3" />
              <div className="text-left">
                <p className="font-semibold text-text-primary">{t('locationName')}</p>
                <p className="text-text-secondary">{t('locationAddress')}</p>
                <p className="text-sm text-text-light">{t('locationDescription')}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Contact;
