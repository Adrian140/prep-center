// FILE: src/components/admin/AdminStockClientView.jsx
import React, { useMemo } from 'react';
import ClientStock from '@/components/dashboard/client/ClientStock';

export default function AdminStockClientView({ profile }) {
  if (!profile) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-text-secondary">
        Select a client to view stock details.
      </div>
    );
  }

  const storagePrefix = useMemo(() => {
    if (profile.company_id) return `admin-stock-${profile.company_id}`;
    if (profile.id) return `admin-stock-user-${profile.id}`;
    return 'admin-stock';
  }, [profile.company_id, profile.id]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <ClientStock
        profileOverride={profile}
        statusOverride="ready"
        hideGuides
        storagePrefixOverride={storagePrefix}
        enableIdentifierEdit
        enableQtyAdjust
      />
    </div>
  );
}
