'use client';

import { useEffect, useMemo, useState } from 'react';
import { PresencasApi } from '@/lib/modules/presencas/api';
import type { PresencaCabecalhoDTO, PresencaDetalheDTO, PresencaItemDTO, SituacaoPresenca, TipoLocalPresenca } from '@/lib/modules/presencas/types';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioResumoDTO } from '@/lib/modules/funcionarios/types';

const SITUACOES: SituacaoPresenca[] = ['PRESENTE', 'FALTA', 'ATESTADO', 'FOLGA', 'FERIAS', 'AFASTADO'];

export default function PresencasClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fichas, setFichas] = useState<PresencaCabecalhoDTO[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PresencaDetalheDTO | null>(null);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterData, setFilterData] = useState('');

  const [modalNova, setModalNova] = useState(false);
  const [nova, setNova] = useState({ tipoLocal: 'OBRA' as TipoLocalPresenca, idObra: '', idUnidade: '', dataReferencia: new Date().toISOString().slice(0, 10), turno: 'NORMAL' });

  const [funcionarios, setFuncionarios] = useState<FuncionarioResumoDTO[]>([]);
  const [modalItem, setModalItem] = useState(false);
  const [itemForm, setItemForm] = useState({ idFuncionario: '', situacaoPresenca: 'PRESENTE', horaEntrada: '', horaSaida: '', minutosAtraso: '0', minutosHoraExtra: '0', descricaoTarefaDia: '' });
  const [itemError, setItemError] = useState('');

  async function carregarLista() {
    try {
      setLoading(true);
      setError(null);
      const rows = await PresencasApi.listar({ status: filterStatus as any, data: filterData });
      setFichas(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar presenças.');
    } finally {
      setLoading(false);
    }
  }

  async function carregarDetalhe(id: number) {
    try {
      setError(null);
      const d = await PresencasApi.obter(id);
      setDetail(d);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar ficha.');
    }
  }

  async function carregarFuncionarios() {
    try {
      const rows = await FuncionariosApi.listar('');
      setFuncionarios(Array.isArray(rows) ? rows : []);
    } catch {}
  }

  useEffect(() => {
    carregarLista();
    carregarFuncionarios();
  }, []);

  useEffect(() => {
    if (selectedId) carregarDetalhe(selectedId);
  }, [selectedId]);

  const selected = useMemo(() => fichas.find((x) => x.id === selectedId) || null, [fichas, selectedId]);

  async function criarFicha() {
    try {
      setError(null);
      const payload = {
        tipoLocal: nova.tipoLocal,
        idObra: nova.tipoLocal === 'OBRA' ? Number(nova.idObra) : null,
        idUnidade: nova.tipoLocal === 'UNIDADE' ? Number(nova.idUnidade) : null,
        dataReferencia: nova.dataReferencia,
        turno: nova.turno,
      };
      const res = await PresencasApi.criar(payload);
      setModalNova(false);
      await carregarLista();
      setSelectedId(res.id);
    } catch (e: any) {
      setError(e?.message || 'Erro ao criar ficha.');
    }
  }

  async function salvarItem() {
    if (!selectedId) return;
    setItemError('');
    const idFuncionario = Number(itemForm.idFuncionario);
    if (!Number.isFinite(idFuncionario)) return setItemError('Selecione o funcionário.');

    try {
      setError(null);
      await PresencasApi.upsertItem(selectedId, {
        idFuncionario,
        situacaoPresenca: itemForm.situacaoPresenca,
        horaEntrada: itemForm.horaEntrada || null,
        horaSaida: itemForm.horaSaida || null,
        minutosAtraso: Number(itemForm.minutosAtraso || 0),
        minutosHoraExtra: Number(itemForm.minutosHoraExtra || 0),
        descricaoTarefaDia: itemForm.descricaoTarefaDia || null,
      } as any);
      setModalItem(false);
      setItemForm({ idFuncionario: '', situacaoPresenca: 'PRESENTE', horaEntrada: '', horaSaida: '', minutosAtraso: '0', minutosHoraExtra: '0', descricaoTarefaDia: '' });
      await carregarDetalhe(selectedId);
    } catch (e: any) {
      setItemError(e?.message || 'Erro ao salvar item.');
    }
  }

  async function assinar(item: PresencaItemDTO) {
    try {
      setError(null);
      await PresencasApi.assinarItem(item.id, { idFuncionarioSignatario: item.idFuncionario, tipoAssinatura: 'ASSINATURA_TELA', metadataJson: { confirmacao: true } });
      if (selectedId) await carregarDetalhe(selectedId);
    } catch (e: any) {
      setError(e?.message || 'Erro ao assinar.');
    }
  }

  async function acaoFicha(acao: 'FECHAR' | 'ENVIAR_RH' | 'RECEBER_RH' | 'REJEITAR_RH') {
    if (!selectedId) return;
    try {
      setError(null);
      if (acao === 'REJEITAR_RH') {
        const motivo = prompt('Motivo da rejeição?') || '';
        if (!motivo.trim()) return;
        await PresencasApi.acao(selectedId, { acao, motivo });
      } else {
        await PresencasApi.acao(selectedId, { acao });
      }
      await carregarLista();
      await carregarDetalhe(selectedId);
    } catch (e: any) {
      setError(e?.message || 'Erro ao executar ação.');
    }
  }

  if (loading) return <div className="rounded-xl border bg-white p-6">Carregando presenças...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Presença digital</h1>
          <p className="text-sm text-slate-600">Fichas por obra/unidade, assinatura do funcionário e envio ao RH.</p>
        </div>
        <button onClick={() => setModalNova(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button">
          Nova ficha
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <input className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} placeholder="Ex.: ENVIADA_RH" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Data</div>
            <input className="input" type="date" value={filterData} onChange={(e) => setFilterData(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregarLista}>
              Filtrar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <h2 className="mb-3 text-lg font-semibold">Fichas</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Local</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {fichas.map((f) => (
                  <tr
                    key={f.id}
                    className={`border-t cursor-pointer ${selectedId === f.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    onClick={() => setSelectedId(f.id)}
                  >
                    <td className="px-3 py-2">{f.dataReferencia}</td>
                    <td className="px-3 py-2">
                      {f.tipoLocal} {f.idObra || f.idUnidade || ''}
                    </td>
                    <td className="px-3 py-2">{f.statusPresenca}</td>
                  </tr>
                ))}
                {fichas.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                      Nenhuma ficha.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Detalhe</h2>
            {detail && (
              <div className="flex gap-2 flex-wrap">
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={() => setModalItem(true)}>
                  Adicionar/atualizar item
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={() => acaoFicha('FECHAR')}>
                  Fechar
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={() => acaoFicha('ENVIAR_RH')}>
                  Enviar RH
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={() => acaoFicha('RECEBER_RH')}>
                  Receber RH
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs" type="button" onClick={() => acaoFicha('REJEITAR_RH')}>
                  Rejeitar RH
                </button>
              </div>
            )}
          </div>

          {!selected || !detail ? (
            <div className="text-sm text-slate-500">Selecione uma ficha.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <div>
                  <span className="text-slate-500">Status:</span> {detail.statusPresenca}
                </div>
                {detail.motivoRejeicaoRh ? (
                  <div className="mt-1 text-red-700">Motivo rejeição RH: {detail.motivoRejeicaoRh}</div>
                ) : null}
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Funcionário</th>
                      <th className="px-3 py-2">Situação</th>
                      <th className="px-3 py-2">Entrada</th>
                      <th className="px-3 py-2">Saída</th>
                      <th className="px-3 py-2">Assinatura</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.itens.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2">{i.funcionarioNome}</td>
                        <td className="px-3 py-2">{i.situacaoPresenca}</td>
                        <td className="px-3 py-2">{i.horaEntrada || '-'}</td>
                        <td className="px-3 py-2">{i.horaSaida || '-'}</td>
                        <td className="px-3 py-2">{i.assinadoFuncionario ? 'Assinado' : i.requerAssinaturaFuncionario ? 'Pendente' : 'Dispensada'}</td>
                        <td className="px-3 py-2 text-right">
                          <button className="rounded-lg border px-3 py-1 text-xs" type="button" onClick={() => assinar(i)} disabled={i.assinadoFuncionario}>
                            Assinar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {detail.itens.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                          Nenhum item.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {modalNova && (
        <Modal title="Nova ficha" onClose={() => setModalNova(false)}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-sm text-slate-600">Tipo local</div>
              <select className="input" value={nova.tipoLocal} onChange={(e) => setNova((p) => ({ ...p, tipoLocal: e.target.value as any }))}>
                <option value="OBRA">OBRA</option>
                <option value="UNIDADE">UNIDADE</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Data</div>
              <input className="input" type="date" value={nova.dataReferencia} onChange={(e) => setNova((p) => ({ ...p, dataReferencia: e.target.value }))} />
            </div>
            {nova.tipoLocal === 'OBRA' ? (
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">ID Obra</div>
                <input className="input" value={nova.idObra} onChange={(e) => setNova((p) => ({ ...p, idObra: e.target.value }))} />
              </div>
            ) : (
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">ID Unidade</div>
                <input className="input" value={nova.idUnidade} onChange={(e) => setNova((p) => ({ ...p, idUnidade: e.target.value }))} />
              </div>
            )}
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Turno</div>
              <input className="input" value={nova.turno} onChange={(e) => setNova((p) => ({ ...p, turno: e.target.value }))} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setModalNova(false)}>
              Cancelar
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={criarFicha}>
              Criar
            </button>
          </div>
        </Modal>
      )}

      {modalItem && (
        <Modal title="Adicionar/atualizar item" onClose={() => setModalItem(false)}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Funcionário</div>
              <select className="input" value={itemForm.idFuncionario} onChange={(e) => setItemForm((p) => ({ ...p, idFuncionario: e.target.value }))}>
                <option value="">Selecione</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nomeCompleto} — {f.matricula}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Situação</div>
              <select className="input" value={itemForm.situacaoPresenca} onChange={(e) => setItemForm((p) => ({ ...p, situacaoPresenca: e.target.value }))}>
                {SITUACOES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Atraso (min)</div>
              <input className="input" type="number" value={itemForm.minutosAtraso} onChange={(e) => setItemForm((p) => ({ ...p, minutosAtraso: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Entrada</div>
              <input className="input" type="time" value={itemForm.horaEntrada} onChange={(e) => setItemForm((p) => ({ ...p, horaEntrada: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-slate-600">Saída</div>
              <input className="input" type="time" value={itemForm.horaSaida} onChange={(e) => setItemForm((p) => ({ ...p, horaSaida: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Hora extra (min)</div>
              <input className="input" type="number" value={itemForm.minutosHoraExtra} onChange={(e) => setItemForm((p) => ({ ...p, minutosHoraExtra: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Tarefa do dia</div>
              <input className="input" value={itemForm.descricaoTarefaDia} onChange={(e) => setItemForm((p) => ({ ...p, descricaoTarefaDia: e.target.value }))} />
            </div>
          </div>
          {itemError && <div className="mt-3 text-sm text-red-700">{itemError}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setModalItem(false)}>
              Cancelar
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarItem}>
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} type="button">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
