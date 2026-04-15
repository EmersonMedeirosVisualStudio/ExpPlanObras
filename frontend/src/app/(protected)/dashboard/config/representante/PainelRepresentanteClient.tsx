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
      <div className="rounded-xl border bg-white p-5 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Painel do Representante</h1>
        <div className="mt-2 text-sm text-slate-600">Contexto: Empresa</div>

        <div className="mt-4 flex justify-center">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setContexto('EMPRESA');
                setAbaEmpresa('CONFIG');
              }}
              className={classNames('px-4 py-2 text-sm', abaEmpresa === 'CONFIG' ? 'bg-white text-slate-900 font-semibold' : 'bg-white text-slate-600 hover:text-slate-900')}
            >
              Configuração
            </button>
            <button
              type="button"
              onClick={() => {
                setContexto('EMPRESA');
                setAbaEmpresa('DASHBOARD');
              }}
              className={classNames('px-4 py-2 text-sm', abaEmpresa === 'DASHBOARD' ? 'bg-white text-slate-900 font-semibold' : 'bg-white text-slate-600 hover:text-slate-900')}
            >
              Dashboard
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
