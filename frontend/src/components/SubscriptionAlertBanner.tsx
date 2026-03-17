'use client';

import { useState } from 'react';

export function SubscriptionAlertBanner() {
  const [message, setMessage] = useState(() => {
    try {
      const token = localStorage.getItem('token');
      const msg = localStorage.getItem('subscription_alert');
      if (!token || !msg) return '';
      return msg;
    } catch {
      return '';
    }
  });

  if (!message) return null;

  const close = () => {
    try {
      localStorage.removeItem('subscription_alert');
    } catch {
    }
    setMessage('');
  };

  return (
    <div className="w-full bg-yellow-50 border-b border-yellow-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-start justify-between gap-3">
        <div className="text-sm text-yellow-900">{message}</div>
        <button type="button" onClick={close} className="text-sm px-3 py-1 border rounded hover:bg-yellow-100">
          Fechar
        </button>
      </div>
    </div>
  );
}
