'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioDetalheDTO, FuncionarioEventoDTO, FuncionarioHistoricoEventoDTO, FuncionarioResumoDTO } from '@/lib/modules/funcionarios/types';
import { DocumentosApi } from '@/lib/modules/documentos/api';
import type { DocumentoRegistroDTO } from '@/lib/modules/documentos/types';
import { TerceirizadosApi } from '@/lib/modules/terceirizados/api';
import api from '@/lib/api';

const vazio = {
  tipoCadastro: 'FUNCIONARIO' as 'FUNCIONARIO' | 'TERCEIRIZADO',
  matricula: '',
  nomeCompleto: '',
  cpf: '',
  telefoneWhatsapp: '',
  dataNascimento: '',
  rg: '',
  titulo: '',
  nomeMae: '',
  nomePai: '',
  cargoContratual: '',
  funcaoPrincipal: '',
  tipoVinculo: 'CLT',
  dataAdmissao: '',
  statusFuncional: 'ATIVO',
  ativo: true,
  idContraparteEmpresa: null as number | null,
  empresaNome: '',
};

function formatFuncionarioRef(id: number | string, nome: string) {
  return `#${id} - ${nome}`;
}

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function formatCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return '';
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

function formatCnpjCpf(value: string | null) {
  const d = onlyDigits(value || '');
  if (!d) return null;
  if (d.length === 11) return formatCpf(d);
  if (d.length !== 14) return value;
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  return `${p1}.${p2}.${p3}/${p4}-${p5}`;
}

