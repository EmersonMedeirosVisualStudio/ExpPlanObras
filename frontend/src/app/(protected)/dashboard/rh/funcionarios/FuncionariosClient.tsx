'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioDetalheDTO, FuncionarioResumoDTO } from '@/lib/modules/funcionarios/types';

const vazio = {
  matricula: '',
  nomeCompleto: '',
  cpf: '',
  cargoContratual: '',
  funcaoPrincipal: '',
  tipoVinculo: 'CLT',
  dataAdmissao: '',
  statusFuncional: 'ATIVO',
  ativo: true,
};

function formatFuncionarioRef(id: number | string, nome: string) {
  return `#${id} - ${nome}`;
}

export default function FuncionariosClient() {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<FuncionarioResumoDTO[]>([]);
  const [selecionado, setSelecionado] = useState<FuncionarioDetalheDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalNovo, setModalNovo] = useState(false);
  const [form, setForm] = useState<any>(vazio);

  async function carregar() {
    setLoading(true);
    const rows = await FuncionariosApi.listar(busca);
    setLista(rows);
    setLoading(false);
  }

  async function abrir(id: number) {
    const det = await FuncionariosApi.obter(id);
    setSelecionado(det);
  }

  async function salvarNovo(e: React.FormEvent) {
    e.preventDefault();
    await FuncionariosApi.criar(form);
    setModalNovo(false);
    setForm(vazio);
    await carregar();
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Funcionários</h1>
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

        {loading ? (
          <div>Carregando...</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Alertas</th>
                  <th className="px-3 py-2">Matrícula</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">CPF</th>
                  <th className="px-3 py-2">Cargo</th>
                  <th className="px-3 py-2">Status funcional</th>
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
                    <td className="px-3 py-2">{item.statusCadastroRh}</td>
                  </tr>
                ))}
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
              <input className="input" placeholder="Matrícula" value={form.matricula} onChange={(e) => setForm((o: any) => ({ ...o, matricula: e.target.value }))} />
              <input
                className="input"
                placeholder="Nome completo"
                value={form.nomeCompleto}
                onChange={(e) => setForm((o: any) => ({ ...o, nomeCompleto: e.target.value }))}
              />
              <input className="input" placeholder="CPF" value={form.cpf} onChange={(e) => setForm((o: any) => ({ ...o, cpf: e.target.value }))} />
              <input
                className="input"
                placeholder="Cargo contratual"
                value={form.cargoContratual}
                onChange={(e) => setForm((o: any) => ({ ...o, cargoContratual: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Função principal"
                value={form.funcaoPrincipal}
                onChange={(e) => setForm((o: any) => ({ ...o, funcaoPrincipal: e.target.value }))}
              />
              <input className="input" type="date" value={form.dataAdmissao} onChange={(e) => setForm((o: any) => ({ ...o, dataAdmissao: e.target.value }))} />
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
