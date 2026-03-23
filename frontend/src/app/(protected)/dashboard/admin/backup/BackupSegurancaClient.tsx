'use client';

import { useEffect, useMemo, useState } from 'react';
import { BackupApi } from '@/lib/modules/backup/api';
import type { DiaSemana, ExecucaoBackupDTO, PoliticaBackupDTO, SolicitacaoRestauracaoDTO } from '@/lib/modules/backup/types';

const POLITICA_DEFAULT: PoliticaBackupDTO = {
  periodicidade: 'DIARIO',
  horaExecucao: '00:00',
  diaSemana: null,
  retencaoDias: 30,
  ativo: true,
};

const DIAS: DiaSemana[] = ['DOMINGO', 'SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO'];

export default function BackupSegurancaClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [politica, setPolitica] = useState<PoliticaBackupDTO>(POLITICA_DEFAULT);
  const [execucoes, setExecucoes] = useState<ExecucaoBackupDTO[]>([]);
  const [restauracoes, setRestauracoes] = useState<SolicitacaoRestauracaoDTO[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [pontoReferencia, setPontoReferencia] = useState('');
  const [motivo, setMotivo] = useState('');

  async function carregarTudo() {
    try {
      setError(null);
      setLoading(true);
      const [politicaResp, execucoesResp, restauracoesResp] = await Promise.all([
        BackupApi.obterPolitica(),
        BackupApi.listarExecucoes(),
        BackupApi.listarRestauracoes(),
      ]);

      setPolitica(politicaResp ?? POLITICA_DEFAULT);
      setExecucoes(execucoesResp);
      setRestauracoes(restauracoesResp);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar backup');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  useEffect(() => {
    const temExecutando = execucoes.some((e) => e.status === 'EXECUTANDO');
    if (!temExecutando) return;

    const t = setInterval(() => {
      carregarTudo();
    }, 5000);

    return () => clearInterval(t);
  }, [execucoes]);

  async function salvarPolitica() {
    try {
      setSaving(true);
      setError(null);

      if (politica.periodicidade === 'SEMANAL' && !politica.diaSemana) {
        throw new Error('Informe o dia da semana para backup semanal.');
      }

      await BackupApi.salvarPolitica(politica);
      await carregarTudo();
      alert('Política de backup salva com sucesso.');
    } catch (e: any) {
      setError(e.message || 'Erro ao salvar política');
    } finally {
      setSaving(false);
    }
  }

  async function executarBackupAgora() {
    try {
      setRunning(true);
      setError(null);
      await BackupApi.executarAgora();
      await carregarTudo();
      alert('Backup manual iniciado.');
    } catch (e: any) {
      setError(e.message || 'Erro ao executar backup');
    } finally {
      setRunning(false);
    }
  }

  async function solicitarRestauracao() {
    try {
      if (!pontoReferencia) throw new Error('Selecione um ponto de restauração.');
      if (!motivo.trim()) throw new Error('Informe o motivo da restauração.');

      await BackupApi.solicitarRestauracao({
        pontoReferencia,
        motivo,
      });

      setModalOpen(false);
      setPontoReferencia('');
      setMotivo('');
      await carregarTudo();
      alert('Solicitação de restauração registrada.');
    } catch (e: any) {
      setError(e.message || 'Erro ao solicitar restauração');
    }
  }

  const ultimoSucesso = useMemo(() => execucoes.find((e) => e.status === 'SUCESSO') || null, [execucoes]);

  const falhasRecentes = useMemo(() => execucoes.filter((e) => e.status === 'ERRO').length, [execucoes]);

  if (loading) return <div className="p-6">Carregando backup e segurança...</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Backup e Segurança</h1>
          <p className="text-sm text-slate-600">Configuração do backup lógico da empresa e histórico de execuções.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={executarBackupAgora}
            disabled={running}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            type="button"
          >
            {running ? 'Executando...' : 'Executar backup agora'}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          >
            Solicitar restauração
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <ResumoCard titulo="Último sucesso" valor={ultimoSucesso ? formatarDataHora(ultimoSucesso.dataHoraInicio) : 'Nenhum'} />
        <ResumoCard titulo="Falhas recentes" valor={String(falhasRecentes)} />
        <ResumoCard titulo="Retenção" valor={`${politica.retencaoDias} dias`} />
        <ResumoCard titulo="Política ativa" valor={politica.ativo ? 'Ativa' : 'Inativa'} />
      </div>

      <Card titulo="Política de Backup">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Campo label="Periodicidade">
            <select
              className="input"
              value={politica.periodicidade}
              onChange={(e) =>
                setPolitica((old) => ({
                  ...old,
                  periodicidade: e.target.value as 'DIARIO' | 'SEMANAL',
                  diaSemana: e.target.value === 'DIARIO' ? null : old.diaSemana,
                }))
              }
            >
              <option value="DIARIO">Diário</option>
              <option value="SEMANAL">Semanal</option>
            </select>
          </Campo>

          <Campo label="Hora de execução">
            <input
              className="input"
              type="time"
              value={politica.horaExecucao}
              onChange={(e) => setPolitica((old) => ({ ...old, horaExecucao: e.target.value }))}
            />
          </Campo>

          {politica.periodicidade === 'SEMANAL' && (
            <Campo label="Dia da semana">
              <select
                className="input"
                value={politica.diaSemana ?? ''}
                onChange={(e) => setPolitica((old) => ({ ...old, diaSemana: (e.target.value || null) as DiaSemana | null }))}
              >
                <option value="">Selecione</option>
                {DIAS.map((dia) => (
                  <option key={dia} value={dia}>
                    {dia}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <Campo label="Retenção (dias)">
            <input
              className="input"
              type="number"
              min={7}
              value={politica.retencaoDias}
              onChange={(e) => setPolitica((old) => ({ ...old, retencaoDias: Number(e.target.value || 7) }))}
            />
          </Campo>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={politica.ativo} onChange={(e) => setPolitica((old) => ({ ...old, ativo: e.target.checked }))} />
            Política ativa
          </label>

          <button
            onClick={salvarPolitica}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            type="button"
          >
            {saving ? 'Salvando...' : 'Salvar política'}
          </button>
        </div>
      </Card>

      <Card titulo="Execuções de Backup">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Início</th>
                <th className="px-3 py-2">Fim</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Arquivo</th>
                <th className="px-3 py-2">Hash</th>
                <th className="px-3 py-2">Tamanho</th>
                <th className="px-3 py-2">Obs.</th>
              </tr>
            </thead>
            <tbody>
              {execucoes.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{formatarDataHora(item.dataHoraInicio)}</td>
                  <td className="px-3 py-2">{formatarDataHora(item.dataHoraFim)}</td>
                  <td className="px-3 py-2">
                    <Badge status={item.status} />
                  </td>
                  <td className="px-3 py-2">{item.referenciaArquivo || '-'}</td>
                  <td className="px-3 py-2">{item.hashArquivo || '-'}</td>
                  <td className="px-3 py-2">{item.tamanhoMb != null ? `${item.tamanhoMb} MB` : '-'}</td>
                  <td className="px-3 py-2">{item.observacao || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card titulo="Solicitações de Restauração">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Solicitado em</th>
                <th className="px-3 py-2">Ponto</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {restauracoes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Nenhuma solicitação registrada.
                  </td>
                </tr>
              ) : (
                restauracoes.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{formatarDataHora(item.solicitadoEm)}</td>
                    <td className="px-3 py-2">{item.pontoReferencia}</td>
                    <td className="px-3 py-2">{item.motivo}</td>
                    <td className="px-3 py-2">
                      <Badge status={item.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modalOpen && (
        <Modal titulo="Solicitar restauração" onClose={() => setModalOpen(false)}>
          <div className="space-y-4">
            <Campo label="Ponto de restauração">
              <select className="input" value={pontoReferencia} onChange={(e) => setPontoReferencia(e.target.value)}>
                <option value="">Selecione</option>
                {execucoes
                  .filter((e) => e.status === 'SUCESSO' && e.referenciaArquivo)
                  .map((e) => (
                    <option key={e.id} value={e.referenciaArquivo!}>
                      {e.referenciaArquivo} - {formatarDataHora(e.dataHoraInicio)}
                    </option>
                  ))}
              </select>
            </Campo>

            <Campo label="Motivo">
              <textarea className="input min-h-[120px]" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>

            <div className="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm" type="button">
                Cancelar
              </button>
              <button onClick={solicitarRestauracao} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button">
                Enviar solicitação
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return '-';
  return new Date(valor).toLocaleString('pt-BR');
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function ResumoCard({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{titulo}</div>
      <div className="mt-1 text-xl font-semibold">{valor}</div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const classes =
    status === 'SUCESSO' || status === 'CONCLUIDA' || status === 'APROVADA'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'ERRO' || status === 'REJEITADA' || status === 'CANCELADO'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700';

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{status}</span>;
}

function Modal({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{titulo}</h3>
          <button onClick={onClose} className="text-slate-500" type="button">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
