'use client';

import { useEffect, useState } from 'react';
import { GrcApi } from '@/lib/modules/grc/api';

export default function GrcClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kpis, setKpis] = useState<{ riscosCriticos: number; achadosAbertos: number; planosAtrasados: number }>({ riscosCriticos: 0, achadosAbertos: 0, planosAtrasados: 0 });

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [riscos, achados, planos] = await Promise.all([GrcApi.listarRiscos({ limite: 100, pagina: 1 }), GrcApi.listarAchados({ limite: 100, pagina: 1 }), GrcApi.listarPlanosAcao({ limite: 100, pagina: 1 })]);
        const riscosCriticos = riscos.filter((r: any) => Number(r.scoreResidual ?? r.scoreInerente) >= 17 && String(r.statusRisco).toUpperCase() !== 'ENCERRADO').length;
        const achadosAbertos = achados.filter((a: any) => String(a.statusAchado).toUpperCase() !== 'ENCERRADO').length;
        const now = Date.now();
        const planosAtrasados = planos.filter((p: any) => p.dataLimite && new Date(String(p.dataLimite)).getTime() < now && String(p.statusPlano).toUpperCase() !== 'CONCLUIDO').length;
        setKpis({ riscosCriticos, achadosAbertos, planosAtrasados });
      } catch (e: any) {
        setErr(String(e?.message || 'Erro ao carregar'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">GRC</h1>
        <p className="text-gray-600 mt-1">Riscos, Controles, Auditorias, Achados e Planos de Ação conectados ao restante do sistema.</p>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white shadow-sm p-4">
          <div className="text-xs text-gray-500">Riscos críticos abertos</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{loading ? '...' : kpis.riscosCriticos}</div>
        </div>
        <div className="rounded-xl border bg-white shadow-sm p-4">
          <div className="text-xs text-gray-500">Achados abertos</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{loading ? '...' : kpis.achadosAbertos}</div>
        </div>
        <div className="rounded-xl border bg-white shadow-sm p-4">
          <div className="text-xs text-gray-500">Planos de ação atrasados</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">{loading ? '...' : kpis.planosAtrasados}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm p-4 text-sm text-gray-700">
        Use o menu lateral para acessar Riscos, Controles, Auditorias e Planos de Ação.
      </div>
    </div>
  );
}
