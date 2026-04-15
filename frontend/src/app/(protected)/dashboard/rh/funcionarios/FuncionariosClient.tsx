'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import { FuncionariosApi } from '@/lib/modules/funcionarios/api';
import type { FuncionarioDetalheDTO, FuncionarioEventoDTO, FuncionarioHistoricoEventoDTO, FuncionarioResumoDTO } from '@/lib/modules/funcionarios/types';

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
  const [historico, setHistorico] = useState<FuncionarioHistoricoEventoDTO[]>([]);
  const [eventos, setEventos] = useState<FuncionarioEventoDTO[]>([]);
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
