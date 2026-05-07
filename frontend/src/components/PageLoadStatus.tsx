'use client';

import { useEffect, useState } from 'react';

export function PageLoadStatusBadge(props: { loading: boolean; done: boolean }) {
  const loading = Boolean(props.loading);
  const done = Boolean(props.done);
  return (
    <div className="mb-1" aria-live="polite">
      <div
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-semibold ${
          loading ? 'border-blue-200 bg-blue-50 text-blue-800' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'
        }`}
      >
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${loading ? 'bg-blue-600 animate-pulse' : done ? 'bg-emerald-600' : 'bg-slate-400'}`} />
        {loading ? 'Carregando página...' : done ? 'Página carregada' : '—'}
      </div>
    </div>
  );
}

export function PageLoadStatusAuto() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(true);
  }, []);
  return <PageLoadStatusBadge loading={!done} done={done} />;
}
