// src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/login';

  useEffect(() => {
    const t = setTimeout(() => navigate(`${next}?verified=1`, { replace: true }), 800);
    return () => clearTimeout(t);
  }, [navigate, next]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-8 bg-white rounded-xl shadow-sm text-center">
        <div className="text-2xl font-semibold mb-2">Email confirmed</div>
        <div className="text-gray-600">You’ll be redirected…</div>
      </div>
    </div>
  );
}
