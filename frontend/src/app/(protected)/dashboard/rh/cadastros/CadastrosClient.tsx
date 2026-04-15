'use client';

import { useState } from 'react';
import FuncionariosClient from '../funcionarios/FuncionariosClient';
import TerceirizadosClient from './TerceirizadosClient';

type Tab = 'FUNCIONARIOS' | 'TERCEIRIZADOS';

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function CadastrosClient() {
  const [tab, setTab] = useState<Tab>('FUNCIONARIOS');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pessoas (RH)</h1>
        <p className="text-sm text-slate-600">Cadastros principais para gestão de pessoas: funcionários e terceirizados.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex gap-2 border-b border-slate-200 px-4 pt-4">
          <button
            type="button"
            onClick={() => setTab('FUNCIONARIOS')}
            className={classNames(
              'rounded-t-lg px-4 py-2 text-sm font-medium',
              tab === 'FUNCIONARIOS' ? 'border border-b-white border-slate-200 bg-white text-blue-700' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Funcionários
          </button>
          <button
            type="button"
            onClick={() => setTab('TERCEIRIZADOS')}
            className={classNames(
              'rounded-t-lg px-4 py-2 text-sm font-medium',
              tab === 'TERCEIRIZADOS' ? 'border border-b-white border-slate-200 bg-white text-blue-700' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            Terceirizados
          </button>
        </div>

        <div className="p-4">
          {tab === 'FUNCIONARIOS' ? <FuncionariosClient /> : <TerceirizadosClient />}
        </div>
      </div>
    </div>
  );
}

