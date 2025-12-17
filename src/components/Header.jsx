// FILE: src/components/Header.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import LanguageSelector from '@/components/common/LanguageSelector';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Menu, X } from 'lucide-react';
import { useT } from '@/i18n/useT';

function Header() {
  const t = useT();
  const location = useLocation();
  const { isAuthenticated, user, profile, signOut } = useSupabaseAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const onLang = () => setIsMenuOpen(false);
    window.addEventListener('i18n:changed', onLang);
    return () => window.removeEventListener('i18n:changed', onLang);
  }, []);

  const isAdmin = !!(
    profile?.account_type === 'admin' ||
    user?.user_metadata?.account_type === 'admin'
  );

  const navigation = useMemo(
    () => [
      { name: t('nav.home'),     href: '/' },
      { name: t('nav.services'), href: '/services-pricing' },
      { name: 'Integrations', href: '/integrations' },
      { name: t('nav.about'),    href: '/about' },
      { name: t('nav.contact'),  href: '/contact' },
    ],
    [t]
  );

  const isActive = (href) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign-out failed', err);
    } finally {
      setIsMenuOpen(false);
    }
  };

  return (
    <header className="bg-white shadow-lg sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3 cursor-pointer">
            <img
              src="/branding/fulfillment-prep-logo.png"
              alt="Fulfillment Prep Logistics Logo"
              className="w-auto object-contain"
              style={{ height: '5.5rem' }}
            />
            <div className="flex flex-col">
              <span className="text-lg font-bold text-text-primary leading-tight">PrepCenter</span>
              <span className="text-xs font-medium text-primary leading-tight">France</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive(item.href)
                    ? 'text-primary bg-blue-50 border border-blue-200'
                    : 'text-text-secondary hover:text-primary hover:bg-gray-50'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center space-x-3">
            <LanguageSelector />

            <div className="flex items-center space-x-2 ml-4 pl-4 border-l border-gray-200">
              {!isAuthenticated ? (
                <Link
                  to="/admin-login"
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                >
                  {t('actions.login')}
                </Link>
              ) : isAdmin ? (
                <Link
                  to="/admin"
                  className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                >
                  {t('actions.admin')}
                </Link>
              ) : (
                <Link
                  to="/dashboard"
                  className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                >
                  {t('actions.dashboard')}
                </Link>
              )}

              {isAuthenticated && (
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary border border-gray-200 hover:text-red-600 hover:border-red-300 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  {t('actions.signOut') || 'Sign out'}
                </button>
              )}

              {!isAuthenticated && (
                <Link
                  to="/register"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md text-sm"
                >
                  {t('actions.register')}
                </Link>
              )}

              <a
                href="https://wa.me/33675116218"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25D366] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#1ebe5d] transition-all duration-200 shadow-sm hover:shadow-md text-sm"
              >
                {t('actions.whatsApp')}
              </a>

              <Link
                to="/contact"
                className="bg-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-dark transition-all duration-200 shadow-sm hover:shadow-md text-sm"
              >
                {t('actions.quote')}
              </Link>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen((v) => !v)}
              className="p-2 text-text-secondary hover:text-primary hover:bg-gray-50 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-4 pt-4 pb-6 space-y-3 bg-white border-t border-gray-100">
              {/* Links */}
              <div className="space-y-2">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`block px-4 py-3 text-base font-medium rounded-lg transition-colors ${
                      isActive(item.href)
                        ? 'text-primary bg-blue-50 border border-blue-200'
                        : 'text-text-secondary hover:text-primary hover:bg-gray-50'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>

              {/* Language */}
              <div className="pt-4 border-t border-gray-100">
                <div className="px-4 pb-3">
                  <LanguageSelector />
                </div>
              </div>

              {/* User Actions */}
              <div className="space-y-3">
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  {!isAuthenticated ? (
                    <Link
                      to="/admin-login"
                      className="block w-full bg-gray-600 text-white px-4 py-3 rounded-lg font-medium text-center hover:bg-gray-700 transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t('actions.login')}
                    </Link>
                  ) : isAdmin ? (
                    <Link
                      to="/admin"
                      className="block w-full bg-red-600 text-white px-4 py-3 rounded-lg font-medium text-center hover:bg-red-700 transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t('actions.admin')}
                    </Link>
                  ) : (
                    <Link
                      to="/dashboard"
                      className="block w-full bg-gray-100 text-gray-800 px-4 py-3 rounded-lg font-medium text-center hover:bg-gray-200 transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t('actions.dashboard')}
                    </Link>
                  )}

                  {isAuthenticated && (
                    <button
                      onClick={handleSignOut}
                      className="block w-full bg-red-50 text-red-600 px-4 py-3 rounded-lg font-medium text-center border border-red-100 hover:bg-red-100 transition-colors"
                    >
                      {t('actions.signOut') || 'Sign out'}
                    </button>
                  )}

                  {!isAuthenticated && (
                    <Link
                      to="/register"
                      className="block w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-medium text-center hover:bg-blue-700 transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {t('actions.register')}
                    </Link>
                  )}

                  <a
                    href="https://wa.me/33675116218"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-[#25D366] text-white px-4 py-3 rounded-lg font-medium text-center hover:bg-[#1ebe5d] transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('actions.whatsApp')}
                  </a>

                  <Link
                    to="/contact"
                    className="block w-full bg-primary text-white px-4 py-3 rounded-lg font-medium hover:bg-primary-dark transition-colors text-center"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('actions.quote')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tablet Nav */}
        <div className="hidden md:block lg:hidden">
          <nav className="flex items-center justify-center space-x-6 py-3 border-t border-gray-100">
            {navigation.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive(item.href)
                    ? 'text-primary bg-blue-50 border border-blue-200'
                    : 'text-text-secondary hover:text-primary hover:bg-gray-50'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

export default Header;
