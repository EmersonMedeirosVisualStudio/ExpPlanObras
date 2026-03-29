'use client';

import { useCallback, useEffect, useState } from 'react';
import { ContinuidadeApi } from '@/lib/modules/continuidade/api';
import type { ContinuidadePlanoDTO, ReadinessScoreDTO } from '@/lib/modules/continuidade/types';

function cx(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export default function ContinuidadeClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [planos, setPlanos] = useState<ContinuidadePlanoDTO[]>([]);
  const [selectedPlanoId, setSelectedPlanoId] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<ReadinessScoreDTO | null>(null);
  const [out, setOut] = useState<any>(null);

  const carregarPlanos = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await ContinuidadeApi.listarPlanos({ pagina: 1, limite: 50, ativo: true });
      setPlanos(rows);
      if (!selectedPlanoId && rows.length) setSelectedPlanoId(rows[0].id);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlanoId]);

  const calcularReadiness = useCallback(async () => {
    if (!selectedPlanoId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await ContinuidadeApi.obterReadinessPlano(selectedPlanoId);
      setReadiness(r);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao calcular readiness'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlanoId]);

  const criarExemplo = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const body = {
        codigo: `bcp_plano_${Date.now()}`,
        nome: 'Plano de Continuidade Exemplo',
        descricao: 'Cobre DR para banco e portal, inclui war room.',
        tipoPlano: 'BCP',
        modulo: 'CORE',
        criticidade: 'ALTA',
        rtoMinutos: 60,
        rpoMinutos: 15,
      };
      const res = await ContinuidadeApi.criarPlano(body);
      setOut(res);
      await carregarPlanos();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao criar'));
    } finally {
      setLoading(false);
    }
  }, [carregarPlanos]);

  useEffect(() => {
    carregarPlanos();
  }, [carregarPlanos]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Continuidade de Negócio e DR</h1>
          <p className="text-gray-600 mt-1">Planos, runbooks, testes e crises.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={criarExemplo} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Criar plano exemplo
          </button>
          <button type="button" onClick={carregarPlanos} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
          <button type="button" onClick={calcularReadiness} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading || !selectedPlanoId}>
            Readiness
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {out ? <pre className="rounded-lg border bg-white p-3 text-xs">{JSON.stringify(out, null, 2)}</pre> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Planos</div>
          <div className="max-h-[520px] overflow-auto">
            {planos.length ? (
              <ul className="divide-y">
                {planos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPlanoId(p.id)}
                      className={cx('w-full text-left px-4 py-3 hover:bg-gray-50', selectedPlanoId === p.id ? 'bg-blue-50' : '')}
                    >
                      <div className="text-sm font-medium text-gray-900">{p.nome}</div>
                      <div className="text-xs text-gray-600">
                        {p.tipoPlano} · Criticidade {p.criticidade} · RTO {p.rtoMinutos}m · RPO {p.rpoMinutos}m
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-3 text-sm text-gray-500">{loading ? 'Carregando...' : 'Sem planos.'}</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-700">Readiness</div>
          {readiness ? (
            <div className="space-y-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Score</div>
                <div className="text-lg text-gray-900">{readiness.score} ({readiness.class})</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-gray-500">Componentes</div>
                <pre className="text-xs text-gray-700 overflow-auto">{JSON.stringify(readiness.componentes, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Selecione um plano e clique em Readiness.</div>
          )}
        </div>
      </div>
    </div>
  );
}