function formatPhoneBr(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

const CARGOS_CONSTRUCAO_CIVIL = [
  'Servente',
  'Pedreiro',
  'Pedreiro de Acabamento',
  'Carpinteiro',
  'Armador',
  'Eletricista',
  'Eletricista Industrial',
  'Encanador',
  'Pintor',
  'Gesseiro',
  'Azulejista',
  'Serralheiro',
  'Soldador',
  'Topógrafo',
  'Auxiliar de Topografia',
  'Mestre de Obras',
  'Encarregado',
  'Engenheiro Civil',
  'Engenheiro de Segurança',
  'Técnico em Edificações',
  'Técnico de Segurança do Trabalho',
  'Apontador',
  'Almoxarife',
  'Operador de Máquinas',
  'Operador de Betoneira',
  'Operador de Retroescavadeira',
  'Operador de Escavadeira',
  'Motorista',
  'Vigia',
  'Auxiliar Administrativo',
  'Comprador',
] as const;

export default function FuncionariosClient() {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<FuncionarioResumoDTO[]>([]);
  const [selecionado, setSelecionado] = useState<FuncionarioDetalheDTO | null>(null);
  const [historico, setHistorico] = useState<FuncionarioHistoricoEventoDTO[]>([]);
  const [eventos, setEventos] = useState<FuncionarioEventoDTO[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoRegistroDTO[]>([]);
  const [modalDocOpen, setModalDocOpen] = useState(false);
  const [docSaving, setDocSaving] = useState(false);
  const [docForm, setDocForm] = useState<{ categoria: string; titulo: string; descricao: string; arquivo: File | null }>({
    categoria: 'RH_FUNCIONARIO',
    titulo: '',
    descricao: '',
    arquivo: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [form, setForm] = useState<any>(vazio);
  const [empresasSugestoes, setEmpresasSugestoes] = useState<Array<{ id: number; nome: string; documento: string | null }>>([]);
  const [empresasSugestoesOpen, setEmpresasSugestoesOpen] = useState(false);
  const [empresasSugestoesLoading, setEmpresasSugestoesLoading] = useState(false);
  const [cargoSugestoesOpen, setCargoSugestoesOpen] = useState(false);
  const [cargoOutroOpen, setCargoOutroOpen] = useState(false);
  const [cargoOutroNome, setCargoOutroNome] = useState('');
  const [cargosExtras, setCargosExtras] = useState<string[]>([]);
  const cargosDisponiveis = useMemo(() => [...CARGOS_CONSTRUCAO_CIVIL, ...cargosExtras], [cargosExtras]);

  useEffect(() => {
    if (!modalNovo) return;
    const q = String(form.empresaNome || '').trim();
    const qKey = q.length >= 2 ? q : '';
    if (!qKey && empresasSugestoes.length) return;

    let cancelled = false;
    setEmpresasSugestoesLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (qKey) params.set('q', qKey);
        params.set('status', 'ATIVO');
        const res = await api.get(`/api/v1/engenharia/contrapartes?${params.toString()}`);
        const payload = res.data;
        const rows = payload && typeof payload === 'object' && 'data' in payload ? (payload as any).data : payload;
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setEmpresasSugestoes(
          list
            .map((r: any) => ({ id: Number(r.idContraparte), nome: String(r.nomeRazao || ''), documento: r.documento ? String(r.documento) : null }))
            .filter((r: any) => Number.isFinite(r.id) && r.id > 0 && r.nome)
        );
      } catch {
        if (cancelled) return;
        setEmpresasSugestoes([]);
      } finally {
        if (cancelled) return;
        setEmpresasSugestoesLoading(false);
      }
    }, qKey ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [modalNovo, form.empresaNome, empresasSugestoes.length]);

  async function carregar() {
    try {
      setLoading(true);
      setError(null);
      const q = busca.trim();
      const rows = await FuncionariosApi.listar(q, { limit: q ? 500 : 200 });
      setLista(rows);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar funcionários');
      setLista([]);
    } finally {
      setLoading(false);
    }
  }

  async function abrir(id: number) {
    const det = await FuncionariosApi.obter(id);
    setSelecionado(det);
    try {
      const hist = await FuncionariosApi.historico(id);
      setHistorico(hist);
    } catch {
      setHistorico([]);
    }
    try {
      const ev = await FuncionariosApi.eventos(id);
      setEventos(ev);
    } catch {
      setEventos([]);
    }
    try {
      const docs = await DocumentosApi.listar({ entidadeTipo: 'FUNCIONARIO', entidadeId: id, limit: 50 });
      setDocumentos(docs);
    } catch {
      setDocumentos([]);
    }
  }

  async function salvarNovo(e: React.FormEvent) {
    e.preventDefault();
    const cpfDigits = onlyDigits(form.cpf || '');
    if (cpfDigits.length !== 11) {
      alert('CPF inválido: deve ter 11 dígitos.');
      return;
    }
    const dataNascimento = String(form.dataNascimento || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) {
      alert('Data de nascimento inválida.');
      return;
    }
    const telDigits = onlyDigits(form.telefoneWhatsapp || '');
    if (telDigits && telDigits.length !== 10 && telDigits.length !== 11) {
      alert('Telefone / WhatsApp inválido: deve ter 10 ou 11 dígitos (com DDD).');
      return;
    }

    if (form.tipoCadastro === 'TERCEIRIZADO') {
      await TerceirizadosApi.criar({
        nomeCompleto: String(form.nomeCompleto || '').trim(),
        funcao: String(form.funcaoPrincipal || '').trim() ? String(form.funcaoPrincipal || '').trim() : null,
        ativo: form.ativo !== false,
        cpf: cpfDigits,
        telefoneWhatsapp: telDigits ? telDigits : null,
        dataNascimento,
        identidade: String(form.rg || '').trim() ? String(form.rg || '').trim() : null,
        titulo: String(form.titulo || '').trim() ? String(form.titulo || '').trim() : null,
        nomeMae: String(form.nomeMae || '').trim() ? String(form.nomeMae || '').trim() : null,
        nomePai: String(form.nomePai || '').trim() ? String(form.nomePai || '').trim() : null,
        idContraparteEmpresa: typeof form.idContraparteEmpresa === 'number' ? form.idContraparteEmpresa : null,
      } as any);
    } else {
      const matricula = String(form.matricula || '').trim();
      if (!matricula) {
        alert('Matrícula obrigatória.');
        return;
      }
      await FuncionariosApi.criar({
        matricula,
        nomeCompleto: String(form.nomeCompleto || '').trim(),
        cpf: cpfDigits,
        dataNascimento,
        rg: String(form.rg || '').trim() ? String(form.rg || '').trim() : null,
        titulo: String(form.titulo || '').trim() ? String(form.titulo || '').trim() : null,
        nomeMae: String(form.nomeMae || '').trim() ? String(form.nomeMae || '').trim() : null,
        nomePai: String(form.nomePai || '').trim() ? String(form.nomePai || '').trim() : null,
        cargoContratual: String(form.cargoContratual || '').trim() ? String(form.cargoContratual || '').trim() : null,
        tipoVinculo: String(form.tipoVinculo || '').trim() ? String(form.tipoVinculo || '').trim() : null,
        telefoneWhatsapp: telDigits ? telDigits : null,
        idEmpresa: typeof form.idContraparteEmpresa === 'number' ? form.idContraparteEmpresa : null,
        dataAdmissao: String(form.dataAdmissao || '').slice(0, 10) ? String(form.dataAdmissao || '').slice(0, 10) : null,
        ativo: form.ativo !== false,
      });
      await carregar();
    }

    setModalNovo(false);
    setForm(vazio);
  }

  async function endossar(acao: 'APROVAR' | 'REJEITAR') {
    if (!selecionado) return;
    const motivo = acao === 'REJEITAR' ? prompt('Motivo da rejeição:') || '' : undefined;
    await FuncionariosApi.endossar(selecionado.id, { acao, motivo });
    await abrir(selecionado.id);
    await carregar();
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div className="p-6 space-y-6 text-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Funcionários</h1>
          <p className="text-sm text-slate-600">Cadastro, lotação, supervisão, jornada e horas extras.</p>
        </div>
        <button onClick={() => setModalNovo(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="button">
          Novo funcionário
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex gap-2">
          <input className="input" placeholder="Buscar por nome, matrícula ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button onClick={carregar} className="rounded-lg border px-4 py-2 text-sm" type="button">
            Buscar
          </button>
        </div>

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {!busca.trim() ? <div className="mb-2 text-xs text-slate-500">Mostrando os primeiros 200 registros. Use a busca para refinar.</div> : null}

        {loading ? (
          <div className="text-sm text-slate-600">Carregando...</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Alertas</th>
                  <th className="px-3 py-2">Matrícula</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">CPF</th>
                  <th className="px-3 py-2">Cargo</th>
                  <th className="px-3 py-2">Status funcional</th>
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-3 py-2">RH</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item.id} className="cursor-pointer border-t hover:bg-slate-50" onClick={() => abrir(item.id)}>
                    <td className="px-3 py-2">
                      <AlertaBadge item={item} />
                    </td>
                    <td className="px-3 py-2">{item.matricula}</td>
                    <td className="px-3 py-2">{formatFuncionarioRef(item.id, item.nomeCompleto)}</td>
                    <td className="px-3 py-2">{item.cpf}</td>
                    <td className="px-3 py-2">{item.cargoContratual || '-'}</td>
                    <td className="px-3 py-2">{item.statusFuncional}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-1 text-xs font-semibold ${item.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {item.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{item.statusCadastroRh}</td>
                  </tr>
                ))}
                {lista.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selecionado && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dados do funcionário</h2>
              <div className="flex gap-2">
                <button onClick={() => endossar('APROVAR')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white" type="button">
                  Endossar RH
                </button>
                <button onClick={() => endossar('REJEITAR')} className="rounded-lg bg-red-600 px-3 py-2 text-xs text-white" type="button">
                  Rejeitar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Nome" value={selecionado.nomeCompleto} />
              <Info label="CPF" value={selecionado.cpf} />
              <Info label="Matrícula" value={selecionado.matricula} />
              <Info label="Cargo" value={selecionado.cargoContratual || '-'} />
              <Info label="Função" value={selecionado.funcaoPrincipal || '-'} />
              <Info label="Vínculo" value={selecionado.tipoVinculo} />
              <Info label="Admissão" value={selecionado.dataAdmissao} />
              <Info label="Ativo" value={selecionado.ativo ? 'Ativo' : 'Inativo'} />
              <Info label="RH" value={selecionado.statusCadastroRh} />
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Situação atual</h2>
            <div className="space-y-3 text-sm">
              <Info
                label="Lotação atual"
                value={
                  selecionado.lotacoes.find((x) => x.atual)
                    ? `${selecionado.lotacoes.find((x) => x.atual)?.tipoLotacao} ${
                        selecionado.lotacoes.find((x) => x.atual)?.idObra || selecionado.lotacoes.find((x) => x.atual)?.idUnidade || ''
                      }`
                    : '-'
                }
              />
              <Info label="Supervisor atual" value={selecionado.supervisoes.find((x) => x.atual)?.supervisorNome || '-'} />
              <Info label="Jornada atual" value={selecionado.jornadas.find((x) => x.atual)?.tipoJornada || '-'} />
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">Horas extras</h2>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Minutos</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {selecionado.horasExtras.map((he) => (
                    <tr key={he.id} className="border-t">
                      <td className="px-3 py-2">{he.dataReferencia}</td>
                      <td className="px-3 py-2">{he.quantidadeMinutos}</td>
                      <td className="px-3 py-2">{he.tipoHoraExtra}</td>
                      <td className="px-3 py-2">{he.statusHe}</td>
                      <td className="px-3 py-2">{he.motivo || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">Histórico (movimentações)</h2>
            <HistoricoFuncionario funcionario={selecionado} auditoria={historico} eventos={eventos} />
          </section>

          <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Documentos do funcionário</h2>
              <button type="button" className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white" onClick={() => setModalDocOpen(true)}>
                Novo documento
              </button>
            </div>
            {documentos.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhum documento vinculado.</div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Categoria</th>
                      <th className="px-3 py-2">Título</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Atualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-3 py-2">#{d.id}</td>
                        <td className="px-3 py-2">{d.categoriaDocumento}</td>
                        <td className="px-3 py-2">{d.tituloDocumento}</td>
                        <td className="px-3 py-2">{d.statusDocumento}</td>
                        <td className="px-3 py-2">{String(d.atualizadoEm).slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {modalDocOpen && selecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Novo documento do funcionário</h3>
              <button type="button" onClick={() => setModalDocOpen(false)} disabled={docSaving}>
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input className="input" placeholder="Categoria (ex.: RH_CONTRATO, RH_ADMISSAO)" value={docForm.categoria} onChange={(e) => setDocForm((p) => ({ ...p, categoria: e.target.value }))} />
              <input className="input" placeholder="Título" value={docForm.titulo} onChange={(e) => setDocForm((p) => ({ ...p, titulo: e.target.value }))} />
              <input className="input md:col-span-2" placeholder="Descrição (opcional)" value={docForm.descricao} onChange={(e) => setDocForm((p) => ({ ...p, descricao: e.target.value }))} />
              <input
                className="md:col-span-2"
                type="file"
                onChange={(e) => setDocForm((p) => ({ ...p, arquivo: e.target.files && e.target.files.length ? e.target.files[0] : null }))}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModalDocOpen(false)} className="rounded-lg border px-4 py-2 text-sm" disabled={docSaving}>
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={docSaving || !docForm.categoria.trim() || !docForm.titulo.trim()}
                onClick={async () => {
                  try {
                    setDocSaving(true);
                    const created = await DocumentosApi.criar({
                      entidadeTipo: 'FUNCIONARIO',
                      entidadeId: selecionado.id,
                      categoriaDocumento: docForm.categoria.trim(),
                      tituloDocumento: docForm.titulo.trim(),
                      descricaoDocumento: docForm.descricao.trim() ? docForm.descricao.trim() : null,
                    });
                    if (docForm.arquivo) {
                      await DocumentosApi.criarVersaoUpload(created.id, docForm.arquivo);
                    }
                    const docs = await DocumentosApi.listar({ entidadeTipo: 'FUNCIONARIO', entidadeId: selecionado.id, limit: 50 });
                    setDocumentos(docs);
                    setModalDocOpen(false);
                    setDocForm({ categoria: 'RH_FUNCIONARIO', titulo: '', descricao: '', arquivo: null });
                  } catch (e: any) {
                    alert(e?.message || 'Erro ao criar documento');
                  } finally {
                    setDocSaving(false);
                  }
                }}
              >
                {docSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalNovo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={salvarNovo} className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Novo funcionário</h3>
              <button type="button" onClick={() => setModalNovo(false)}>
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Tipo</div>
                <select
                  className="input"
                  value={form.tipoCadastro}
                  onChange={(e) => setForm((o: any) => ({ ...o, tipoCadastro: e.target.value }))}
                >
                  <option value="FUNCIONARIO">Funcionário</option>
                  <option value="TERCEIRIZADO">Terceirizado</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-slate-500">Matrícula</div>
                <input
                  className="input"
                  value={form.matricula}
                  onChange={(e) => setForm((o: any) => ({ ...o, matricula: e.target.value }))}
                  disabled={form.tipoCadastro !== 'FUNCIONARIO'}
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-slate-500">Nome completo</div>
                <input className="input" value={form.nomeCompleto} onChange={(e) => setForm((o: any) => ({ ...o, nomeCompleto: e.target.value }))} />
              </div>

              <div>
                <div className="text-xs text-slate-500">CPF</div>
                <input
                  className="input"
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => setForm((o: any) => ({ ...o, cpf: e.target.value }))}
                  onBlur={() => setForm((o: any) => ({ ...o, cpf: formatCpf(o.cpf) }))}
                />
              </div>

              <div>
                <div className="text-xs text-slate-500">Telefone / WhatsApp</div>
                <input
                  className="input"
                  placeholder="(00) 00000-0000"
                  value={form.telefoneWhatsapp}
                  onChange={(e) => setForm((o: any) => ({ ...o, telefoneWhatsapp: formatPhoneBr(e.target.value) }))}
                />
              </div>

              <div>
                <div className="text-xs text-slate-500">Data de nascimento</div>
                <input className="input" type="date" value={form.dataNascimento} onChange={(e) => setForm((o: any) => ({ ...o, dataNascimento: e.target.value }))} />
              </div>

              <div>
                <div className="text-xs text-slate-500">Identidade (RG)</div>
                <input className="input" value={form.rg} onChange={(e) => setForm((o: any) => ({ ...o, rg: e.target.value }))} />
              </div>

              <div>
                <div className="text-xs text-slate-500">Título</div>
                <input className="input" value={form.titulo} onChange={(e) => setForm((o: any) => ({ ...o, titulo: e.target.value }))} />
              </div>

              <div>
                <div className="text-xs text-slate-500">Nome da mãe</div>
                <input className="input" value={form.nomeMae} onChange={(e) => setForm((o: any) => ({ ...o, nomeMae: e.target.value }))} />
              </div>

              <div>
                <div className="text-xs text-slate-500">Nome do pai</div>
                <input className="input" value={form.nomePai} onChange={(e) => setForm((o: any) => ({ ...o, nomePai: e.target.value }))} />
              </div>

              {form.tipoCadastro === 'FUNCIONARIO' ? (
                <>
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">Empresa (contraparte) (opcional)</div>
                    </div>
                    <div className="relative">
                      <input
                        className="input"
                        value={form.empresaNome}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((o: any) => ({ ...o, empresaNome: v, idContraparteEmpresa: null }));
                          setEmpresasSugestoesOpen(true);
                        }}
                        onFocus={() => setEmpresasSugestoesOpen(true)}
                        onBlur={() => window.setTimeout(() => setEmpresasSugestoesOpen(false), 150)}
                        placeholder="Digite nome ou CNPJ/CPF"
                      />
                      {empresasSugestoesOpen ? (
                        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                          {empresasSugestoesLoading ? (
                            <div className="px-3 py-2 text-sm text-slate-600">Buscando…</div>
                          ) : empresasSugestoes.length ? (
                            <div className="max-h-64 overflow-auto">
                              {empresasSugestoes.slice(0, 30).map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setForm((o: any) => ({ ...o, empresaNome: r.nome, idContraparteEmpresa: r.id }));
                                    setEmpresasSugestoesOpen(false);
                                  }}
                                >
                                  <div className="text-slate-900">{`#${r.id} - ${r.nome} - ${formatCnpjCpf(r.documento) || '-'}`}</div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 text-sm text-slate-600">Nenhuma empresa encontrada.</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Cargo</div>
                    <div className="relative">
                      <input
                        className="input"
                        value={form.cargoContratual}
                        placeholder="Selecione ou digite para filtrar"
                        onFocus={() => setCargoSugestoesOpen(true)}
                        onBlur={() => window.setTimeout(() => setCargoSugestoesOpen(false), 150)}
                        onChange={(e) => {
                          setForm((o: any) => ({ ...o, cargoContratual: e.target.value }));
                          setCargoSugestoesOpen(true);
                        }}
                      />
                      {cargoSugestoesOpen ? (
                        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                          <div className="max-h-64 overflow-auto">
                            {cargosDisponiveis
                              .filter((c) => c.toLowerCase().includes(String(form.cargoContratual || '').trim().toLowerCase()))
                              .slice(0, 30)
                              .map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                  onMouseDown={(ev) => ev.preventDefault()}
                                  onClick={() => {
                                    setForm((o: any) => ({ ...o, cargoContratual: c }));
                                    setCargoSugestoesOpen(false);
                                    setCargoOutroOpen(false);
                                  }}
                                >
                                  {c}
                                </button>
                              ))}
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-slate-50"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                setCargoSugestoesOpen(false);
                                setCargoOutroOpen(true);
                                setCargoOutroNome('');
                              }}
                            >
                              Outro…
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {cargoOutroOpen ? (
                    <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs text-slate-600 mb-2">Adicionar outro cargo</div>
                      <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <input className="input flex-1" value={cargoOutroNome} onChange={(e) => setCargoOutroNome(e.target.value)} placeholder="Digite o nome do cargo" />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => {
                              setCargoOutroOpen(false);
                              setCargoOutroNome('');
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
                            disabled={!String(cargoOutroNome || '').trim()}
                            onClick={() => {
                              const novo = String(cargoOutroNome || '').trim();
                              if (!novo) return;
                              setCargosExtras((prev) => (prev.some((x) => x.toLowerCase() === novo.toLowerCase()) ? prev : [...prev, novo]));
                              setForm((o: any) => ({ ...o, cargoContratual: novo }));
                              setCargoOutroOpen(false);
                              setCargoOutroNome('');
                            }}
                          >
                            Adicionar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="text-xs text-slate-500">Tipo de vínculo</div>
                    <select className="input" value={form.tipoVinculo} onChange={(e) => setForm((o: any) => ({ ...o, tipoVinculo: e.target.value }))}>
                      <option value="CLT">CLT</option>
                      <option value="PJ">PJ</option>
                      <option value="ESTAGIO">Estágio</option>
                      <option value="TEMPORARIO">Temporário</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500">Data de admissão</div>
                    <input className="input" type="date" value={form.dataAdmissao} onChange={(e) => setForm((o: any) => ({ ...o, dataAdmissao: e.target.value }))} />
                  </div>
                </>
              ) : (
                <>
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-500">Empresa (contraparte)</div>
                    </div>
                    <div className="relative">
                      <input
                        className="input"
                        value={form.empresaNome}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((o: any) => ({ ...o, empresaNome: v, idContraparteEmpresa: null }));
                          setEmpresasSugestoesOpen(true);
                        }}
                        onFocus={() => setEmpresasSugestoesOpen(true)}
                        onBlur={() => window.setTimeout(() => setEmpresasSugestoesOpen(false), 150)}
                        placeholder="Digite nome ou CNPJ/CPF"
                      />
                      {empresasSugestoesOpen ? (
                        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                          {empresasSugestoesLoading ? (
                            <div className="px-3 py-2 text-sm text-slate-600">Buscando…</div>
                          ) : empresasSugestoes.length ? (
                            <div className="max-h-64 overflow-auto">
                              {empresasSugestoes.slice(0, 30).map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setForm((o: any) => ({ ...o, empresaNome: r.nome, idContraparteEmpresa: r.id }));
                                    setEmpresasSugestoesOpen(false);
                                  }}
                                >
                            <div className="text-slate-900">{`#${r.id} - ${r.nome} - ${formatCnpjCpf(r.documento) || '-'}`}</div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="px-3 py-2 text-sm text-slate-600">Nenhuma empresa encontrada.</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-slate-500">Função</div>
                    <input className="input" value={form.funcaoPrincipal} onChange={(e) => setForm((o: any) => ({ ...o, funcaoPrincipal: e.target.value }))} />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModalNovo(false)} className="rounded-lg border px-4 py-2 text-sm">
                Cancelar
              </button>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" type="submit">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function AlertaBadge({ item }: { item: FuncionarioResumoDTO }) {
  const missingRequired: string[] = [];
  if (!String(item.matricula || '').trim()) missingRequired.push('Matrícula');
  if (!String(item.nomeCompleto || '').trim()) missingRequired.push('Nome');
  if (!String(item.cpf || '').trim()) missingRequired.push('CPF');
  if (!String(item.dataAdmissao || '').trim()) missingRequired.push('Admissão');

  const missingOptional: string[] = [];
  if (!String(item.cargoContratual || '').trim()) missingOptional.push('Cargo contratual');
  if (!String(item.funcaoPrincipal || '').trim()) missingOptional.push('Função principal');

  if (missingRequired.length > 0) {
    return (
      <span className="inline-flex items-center gap-2" title={`Faltando obrigatório: ${missingRequired.join(', ')}`}>
        <span className="h-2 w-2 rounded-full bg-red-600" />
        <span className="text-xs text-slate-600">Obrig.</span>
      </span>
    );
  }

  if (missingOptional.length > 0) {
    return (
      <span className="inline-flex items-center gap-2" title={`Faltando opcional: ${missingOptional.join(', ')}`}>
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-xs text-slate-600">Opc.</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2" title="Cadastro completo">
      <span className="h-2 w-2 rounded-full bg-emerald-600" />
      <span className="text-xs text-slate-600">OK</span>
    </span>
  );
}

function HistoricoFuncionario({
  funcionario,
  auditoria,
  eventos: eventosExtras,
}: {
  funcionario: FuncionarioDetalheDTO;
  auditoria: FuncionarioHistoricoEventoDTO[];
  eventos: FuncionarioEventoDTO[];
}) {
  type Evento = { data: string; tipo: string; detalhe: string };

  const eventos: Evento[] = [];

  if (funcionario.dataAdmissao) {
    eventos.push({ data: funcionario.dataAdmissao, tipo: 'Admissão', detalhe: 'Admitido' });
  }
  if (funcionario.dataDesligamento) {
    eventos.push({ data: funcionario.dataDesligamento, tipo: 'Desligamento', detalhe: 'Desligado' });
  }
  if (funcionario.salarioBase !== null && funcionario.salarioBase !== undefined) {
    eventos.push({ data: funcionario.dataAdmissao || '0000-00-00', tipo: 'Salário', detalhe: `Salário base: ${String(funcionario.salarioBase)}` });
  }

  for (const l of funcionario.lotacoes ?? []) {
    eventos.push({
      data: l.dataInicio,
      tipo: 'Lotação',
      detalhe: `${l.tipoLotacao} ${l.tipoLotacao === 'OBRA' ? `#${l.idObra}` : `#${l.idUnidade}`}${l.atual ? ' (atual)' : ''}`,
    });
    if (l.dataFim) {
      eventos.push({
        data: l.dataFim,
        tipo: 'Fim lotação',
        detalhe: `${l.tipoLotacao} ${l.tipoLotacao === 'OBRA' ? `#${l.idObra}` : `#${l.idUnidade}`}`,
      });
    }
  }

  for (const s of funcionario.supervisoes ?? []) {
    eventos.push({
      data: s.dataInicio,
      tipo: 'Supervisão',
      detalhe: `${s.supervisorNome}${s.atual ? ' (atual)' : ''}`,
    });
    if (s.dataFim) {
      eventos.push({
        data: s.dataFim,
        tipo: 'Fim supervisão',
        detalhe: s.supervisorNome,
      });
    }
  }

  for (const j of funcionario.jornadas ?? []) {
    eventos.push({
      data: j.dataInicio,
      tipo: 'Jornada',
      detalhe: `${j.tipoJornada}${j.atual ? ' (atual)' : ''}`,
    });
    if (j.dataFim) {
      eventos.push({
        data: j.dataFim,
        tipo: 'Fim jornada',
        detalhe: j.tipoJornada,
      });
    }
  }

  for (const he of funcionario.horasExtras ?? []) {
    eventos.push({
      data: he.dataReferencia,
      tipo: 'Hora extra',
      detalhe: `${he.quantidadeMinutos} min • ${he.tipoHoraExtra} • ${he.statusHe}`,
    });
  }

  const aud = Array.isArray(auditoria) ? auditoria : [];
  for (const e of aud) {
    const createdAt = String(e.createdAt || '').slice(0, 10);
    if (e.entidade === 'usuarios' && e.acao === 'CREATE') {
      eventos.push({ data: createdAt || '0000-00-00', tipo: 'Usuário', detalhe: 'Designado como usuário do sistema' });
    }
    if (e.entidade === 'funcionarios' && e.acao === 'UPDATE') {
      const before = typeof e.dadosAnteriores === 'object' && e.dadosAnteriores !== null ? (e.dadosAnteriores as any) : null;
      const after = typeof e.dadosNovos === 'object' && e.dadosNovos !== null ? (e.dadosNovos as any) : null;
      const beforeSal = before ? before.salario_base ?? before.salarioBase : undefined;
      const afterSal = after ? after.salarioBase ?? after.salario_base : undefined;
      if (beforeSal !== undefined && afterSal !== undefined && String(beforeSal) !== String(afterSal)) {
        eventos.push({ data: createdAt || '0000-00-00', tipo: 'Salário', detalhe: `Alteração: ${String(beforeSal)} → ${String(afterSal)}` });
      }
      const beforeAtivo = before ? before.ativo : undefined;
      const afterAtivo = after ? (after.ativo === false ? 0 : 1) : undefined;
      if (beforeAtivo !== undefined && afterAtivo !== undefined && String(beforeAtivo) !== String(afterAtivo)) {
        eventos.push({ data: createdAt || '0000-00-00', tipo: 'Status', detalhe: afterAtivo ? 'Ativação' : 'Inativação' });
      }
      const beforeFuncao = before ? before.funcao_principal ?? before.funcaoPrincipal : undefined;
      const afterFuncao = after ? after.funcaoPrincipal ?? after.funcao_principal : undefined;
      if (beforeFuncao !== undefined && afterFuncao !== undefined && String(beforeFuncao) !== String(afterFuncao)) {
        eventos.push({ data: createdAt || '0000-00-00', tipo: 'Nomeação/Exoneração', detalhe: `Função: ${String(beforeFuncao || '-')} → ${String(afterFuncao || '-')}` });
      }
    }
  }

  const evts = Array.isArray(eventosExtras) ? eventosExtras : [];
  for (const e of evts) {
    const data = String(e.dataEvento || e.createdAt || '').slice(0, 10) || '0000-00-00';
    const tipo = String(e.tipoEvento || '').trim() || 'Evento';
    const doc = e.idDocumentoRegistro ? ` • Doc #${e.idDocumentoRegistro}` : '';
    const desc = e.descricao ? String(e.descricao) : '';
    eventos.push({ data, tipo, detalhe: `${desc}${doc}`.trim() || doc.trim() || '-' });
  }

  eventos.sort((a, b) => String(b.data).localeCompare(String(a.data)));

  if (eventos.length === 0) {
    return <div className="text-sm text-slate-600">Nenhuma movimentação registrada.</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Detalhe</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((e, idx) => (
            <tr key={`${e.tipo}-${e.data}-${idx}`} className="border-t">
              <td className="px-3 py-2">{e.data}</td>
              <td className="px-3 py-2">{e.tipo}</td>
              <td className="px-3 py-2">{e.detalhe}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Tabela({ colunas, linhas }: { colunas: string[]; linhas: string[][] }) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            {colunas.map((c) => (
              <th key={c} className="px-3 py-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-t">
              {linha.map((valor, j) => (
                <td key={j} className="px-3 py-2">
                  {valor}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
