import React from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { Navigate } from 'react-router-dom';

function AdminRoute({ children }) {
  const { loading, profile, user } = useSupabaseAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Verificare autentificare...</p>
        </div>
      </div>
    );
  }

  if (user && profile?.account_type === 'admin') {
    return children;
  }

  return <Navigate to="/admin-login" replace />;
}

export default AdminRoute;
