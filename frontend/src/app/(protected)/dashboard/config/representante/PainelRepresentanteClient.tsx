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
        <div className="mt-4 flex justify-center">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setContexto('EMPRESA')}
              className={classNames(
                'px-4 py-2 text-sm font-medium',
                contexto === 'EMPRESA' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              Empresa
            </button>
            <button
              type="button"
              disabled
              className={classNames('px-4 py-2 text-sm font-medium', 'bg-white text-slate-400')}
              title="Em breve"
            >
              Obra
            </button>
            <button
              type="button"
              disabled
              className={classNames('px-4 py-2 text-sm font-medium', 'bg-white text-slate-400')}
              title="Em breve"
            >
              Unidade
            </button>
          </div>
        </div>

        {contexto === 'EMPRESA' ? (
          <div className="mt-4 flex justify-center">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setAbaEmpresa('CONFIG')}
                className={classNames(
                  'px-4 py-2 text-sm font-medium',
                  abaEmpresa === 'CONFIG' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                Configuração da Empresa
              </button>
              <button
                type="button"
                onClick={() => setAbaEmpresa('DASHBOARD')}
                className={classNames(
                  'px-4 py-2 text-sm font-medium',
                  abaEmpresa === 'DASHBOARD' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                Dashboard da Empresa
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {contexto === 'EMPRESA' && abaEmpresa === 'CONFIG' ? <ConfiguracaoEmpresaClient modo="REPRESENTANTE" /> : null}

      {contexto === 'EMPRESA' && abaEmpresa === 'DASHBOARD' ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">Em breve.</div>
      ) : null}
    </div>
  );
}

