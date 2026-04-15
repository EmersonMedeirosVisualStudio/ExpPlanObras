'use client';

import { useState } from 'react';
import ConfiguracaoEmpresaClient from '../ConfiguracaoEmpresaClient';

type Contexto = 'EMPRESA' | 'OBRA' | 'UNIDADE';
type AbaEmpresa = 'CONFIG' | 'DASHBOARD';

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function PainelRepresentanteClient() {
  const [contexto, setContexto] = useState<Contexto>('EMPRESA');
  const [abaEmpresa, setAbaEmpresa] = useState<AbaEmpresa>('CONFIG');

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-900">
            Painel do Representante
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => {
                setContexto('EMPRESA');
                setAbaEmpresa('DASHBOARD');
              }}
              className={classNames('hover:text-slate-900', abaEmpresa === 'DASHBOARD' ? 'font-semibold text-slate-900' : 'text-slate-600')}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                setContexto('EMPRESA');
                setAbaEmpresa('CONFIG');
              }}
              className={classNames('hover:text-slate-900', abaEmpresa === 'CONFIG' ? 'font-semibold text-slate-900' : 'text-slate-600')}
            >
              Configuração
            </button>
          </div>
        </div>
      </div>

      {contexto === 'EMPRESA' && abaEmpresa === 'CONFIG' ? <ConfiguracaoEmpresaClient modo="REPRESENTANTE" /> : null}

      {contexto === 'EMPRESA' && abaEmpresa === 'DASHBOARD' ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">Em breve.</div>
      ) : null}
    </div>
  );
}
