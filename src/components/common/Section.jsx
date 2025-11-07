import React from 'react';

export default function Section({ title, children, right }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        {title ? (
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        ) : <span />}
        {right}
      </div>
      {children}
    </div>
  );
}
