import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Building } from 'lucide-react';
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
import { useTranslation } from '../../translations';

function SupabaseRegisterForm() {
  const [formData, setFormData] = useState({
    accountType: 'individual',
    firstName: '',
    lastName: '',
    companyName: '',
    cui: '',
    vatNumber: '',
    companyAddress: '',
    companyCity: '',
    companyPostalCode: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    country: 'FR',
    language: 'en',
    acceptTerms: false,
    acceptMarketing: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { signUp } = useSupabaseAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const validatePassword = (password) => {
    const minLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    return minLength && hasUpperCase && hasNumber;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    if (formData.accountType === 'individual') {
      if (!formData.firstName || !formData.lastName) {
        setError('First name and last name are required for individual accounts.');
        setLoading(false);
        return;
      }
    } else if (formData.accountType === 'company') {
      if (!formData.companyName || !formData.cui || !formData.companyAddress || !formData.companyCity || !formData.companyPostalCode) {
        setError('All fields marked with * are required for company accounts.');
        setLoading(false);
        return;
      }
    }

    if (!validatePassword(formData.password)) {
      setError('Password must have at least 8 characters, one uppercase letter, and one number.');
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

    const metadata = {
      // snake_case (current schema)
      account_type: formData.accountType,
      first_name: formData.firstName,
      last_name: formData.lastName,
      company_name: formData.companyName,
      cui: formData.cui,
      vat_number: formData.vatNumber,
      company_address: formData.companyAddress,
      company_city: formData.companyCity,
      company_postal_code: formData.companyPostalCode,
      phone: formData.phone,
      country: formData.country,
      language: formData.language,
      accept_terms: formData.acceptTerms,
      accept_marketing: formData.acceptMarketing,
      // camelCase (legacy schema still in production)
      accountType: formData.accountType,
      firstName: formData.firstName,
      lastName: formData.lastName,
      companyName: formData.companyName,
      vatNumber: formData.vatNumber,
      companyAddress: formData.companyAddress,
      companyCity: formData.companyCity,
      companyPostalCode: formData.companyPostalCode,
      phoneNumber: formData.phone,
      countryCode: formData.country,
      languageCode: formData.language,
      acceptTerms: formData.acceptTerms,
      acceptMarketing: formData.acceptMarketing
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            Create account
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Or{' '}
            <Link to="/login" className="font-medium text-primary hover:text-primary-dark">
              log in here
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg">
              {success}
            </div>
          )}
          
          <div className="space-y-4">
            {/* Account Type Selection */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">
                Account type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
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
                <label className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
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

            {/* Individual Fields */}
            {formData.accountType === 'individual' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-text-primary mb-2">
                    First name *
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
                      className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="First name"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-text-primary mb-2">
                    Last name *
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Last name"
                  />
                </div>
              </div>
            )}

            {/* Company Fields */}
            {formData.accountType === 'company' && (
              <div className="space-y-4">
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
                      className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Company name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="cui" className="block text-sm font-medium text-text-primary mb-2">
                      Company ID (CUI) *
                    </label>
                    <input
                      id="cui"
                      name="cui"
                      type="text"
                      required
                      value={formData.cui}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="RO12345678"
                    />
                  </div>
                  <div>
                    <label htmlFor="vatNumber" className="block text-sm font-medium text-text-primary mb-2">
                      VAT number (optional)
                    </label>
                    <input
                      id="vatNumber"
                      name="vatNumber"
                      type="text"
                      value={formData.vatNumber}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="RO12345678"
                    />
                  </div>
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Street, number"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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
                  className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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
                  className="pl-10 pr-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="At least 8 characters, 1 uppercase, 1 number"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-light hover:text-text-secondary"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
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
                  className="pl-10 pr-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
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
            className="w-full bg-primary text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SupabaseRegisterForm;
