import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Building, Tag } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useTranslation } from '../../translations';
import { supabaseHelpers } from '@/config/supabaseHelpers';

function SupabaseRegisterForm() {
  const [formData, setFormData] = useState({
    accountType: 'individual',
    firstName: '',
    lastName: '',
    companyName: '',
    vatNumber: '',
    companyAddress: '',
    companyCity: '',
    companyPostalCode: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    country: 'FR',
    marketChoice: 'FR',
    language: 'en',
    affiliateCode: '',
    acceptTerms: false,
    acceptMarketing: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [affiliateStatus, setAffiliateStatus] = useState({ state: 'idle' });

  const { signUp } = useSupabaseAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const prefillMarket = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = String(params.get('country') || params.get('market') || '').toUpperCase();
    if (raw === 'DE') return 'DE';
    if (raw === 'FR') return 'FR';
    if (raw === 'BOTH') return 'BOTH';
    return null;
  }, [location.search]);
  const prefillAffiliate = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = String(params.get('affiliate') || params.get('affiliate_code') || '').trim();
    return raw ? raw.toUpperCase() : '';
  }, [location.search]);

  useEffect(() => {
    if (!prefillMarket) return;
    setFormData((prev) => ({
      ...prev,
      marketChoice: prefillMarket
    }));
  }, [prefillMarket]);
  useEffect(() => {
    if (!prefillAffiliate) return;
    setFormData((prev) => {
      if (prev.affiliateCode && prev.affiliateCode.trim()) return prev;
      return { ...prev, affiliateCode: prefillAffiliate };
    });
  }, [prefillAffiliate]);

  const validatePassword = (password) => {
    const minLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    return minLength && hasUpperCase && hasLowerCase && hasNumber && hasSymbol;
  };

  const checkAffiliateCode = async (code) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setAffiliateStatus({ state: 'idle' });
      return { valid: true, data: null };
    }
    setAffiliateStatus({ state: 'loading' });
    const { data, error } = await supabaseHelpers.lookupAffiliateCode(trimmed);
    if (error) {
      setAffiliateStatus({ state: 'error', message: error.message });
      return { valid: false };
    }
    if (!data) {
      setAffiliateStatus({ state: 'invalid' });
      return { valid: false };
    }
    setAffiliateStatus({ state: 'valid', data });
    return { valid: true, data };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const trimmedFirst = formData.firstName.trim();
    const trimmedLast = formData.lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError('First name and last name are required.');
      setLoading(false);
      return;
    }

    // Validation
    const trimmedPhone = formData.phone.trim();
    if (!trimmedPhone) {
      setError('Phone number is required.');
      setLoading(false);
      return;
    }

    if (formData.accountType === 'company') {
      if (!formData.companyName || !formData.companyAddress || !formData.companyCity || !formData.companyPostalCode) {
        setError('All fields marked with * are required for company accounts.');
        setLoading(false);
        return;
      }
    }

    if (!formData.marketChoice) {
      setError('Please select a market (France, Germany, or both).');
      setLoading(false);
      return;
    }

    if (!validatePassword(formData.password)) {
      setError(t('authPasswordRequirements'));
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (!formData.acceptTerms) {
      setError('You must accept the Terms and Conditions.');
      setLoading(false);
      return;
    }

    if (formData.affiliateCode.trim()) {
      const affiliateCheck = await checkAffiliateCode(formData.affiliateCode);
      if (!affiliateCheck.valid) {
        setError(t('authAffiliateInvalid'));
        setLoading(false);
        return;
      }
    }

    const allowedMarkets =
      formData.marketChoice === 'BOTH'
        ? ['FR', 'DE']
        : [formData.marketChoice];
    const primaryCountry =
      formData.marketChoice === 'BOTH' ? 'FR' : formData.marketChoice;

    const metadata = {
      // snake_case (current schema)
      account_type: formData.accountType,
      first_name: trimmedFirst,
      last_name: trimmedLast,
      company_name: formData.companyName,
      vat_number: formData.vatNumber,
      company_address: formData.companyAddress,
      company_city: formData.companyCity,
      company_postal_code: formData.companyPostalCode,
      phone: trimmedPhone,
      country: primaryCountry,
      language: formData.language,
      allowed_markets: allowedMarkets,
      accept_terms: formData.acceptTerms,
      accept_marketing: formData.acceptMarketing,
      affiliate_code: formData.affiliateCode.trim(),
      affiliate_code_input: formData.affiliateCode.trim(),
      // camelCase (legacy schema still in production)
      accountType: formData.accountType,
      firstName: trimmedFirst,
      lastName: trimmedLast,
      companyName: formData.companyName,
      vatNumber: formData.vatNumber,
      companyAddress: formData.companyAddress,
      companyCity: formData.companyCity,
      companyPostalCode: formData.companyPostalCode,
      phoneNumber: trimmedPhone,
      countryCode: primaryCountry,
      languageCode: formData.language,
      allowedMarkets,
      acceptTerms: formData.acceptTerms,
      acceptMarketing: formData.acceptMarketing,
      affiliateCode: formData.affiliateCode.trim()
    };

          const result = await signUp(
        formData.email,
        formData.password,
        metadata
      );
    
    if (result.success) {
      setSuccess(result.message);
      setTimeout(() => navigate('/login'), 3000);
    } else {
      console.error('Signup error:', result.error);
      setError(t('authSignupGenericError'));
    }
    
    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div>
          <h2 className="mt-4 text-center text-3xl font-bold text-text-primary">
            Create account
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Or{' '}
            <Link to="/login" className="font-medium text-primary hover:text-primary-dark">
              log in here
            </Link>
          </p>
        </div>
        
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-3 py-2 rounded-lg">
              {success}
            </div>
          )}

          <div className="space-y-3">
            {/* Account Type Selection */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">
                Account type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="accountType"
                    value="individual"
                    checked={formData.accountType === 'individual'}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <User className="w-5 h-5 mr-2 text-text-secondary" />
                  <span>Individual</span>
                </label>
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="accountType"
                    value="company"
                    checked={formData.accountType === 'company'}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <Building className="w-5 h-5 mr-2 text-text-secondary" />
                  <span>Company</span>
                </label>
              </div>
            </div>

            {/* Contact person */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-text-primary mb-2">
                  {formData.accountType === 'company' ? 'Contact first name *' : 'First name *'}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="First name"
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-text-primary mb-2">
                  {formData.accountType === 'company' ? 'Contact last name *' : 'Last name *'}
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Last name"
                />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-text-primary mb-2">
              Phone number *
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="+33 6 12 34 56 78"
            />
          </div>

          <div>
            <label htmlFor="marketChoice" className="block text-sm font-medium text-text-primary mb-2">
              Market selection *
            </label>
            <select
              id="marketChoice"
              name="marketChoice"
              required
              value={formData.marketChoice}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="FR">France</option>
              <option value="DE">Germany</option>
              <option value="BOTH">France + Germany</option>
            </select>
            <p className="text-xs text-text-light mt-1">
              Choose where you want your client account created. If you select both, you can switch between markets after login.
            </p>
          </div>

          {/* Company Fields */}
          {formData.accountType === 'company' && (
            <div className="space-y-3">
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-text-primary mb-2">
                    Company name *
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
                    <input
                      id="companyName"
                      name="companyName"
                      type="text"
                      required
                      value={formData.companyName}
                      onChange={handleChange}
                    className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="Company name"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="vatNumber" className="block text-sm font-medium text-text-primary mb-2">
                    VAT number
                  </label>
                  <input
                    id="vatNumber"
                    name="vatNumber"
                    type="text"
                    value={formData.vatNumber}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="FR12345678"
                  />
                </div>

                <div>
                  <label htmlFor="companyAddress" className="block text-sm font-medium text-text-primary mb-2">
                    Company address *
                  </label>
                  <input
                    id="companyAddress"
                    name="companyAddress"
                    type="text"
                    required
                    value={formData.companyAddress}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="Street, number"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="companyCity" className="block text-sm font-medium text-text-primary mb-2">
                      City *
                    </label>
                    <input
                      id="companyCity"
                      name="companyCity"
                      type="text"
                      required
                      value={formData.companyCity}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label htmlFor="companyPostalCode" className="block text-sm font-medium text-text-primary mb-2">
                      Postal code *
                    </label>
                    <input
                      id="companyPostalCode"
                      name="companyPostalCode"
                      type="text"
                      required
                      value={formData.companyPostalCode}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="010101"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-2">
                Email *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="your.email@example.com"
                />
              </div>
            </div>
            
            {/* Password Fields */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-2">
                Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="pl-9 pr-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="At least 8 chars, uppercase, lowercase, number, symbol"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-light hover:text-text-secondary"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-1">{t('authPasswordRequirements')}</p>
            </div>
            
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-2">
                Confirm password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="pl-9 pr-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="Confirm password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-light hover:text-text-secondary"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="affiliateCode" className="block text-sm font-medium text-text-primary mb-2">
              {t('authAffiliateLabel')}
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-light w-5 h-5" />
              <input
                id="affiliateCode"
                name="affiliateCode"
                type="text"
                value={formData.affiliateCode}
                onChange={handleChange}
                onBlur={() => checkAffiliateCode(formData.affiliateCode)}
                className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary uppercase"
                placeholder="AF123"
              />
            </div>
            <p className="text-xs text-text-secondary mt-1">{t('authAffiliateHint')}</p>
            {affiliateStatus.state === 'loading' && (
              <p className="text-xs text-text-secondary mt-1">{t('common.loading')}</p>
            )}
            {affiliateStatus.state === 'invalid' && (
              <p className="text-xs text-red-600 mt-1">{t('authAffiliateInvalid')}</p>
            )}
            {affiliateStatus.state === 'valid' && (
              <p className="text-xs text-green-600 mt-1">
                {t('authAffiliateValid', {
                  label: affiliateStatus.data?.label || affiliateStatus.data?.code
                })}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-start">
              <input
                id="acceptTerms"
                name="acceptTerms"
                type="checkbox"
                required
                checked={formData.acceptTerms}
                onChange={handleChange}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded mt-1"
              />
              <label htmlFor="acceptTerms" className="ml-2 block text-sm text-text-secondary">
                By checking this box, I confirm that I have read and agree with{' '}
                <Link to="/terms" className="text-primary hover:text-primary-dark">
                  Terms and Conditions
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-primary hover:text-primary-dark">
                  Privacy Policy
                </Link>
                .
              </label>
            </div>
            
            <div className="flex items-start">
              <input
                id="acceptMarketing"
                name="acceptMarketing"
                type="checkbox"
                checked={formData.acceptMarketing}
                onChange={handleChange}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded mt-1"
              />
              <label htmlFor="acceptMarketing" className="ml-2 block text-sm text-text-secondary">
                I agree to receive marketing communications (newsletter).
              </label>
            </div>
          </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SupabaseRegisterForm;
