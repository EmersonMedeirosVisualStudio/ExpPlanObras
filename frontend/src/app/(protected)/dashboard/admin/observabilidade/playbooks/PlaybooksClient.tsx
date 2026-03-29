'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlaybooksApi } from '@/lib/modules/playbooks/api';
import type { PlaybookDTO, PlaybookExecutionDTO } from '@/lib/modules/playbooks/types';

function cx(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

export default function PlaybooksClient() {
  const [tab, setTab] = useState<'MODELOS' | 'EXECUCOES' | 'APROVACOES'>('MODELOS');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookDTO[]>([]);
  const [output, setOutput] = useState<any>(null);
  const [execucoes, setExecucoes] = useState<PlaybookExecutionDTO[]>([]);

  const carregarPlaybooks = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await PlaybooksApi.listarPlaybooks({ pagina: 1, limite: 50 });
      setPlaybooks(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar'));
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarExecucoes = useCallback(async (status?: string) => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await PlaybooksApi.listarExecucoes({ pagina: 1, limite: 50, status: status || null });
      setExecucoes(rows);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao carregar execuções'));
    } finally {
      setLoading(false);
    }
  }, []);

  const criarExemplo = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const body = {
        codigo: `pbk_bruteforce_${Date.now()}`,
        nome: 'Brute force / credencial comprometida (exemplo)',
        descricao: 'Fluxo seguro: abre incidente, invalida tokens, exige reauth. Bloqueio exige aprovação.',
        categoria: 'SECURITY',
        modoExecucao: 'SEMI_AUTOMATICO',
        gatilhoTipo: 'MANUAL',
        riscoPadrao: 'MEDIO',
        politicaAprovacao: 'EXIGE_SE_RISCO_ALTO',
        ativo: true,
        ordemPrioridade: 100,
        passos: [
          { ordemExecucao: 1, tipoAcao: 'ABRIR_INCIDENTE', nomePasso: 'Abrir incidente', riscoAcao: 'BAIXO', continuaEmErro: false, reversivel: false, configuracaoJson: { tipoIncidente: 'SEGURANCA', titulo: 'Suspeita de brute force', criticidade: 'ALTA' } },
          { ordemExecucao: 2, tipoAcao: 'USUARIO_EXIGIR_REAUTENTICACAO', nomePasso: 'Exigir reautenticação do usuário', riscoAcao: 'MEDIO', continuaEmErro: true, reversivel: true, configuracaoJson: { targetUserId: 0 } },
          { ordemExecucao: 3, tipoAcao: 'USUARIO_BLOQUEAR_TEMPORARIAMENTE', nomePasso: 'Bloquear usuário (temporário)', riscoAcao: 'ALTO', continuaEmErro: true, reversivel: true, configuracaoJson: { targetUserId: 0, duracaoMinutos: 60 } },
        ],
      };
      await PlaybooksApi.criarPlaybook(body);
      await carregarPlaybooks();
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao criar'));
    } finally {
      setLoading(false);
    }
  }, [carregarPlaybooks]);

  const simular = useCallback(async (id: number) => {
    setLoading(true);
    setErr(null);
    setOutput(null);
    try {
      const res = await PlaybooksApi.simularPlaybook(id);
      setOutput(res);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao simular'));
    } finally {
      setLoading(false);
    }
  }, []);

  const executar = useCallback(async (id: number) => {
    setLoading(true);
    setErr(null);
    setOutput(null);
    try {
      const res = await PlaybooksApi.executarPlaybook(id, {});
      setOutput(res);
      await Promise.all([carregarPlaybooks(), carregarExecucoes()]);
    } catch (e: any) {
      setErr(String(e?.message || 'Erro ao executar'));
    } finally {
      setLoading(false);
    }
  }, [carregarPlaybooks, carregarExecucoes]);

  const aprovar = useCallback(
    async (id: number) => {
      setLoading(true);
      setErr(null);
      setOutput(null);
      try {
        const res = await PlaybooksApi.aprovarExecucao(id);
        setOutput(res);
        await carregarExecucoes(tab === 'APROVACOES' ? 'PENDENTE_APROVACAO' : undefined);
      } catch (e: any) {
        setErr(String(e?.message || 'Erro ao aprovar'));
      } finally {
        setLoading(false);
      }
    },
    [carregarExecucoes, tab]
  );

  const cancelar = useCallback(
    async (id: number) => {
      setLoading(true);
      setErr(null);
      setOutput(null);
      try {
        const res = await PlaybooksApi.cancelarExecucao(id, { motivo: 'CANCELADO_MANUAL' });
        setOutput(res);
        await carregarExecucoes(tab === 'APROVACOES' ? 'PENDENTE_APROVACAO' : undefined);
      } catch (e: any) {
        setErr(String(e?.message || 'Erro ao cancelar'));
      } finally {
        setLoading(false);
      }
    },
    [carregarExecucoes, tab]
  );

  useEffect(() => {
    carregarPlaybooks();
  }, [carregarPlaybooks]);

  useEffect(() => {
    if (tab === 'EXECUCOES') carregarExecucoes();
    if (tab === 'APROVACOES') carregarExecucoes('PENDENTE_APROVACAO');
  }, [tab, carregarExecucoes]);

  return (
    <div className="max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Playbooks</h1>
          <p className="text-gray-600 mt-1">SOAR leve com guardrails e aprovação.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={criarExemplo} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Criar exemplo
          </button>
          <button type="button" onClick={carregarPlaybooks} className="rounded-lg border bg-white px-4 py-2 text-sm" disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {output ? <pre className="rounded-lg border bg-white p-3 text-xs overflow-auto max-h-[240px]">{JSON.stringify(output, null, 2)}</pre> : null}

      <div className="border-b">
        <nav className="flex gap-6">
          {([
            { key: 'MODELOS', label: 'Modelos' },
            { key: 'EXECUCOES', label: 'Execuções' },
            { key: 'APROVACOES', label: 'Aprovações pendentes' },
          ] as Array<{ key: 'MODELOS' | 'EXECUCOES' | 'APROVACOES'; label: string }>).map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cx('py-3 text-sm', tab === t.key ? 'border-b-2 border-blue-600 text-blue-700 font-medium' : 'text-gray-600')}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'MODELOS' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">Modelos</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Modo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Gatilho</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Risco</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Aprovação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Ativo</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {playbooks.length ? (
                  playbooks.map((p) => (
                    <tr key={p.id} className={cx('hover:bg-gray-50')}>
                      <td className="px-4 py-3 text-sm text-gray-900">{p.codigo}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.modoExecucao}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.gatilhoTipo}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.riscoPadrao}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.politicaAprovacao}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{p.ativo ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => simular(p.id)} disabled={loading}>
                            Simular
                          </button>
                          <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => executar(p.id)} disabled={loading}>
                            Executar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={8}>
                      {loading ? 'Carregando...' : 'Sem playbooks.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 'EXECUCOES' || tab === 'APROVACOES' ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">{tab === 'APROVACOES' ? 'Aprovações pendentes' : 'Execuções'}</div>
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Playbook</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Aprovação</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Incidente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Atualizado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {execucoes.length ? (
                  execucoes.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{e.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.playbookId}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.statusExecucao}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.aprovacaoExigida ? 'Sim' : 'Não'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.incidenteId || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{e.updatedAt}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {e.statusExecucao === 'PENDENTE_APROVACAO' ? (
                            <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => aprovar(e.id)} disabled={loading}>
                              Aprovar
                            </button>
                          ) : null}
                          {e.statusExecucao !== 'CANCELADA' && e.statusExecucao !== 'CONCLUIDA' ? (
                            <button type="button" className="rounded-lg border px-3 py-1 text-sm" onClick={() => cancelar(e.id)} disabled={loading}>
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-500" colSpan={7}>
                      {loading ? 'Carregando...' : 'Sem execuções.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

