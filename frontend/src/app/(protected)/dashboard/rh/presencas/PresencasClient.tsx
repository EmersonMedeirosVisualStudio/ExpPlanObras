'use client';

import { useEffect, useMemo, useState } from 'react';
import { PresencasApi } from '@/lib/modules/presencas/api';
import type {
  PresencaCabecalhoDTO,
  PresencaDetalheDTO,
  PresencaItemDTO,
  PresencaProducaoItemDTO,
  SituacaoPresenca,
  TipoLocalPresenca,
} from '@/lib/modules/presencas/types';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioResumoDTO } from '@/lib/modules/funcionarios/types';

const SITUACOES: SituacaoPresenca[] = ['PRESENTE', 'FALTA', 'ATESTADO', 'FOLGA', 'FERIAS', 'AFASTADO'];

export default function PresencasClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [politica, setPolitica] = useState<{
    exigirAutorizacaoDispositivo: boolean;
    bloquearPorTreinamentoVencido: boolean;
    exigirGeolocalizacao: boolean;
    exigirFoto: boolean;
  } | null>(null);
  const [autorizacao, setAutorizacao] = useState<{ autorizado: boolean; termoVersao: string | null; aceitoEm: string | null } | null>(null);
  const [modalTermo, setModalTermo] = useState(false);
  const [termoAceito, setTermoAceito] = useState(false);

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

  const [producao, setProducao] = useState<PresencaProducaoItemDTO[]>([]);
  const [modalProducao, setModalProducao] = useState(false);
  const [producaoDraft, setProducaoDraft] = useState<Record<number, { quantidade: string; unidade: string; servicos: string }>>({});

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
      try {
        const p = await PresencasApi.obterProducao(id);
        setProducao(Array.isArray(p) ? p : []);
        const next: Record<number, { quantidade: string; unidade: string; servicos: string }> = {};
        for (const it of Array.isArray(p) ? p : []) {
          next[it.idPresencaItem] = {
            quantidade: String(it.quantidadeExecutada ?? 0),
            unidade: it.unidadeMedida || '',
            servicos: Array.isArray(it.servicos)
              ? it.servicos
                  .map((s: any) => {
                    if (typeof s === 'string') return s;
                    const codigo = String(s?.codigoServico ?? '').trim();
                    const codigoCentroCusto = s?.codigoCentroCusto ? String(s.codigoCentroCusto).trim().toUpperCase() : null;
                    const qtd = s?.quantidade == null ? null : Number(String(s.quantidade).replace(',', '.'));
                    if (!codigo) return '';
                    const prefixo = codigoCentroCusto ? `${codigo}:${codigoCentroCusto}` : codigo;
                    if (qtd == null || !Number.isFinite(qtd)) return codigo;
                    return `${prefixo}=${qtd}`;
                  })
                  .filter(Boolean)
                  .join(', ')
              : '',
          };
        }
        setProducaoDraft(next);
      } catch {
        setProducao([]);
        setProducaoDraft({});
      }
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

  function getDeviceUuid() {
    try {
      const k = 'rh.presencas.deviceUuid';
      const prev = localStorage.getItem(k);
      if (prev) return prev;
      const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? (crypto as any).randomUUID() : String(Date.now());
      localStorage.setItem(k, next);
      return next;
    } catch {
      return null;
    }
  }

  async function carregarPoliticaEAutorizacao() {
    try {
      const [p, a] = await Promise.all([PresencasApi.politica(), PresencasApi.autorizacao()]);
      setPolitica(p);
      setAutorizacao(a);
      if (p?.exigirAutorizacaoDispositivo && !a?.autorizado) setModalTermo(true);
    } catch {}
  }

  useEffect(() => {
    carregarPoliticaEAutorizacao();
    carregarLista();
    carregarFuncionarios();
  }, []);

  useEffect(() => {
    if (selectedId) carregarDetalhe(selectedId);
  }, [selectedId]);

  const selected = useMemo(() => fichas.find((x) => x.id === selectedId) || null, [fichas, selectedId]);
  const bloqueadoPorTermo = !!politica?.exigirAutorizacaoDispositivo && autorizacao?.autorizado === false;

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

  async function aceitarTermo() {
    try {
      setError(null);
      const termoVersao = 'v1';
      const deviceUuid = getDeviceUuid();
      const res = await PresencasApi.aceitarTermo({ termoVersao, deviceUuid, plataforma: 'WEB' });
      setAutorizacao({ autorizado: res.autorizado, termoVersao: res.termoVersao, aceitoEm: res.aceitoEm });
      setModalTermo(false);
      setTermoAceito(false);
    } catch (e: any) {
      setError(e?.message || 'Erro ao aceitar termo.');
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

  async function salvarProducao() {
    if (!selectedId) return;
    try {
      setError(null);
      function parseServicos(raw: string) {
        const out: Array<string | { codigoServico: string; codigoCentroCusto?: string | null; quantidade: number | null }> = [];
        const parts = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const p of parts) {
          const [left, right] = p.includes('=') ? p.split('=') : [p, null];
          const leftTrim = String(left || '').trim();
          if (!leftTrim) continue;
          const [codigoParte, ccParte] = leftTrim.includes(':') ? leftTrim.split(':') : [leftTrim, null];
          const codigoServico = String(codigoParte || '').trim().toUpperCase();
          if (!codigoServico) continue;
          const codigoCentroCusto = ccParte != null ? String(ccParte).trim().toUpperCase() : null;
          const q = right != null ? Number(String(right).trim().replace(',', '.')) : NaN;
          out.push({
            codigoServico,
            codigoCentroCusto: codigoCentroCusto || null,
            quantidade: Number.isFinite(q) ? q : null,
          });
        }
        return out.length ? out : null;
      }
      const itens = Object.entries(producaoDraft).map(([idPresencaItem, v]) => ({
        idPresencaItem: Number(idPresencaItem),
        quantidadeExecutada: Number(String(v.quantidade || '0').trim().replace(',', '.')),
        unidadeMedida: v.unidade ? v.unidade : null,
        servicos: v.servicos ? parseServicos(v.servicos) : null,
      }));
      await PresencasApi.salvarProducao(selectedId, { itens });
      setModalProducao(false);
      await carregarDetalhe(selectedId);
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar produção.');
    }
  }

  if (loading) return <div className="rounded-xl border bg-white p-6">Carregando presenças...</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl text-slate-900">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Presença digital</h1>
          <p className="text-sm text-slate-600">Fichas por obra/unidade, assinatura do funcionário e envio ao RH.</p>
        </div>
        <button
          onClick={() => setModalNova(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          type="button"
          disabled={bloqueadoPorTermo}
          title={bloqueadoPorTermo ? 'Aceite o termo de uso do dispositivo para registrar presença.' : ''}
        >
          Nova ficha
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {bloqueadoPorTermo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium">Dispositivo não autorizado</div>
            <div className="text-amber-800">Aceite o termo de uso para liberar o registro e envio de presença.</div>
          </div>
          <button type="button" className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white" onClick={() => setModalTermo(true)}>
            Autorizar dispositivo
          </button>
        </div>
      )}

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
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Fichas</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
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
            <h2 className="text-lg font-semibold text-slate-900">Detalhe</h2>
            {detail && (
              <div className="flex gap-2 flex-wrap">
                <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" type="button" onClick={() => setModalItem(true)} disabled={bloqueadoPorTermo}>
                  Adicionar/atualizar item
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" type="button" onClick={() => setModalProducao(true)} disabled={bloqueadoPorTermo}>
                  Produção
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" type="button" onClick={() => acaoFicha('FECHAR')} disabled={bloqueadoPorTermo}>
                  Fechar
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" type="button" onClick={() => acaoFicha('ENVIAR_RH')} disabled={bloqueadoPorTermo}>
                  Enviar RH
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" type="button" onClick={() => acaoFicha('RECEBER_RH')} disabled={bloqueadoPorTermo}>
                  Receber RH
                </button>
                <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" type="button" onClick={() => acaoFicha('REJEITAR_RH')} disabled={bloqueadoPorTermo}>
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
                  <thead className="bg-slate-50 text-left text-slate-700">
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

      {modalProducao && detail && (
        <Modal title="Produção diária" onClose={() => setModalProducao(false)}>
          <div className="text-sm text-slate-600">Informe quantidade executada e vincule serviços (opcional).</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Funcionário</th>
                  <th className="px-3 py-2">Quantidade</th>
                  <th className="px-3 py-2">Unidade</th>
                  <th className="px-3 py-2">Serviços (códigos)</th>
                </tr>
              </thead>
              <tbody>
                {producao.map((it) => (
                  <tr key={it.idPresencaItem} className="border-t">
                    <td className="px-3 py-2">{it.funcionarioNome}</td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-28"
                        value={producaoDraft[it.idPresencaItem]?.quantidade ?? '0'}
                        onChange={(e) =>
                          setProducaoDraft((prev) => ({
                            ...prev,
                            [it.idPresencaItem]: { quantidade: e.target.value, unidade: prev[it.idPresencaItem]?.unidade ?? '', servicos: prev[it.idPresencaItem]?.servicos ?? '' },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-24"
                        value={producaoDraft[it.idPresencaItem]?.unidade ?? ''}
                        onChange={(e) =>
                          setProducaoDraft((prev) => ({
                            ...prev,
                            [it.idPresencaItem]: { quantidade: prev[it.idPresencaItem]?.quantidade ?? '0', unidade: e.target.value, servicos: prev[it.idPresencaItem]?.servicos ?? '' },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-full"
                        placeholder="SER-0001, SER-0002"
                        value={producaoDraft[it.idPresencaItem]?.servicos ?? ''}
                        onChange={(e) =>
                          setProducaoDraft((prev) => ({
                            ...prev,
                            [it.idPresencaItem]: { quantidade: prev[it.idPresencaItem]?.quantidade ?? '0', unidade: prev[it.idPresencaItem]?.unidade ?? '', servicos: e.target.value },
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
                {producao.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Sem itens para lançar produção.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setModalProducao(false)}>
              Cancelar
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarProducao}>
              Salvar
            </button>
          </div>
        </Modal>
      )}

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

      {modalTermo && (
        <Modal title="Autorização de uso do dispositivo" onClose={() => setModalTermo(false)}>
          <div className="space-y-3 text-sm text-slate-700">
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="font-medium text-slate-900">Termo (v1)</div>
              <div className="mt-1 text-slate-700">
                Ao registrar presença, você confirma que está autorizado a usar este dispositivo para lançamentos de ponto e que as informações poderão ser auditadas
                (data/hora, IP e dispositivo).
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={termoAceito} onChange={(e) => setTermoAceito(e.target.checked)} />
              <span>Li e aceito o termo</span>
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setModalTermo(false)}>
                Fechar
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!termoAceito}
                onClick={aceitarTermo}
              >
                Aceitar e continuar
              </button>
            </div>
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
