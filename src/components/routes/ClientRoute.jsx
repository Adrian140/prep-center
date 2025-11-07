// FILE: src/components/routes/ClientRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
// Alege importul care corespunde hook-ului tău din context.
// Dacă hook-ul tău se numește altfel, înlocuiește-l aici.
import { useSupabaseAuth } from '../../contexts/SupabaseAuthContext';
// alternativ, dacă expui direct { user, session, status } dintr-un hook `useAuth`:
// import { useAuth as useSupabaseAuth } from '../../contexts/SupabaseAuthContext';

export default function ClientRoute({ children }) {
  const location = useLocation();
  const { user, status } = useSupabaseAuth?.() || {};

  // Afișăm nimic cât se hidratează sesiunea (evităm flicker/redirecționări false)
  if (status === 'loading') return null;

  // Dacă nu există utilizator autenticat → trimitem la /login și păstrăm from=...
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Autentificat → randăm pagina protejată
  return children;
}
