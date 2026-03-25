"use client";

import { useEffect, useMemo, useState } from "react";
import { AutomacoesApi } from "@/lib/modules/automacoes/api";
import type {
  AutomacaoExecucaoDTO,
  PendenciaOcorrenciaDTO,
  SlaPoliticaDTO,
  SlaPoliticaSaveDTO,
  TarefaInstanciaDTO,
  TarefaRecorrenteModeloDTO,
  TarefaRecorrenteModeloSaveDTO,
} from "@/lib/modules/automacoes/types";

type Tab = "MODELOS" | "POLITICAS" | "OCORRENCIAS" | "EXECUCOES" | "TAREFAS";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

export default function AutomacoesClient() {
  const [tab, setTab] = useState<Tab>("MODELOS");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [modelos, setModelos] = useState<TarefaRecorrenteModeloDTO[]>([]);
  const [politicas, setPoliticas] = useState<SlaPoliticaDTO[]>([]);
  const [ocorrencias, setOcorrencias] = useState<PendenciaOcorrenciaDTO[]>([]);
  const [execucoes, setExecucoes] = useState<AutomacaoExecucaoDTO[]>([]);
  const [tarefas, setTarefas] = useState<TarefaInstanciaDTO[]>([]);

  const [fOcStatus, setFOcStatus] = useState<string>("");
  const [fOcSev, setFOcSev] = useState<string>("");
  const [fOcVencidas, setFOcVencidas] = useState<boolean>(true);

  const [novoModeloOpen, setNovoModeloOpen] = useState(false);
  const [novoModelo, setNovoModelo] = useState<TarefaRecorrenteModeloSaveDTO>({
    nome: "",
    modulo: "ENGENHARIA",
    tipoLocal: "EMPRESA",
    idObra: null,
    idUnidade: null,
    idDiretoria: null,
    recorrencia: "DIARIA",
    horarioExecucao: "08:00:00",
    timezone: "America/Sao_Paulo",
    diaSemana: 1,
    diaMes: 1,
    tituloTarefa: "",
    descricaoTarefa: null,
    responsavelTipo: "PERMISSAO",
    idUsuarioResponsavel: null,
    permissaoResponsavel: "dashboard.engenharia.view",
    geraNotificacao: true,
    geraEmail: false,
    ativo: true,
  });

  const [novaPoliticaOpen, setNovaPoliticaOpen] = useState(false);
  const [novaPolitica, setNovaPolitica] = useState<SlaPoliticaSaveDTO>({
    nome: "",
    modulo: "ENGENHARIA",
    chavePendencia: "ENG_MEDICAO_ATRASADA",
    entidadeTipo: "MEDICAO",
    prazoMinutos: 1440,
    alertaAntesMinutos: 0,
    escalonarAposMinutos: null,
    maxEscalacoes: 1,
    criaTarefaQuandoVencer: false,
    notificarNoApp: true,
    enviarEmail: false,
    ativo: true,
  });

  const tabs = useMemo(
    () =>
      [
        { key: "MODELOS" as const, label: "Tarefas recorrentes" },
        { key: "TAREFAS" as const, label: "Tarefas geradas" },
        { key: "POLITICAS" as const, label: "Políticas SLA" },
        { key: "OCORRENCIAS" as const, label: "Ocorrências" },
        { key: "EXECUCOES" as const, label: "Execuções" },
      ] as const,
    []
  );

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const calls: Promise<any>[] = [];
      calls.push(AutomacoesApi.listarModelos());
      calls.push(AutomacoesApi.listarPoliticas());
      calls.push(AutomacoesApi.listarExecucoes().catch(() => []));
      calls.push(
        AutomacoesApi.listarOcorrencias({
          status: fOcStatus || undefined,
          severidade: fOcSev || undefined,
          vencidas: fOcVencidas,
          limit: 200,
        }).catch(() => [])
      );
      calls.push(AutomacoesApi.listarInstancias({ limit: 200 }).catch(() => []));
      const [m, p, e, o, t] = await Promise.all(calls);
      setModelos(m || []);
      setPoliticas(p || []);
      setExecucoes(e || []);
      setOcorrencias(o || []);
      setTarefas(t || []);
    } catch (e: any) {
      setErro(String(e?.message || "Erro"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [fOcStatus, fOcSev, fOcVencidas]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Automações</h1>
          <p className="text-sm text-slate-600">Tarefas recorrentes, políticas de SLA, cobrança automática e histórico de execuções.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => AutomacoesApi.executarAgora("TAREFAS").then(carregar)} type="button">
            Executar tarefas
          </button>
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => AutomacoesApi.executarAgora("SLA").then(carregar)} type="button">
            Detectar SLA
          </button>
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => AutomacoesApi.executarAgora("COBRANCA").then(carregar)} type="button">
            Cobranças
          </button>
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregar} type="button">
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div> : null}
      {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex gap-2 border-b p-2 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`rounded-lg px-3 py-2 text-sm ${tab === t.key ? "bg-slate-100" : "hover:bg-slate-50"}`}
              type="button"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "MODELOS" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm text-slate-600">Modelos de tarefas recorrentes.</div>
                <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setNovoModeloOpen((v) => !v)}>
                  Novo modelo
                </button>
              </div>

              {novoModeloOpen ? (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Nome</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={novoModelo.nome} onChange={(e) => setNovoModelo((p) => ({ ...p, nome: e.target.value }))} />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Módulo</div>
                      <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={novoModelo.modulo} onChange={(e) => setNovoModelo((p) => ({ ...p, modulo: e.target.value }))}>
                        <option value="RH">RH</option>
                        <option value="SST">SST</option>
                        <option value="SUPRIMENTOS">Suprimentos</option>
                        <option value="ENGENHARIA">Engenharia</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Recorrência</div>
                      <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={novoModelo.recorrencia} onChange={(e) => setNovoModelo((p) => ({ ...p, recorrencia: e.target.value as any }))}>
                        <option value="DIARIA">Diária</option>
                        <option value="SEMANAL">Semanal</option>
                        <option value="MENSAL">Mensal</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Horário (HH:MM)</div>
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        value={novoModelo.horarioExecucao.slice(0, 5)}
                        onChange={(e) => setNovoModelo((p) => ({ ...p, horarioExecucao: `${e.target.value}:00` }))}
                      />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Dia da semana</div>
                      <select
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                        value={novoModelo.diaSemana ?? 1}
                        onChange={(e) => setNovoModelo((p) => ({ ...p, diaSemana: Number(e.target.value) }))}
                        disabled={novoModelo.recorrencia !== "SEMANAL"}
                      >
                        <option value={0}>Domingo</option>
                        <option value={1}>Segunda</option>
                        <option value={2}>Terça</option>
                        <option value={3}>Quarta</option>
                        <option value={4}>Quinta</option>
                        <option value={5}>Sexta</option>
                        <option value={6}>Sábado</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Dia do mês</div>
                      <input
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        type="number"
                        min={1}
                        max={28}
                        value={novoModelo.diaMes ?? 1}
                        onChange={(e) => setNovoModelo((p) => ({ ...p, diaMes: Number(e.target.value) }))}
                        disabled={novoModelo.recorrencia !== "MENSAL"}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Título da tarefa</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={novoModelo.tituloTarefa} onChange={(e) => setNovoModelo((p) => ({ ...p, tituloTarefa: e.target.value }))} />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Responsável</div>
                      <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={novoModelo.responsavelTipo} onChange={(e) => setNovoModelo((p) => ({ ...p, responsavelTipo: e.target.value as any }))}>
                        <option value="PERMISSAO">Por permissão</option>
                        <option value="USUARIO">Usuário fixo</option>
                      </select>
                    </label>
                    {novoModelo.responsavelTipo === "PERMISSAO" ? (
                      <label className="text-sm md:col-span-2">
                        <div className="mb-1 text-xs text-slate-500">Permissão (ex.: dashboard.engenharia.view)</div>
                        <input className="w-full rounded-lg border px-3 py-2 text-sm" value={novoModelo.permissaoResponsavel || ""} onChange={(e) => setNovoModelo((p) => ({ ...p, permissaoResponsavel: e.target.value }))} />
                      </label>
                    ) : (
                      <label className="text-sm md:col-span-2">
                        <div className="mb-1 text-xs text-slate-500">ID do usuário</div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          type="number"
                          value={novoModelo.idUsuarioResponsavel || ""}
                          onChange={(e) => setNovoModelo((p) => ({ ...p, idUsuarioResponsavel: e.target.value ? Number(e.target.value) : null }))}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={novoModelo.geraNotificacao} onChange={(e) => setNovoModelo((p) => ({ ...p, geraNotificacao: e.target.checked }))} />
                      Notificar no app
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={novoModelo.geraEmail} onChange={(e) => setNovoModelo((p) => ({ ...p, geraEmail: e.target.checked }))} />
                      Enviar e-mail
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={novoModelo.ativo} onChange={(e) => setNovoModelo((p) => ({ ...p, ativo: e.target.checked }))} />
                      Ativo
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border px-4 py-2 text-sm"
                      type="button"
                      onClick={async () => {
                        await AutomacoesApi.criarModelo(novoModelo);
                        setNovoModeloOpen(false);
                        await carregar();
                      }}
                    >
                      Salvar
                    </button>
                    <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setNovoModeloOpen(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="p-3">Nome</th>
                      <th className="p-3">Módulo</th>
                      <th className="p-3">Recorrência</th>
                      <th className="p-3">Horário</th>
                      <th className="p-3">Próxima</th>
                      <th className="p-3">Ativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelos.length ? (
                      modelos.map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="p-3">
                            <div className="font-medium">{m.nome}</div>
                            <div className="text-xs text-slate-500">{m.tituloTarefa}</div>
                          </td>
                          <td className="p-3">{m.modulo}</td>
                          <td className="p-3">{m.recorrencia}</td>
                          <td className="p-3">{m.horarioExecucao}</td>
                          <td className="p-3">{fmtDateTime(m.proximaExecucaoEm)}</td>
                          <td className="p-3">{m.ativo ? "Sim" : "Não"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={6}>
                          Sem modelos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "TAREFAS" ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">Tarefas geradas automaticamente (instâncias).</div>
              <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="p-3">ID</th>
                      <th className="p-3">Título</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Prevista</th>
                      <th className="p-3">Atribuída</th>
                      <th className="p-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tarefas.length ? (
                      tarefas.map((t) => (
                        <tr key={t.id} className="border-t">
                          <td className="p-3">{t.id}</td>
                          <td className="p-3">
                            <div className="font-medium">{t.tituloTarefa}</div>
                            <div className="text-xs text-slate-500">{t.descricaoTarefa || ""}</div>
                          </td>
                          <td className="p-3">{t.status}</td>
                          <td className="p-3">{fmtDateTime(t.previstaPara)}</td>
                          <td className="p-3">{t.idUsuarioAtribuido ? String(t.idUsuarioAtribuido) : "-"}</td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              <button
                                className="rounded border px-3 py-1 text-xs"
                                type="button"
                                onClick={async () => {
                                  await AutomacoesApi.alterarStatusInstancia(t.id, "INICIAR");
                                  await carregar();
                                }}
                              >
                                Iniciar
                              </button>
                              <button
                                className="rounded border px-3 py-1 text-xs"
                                type="button"
                                onClick={async () => {
                                  await AutomacoesApi.alterarStatusInstancia(t.id, "CONCLUIR");
                                  await carregar();
                                }}
                              >
                                Concluir
                              </button>
                              <button
                                className="rounded border px-3 py-1 text-xs"
                                type="button"
                                onClick={async () => {
                                  await AutomacoesApi.alterarStatusInstancia(t.id, "CANCELAR");
                                  await carregar();
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={6}>
                          Sem tarefas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "POLITICAS" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm text-slate-600">Políticas de SLA.</div>
                <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setNovaPoliticaOpen((v) => !v)}>
                  Nova política
                </button>
              </div>

              {novaPoliticaOpen ? (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Nome</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={novaPolitica.nome} onChange={(e) => setNovaPolitica((p) => ({ ...p, nome: e.target.value }))} />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Módulo</div>
                      <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={novaPolitica.modulo} onChange={(e) => setNovaPolitica((p) => ({ ...p, modulo: e.target.value }))}>
                        <option value="RH">RH</option>
                        <option value="SST">SST</option>
                        <option value="SUPRIMENTOS">Suprimentos</option>
                        <option value="ENGENHARIA">Engenharia</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Chave</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={novaPolitica.chavePendencia} onChange={(e) => setNovaPolitica((p) => ({ ...p, chavePendencia: e.target.value }))} />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Entidade tipo</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={novaPolitica.entidadeTipo} onChange={(e) => setNovaPolitica((p) => ({ ...p, entidadeTipo: e.target.value }))} />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Prazo (min)</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" type="number" value={novaPolitica.prazoMinutos} onChange={(e) => setNovaPolitica((p) => ({ ...p, prazoMinutos: Number(e.target.value) }))} />
                    </label>
                    <label className="text-sm">
                      <div className="mb-1 text-xs text-slate-500">Alertar antes (min)</div>
                      <input className="w-full rounded-lg border px-3 py-2 text-sm" type="number" value={novaPolitica.alertaAntesMinutos} onChange={(e) => setNovaPolitica((p) => ({ ...p, alertaAntesMinutos: Number(e.target.value) }))} />
                    </label>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={novaPolitica.notificarNoApp} onChange={(e) => setNovaPolitica((p) => ({ ...p, notificarNoApp: e.target.checked }))} />
                      Notificar no app
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={novaPolitica.enviarEmail} onChange={(e) => setNovaPolitica((p) => ({ ...p, enviarEmail: e.target.checked }))} />
                      Enviar e-mail
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={novaPolitica.criaTarefaQuandoVencer} onChange={(e) => setNovaPolitica((p) => ({ ...p, criaTarefaQuandoVencer: e.target.checked }))} />
                      Criar tarefa ao vencer
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={novaPolitica.ativo} onChange={(e) => setNovaPolitica((p) => ({ ...p, ativo: e.target.checked }))} />
                      Ativo
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg border px-4 py-2 text-sm"
                      type="button"
                      onClick={async () => {
                        await AutomacoesApi.criarPolitica(novaPolitica);
                        setNovaPoliticaOpen(false);
                        await carregar();
                      }}
                    >
                      Salvar
                    </button>
                    <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => setNovaPoliticaOpen(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="p-3">Nome</th>
                      <th className="p-3">Módulo</th>
                      <th className="p-3">Chave</th>
                      <th className="p-3">Prazo</th>
                      <th className="p-3">Ativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {politicas.length ? (
                      politicas.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-3">{p.nome}</td>
                          <td className="p-3">{p.modulo}</td>
                          <td className="p-3">{p.chavePendencia}</td>
                          <td className="p-3">{p.prazoMinutos} min</td>
                          <td className="p-3">{p.ativo ? "Sim" : "Não"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={5}>
                          Sem políticas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "OCORRENCIAS" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <select className="rounded-lg border bg-white px-3 py-2 text-sm" value={fOcStatus} onChange={(e) => setFOcStatus(e.target.value)}>
                  <option value="">Status: todos</option>
                  <option value="ABERTA">Aberta</option>
                  <option value="ALERTADA">Alertada</option>
                  <option value="ESCALADA">Escalada</option>
                  <option value="RESOLVIDA">Resolvida</option>
                  <option value="CANCELADA">Cancelada</option>
                </select>
                <select className="rounded-lg border bg-white px-3 py-2 text-sm" value={fOcSev} onChange={(e) => setFOcSev(e.target.value)}>
                  <option value="">Severidade: todas</option>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                  <option value="CRITICA">Crítica</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fOcVencidas} onChange={(e) => setFOcVencidas(e.target.checked)} />
                  Somente vencidas
                </label>
              </div>

              <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="p-3">Título</th>
                      <th className="p-3">Módulo</th>
                      <th className="p-3">Severidade</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Vencimento</th>
                      <th className="p-3">Responsável</th>
                      <th className="p-3">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocorrencias.length ? (
                      ocorrencias.map((o) => (
                        <tr key={o.id} className="border-t">
                          <td className="p-3">
                            <div className="font-medium">{o.titulo}</div>
                            <div className="text-xs text-slate-500">{o.descricao || ""}</div>
                          </td>
                          <td className="p-3">{o.modulo}</td>
                          <td className="p-3">{o.severidade}</td>
                          <td className="p-3">{o.status}</td>
                          <td className="p-3">{fmtDateTime(o.vencimentoEm)}</td>
                          <td className="p-3">{o.idUsuarioResponsavelAtual ? String(o.idUsuarioResponsavelAtual) : "-"}</td>
                          <td className="p-3">{o.rota ? <a className="text-blue-600 hover:underline" href={o.rota}>Abrir</a> : "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={7}>
                          Sem ocorrências.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "EXECUCOES" ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">Histórico dos jobs de automação.</div>
              <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="p-3">ID</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Início</th>
                      <th className="p-3">Fim</th>
                      <th className="p-3">Processado</th>
                      <th className="p-3">Criado</th>
                      <th className="p-3">Notificado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execucoes.length ? (
                      execucoes.map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="p-3">{e.id}</td>
                          <td className="p-3">{e.tipoExecucao}</td>
                          <td className="p-3">{e.status}</td>
                          <td className="p-3">{fmtDateTime(e.iniciadoEm)}</td>
                          <td className="p-3">{fmtDateTime(e.finalizadoEm)}</td>
                          <td className="p-3">{e.totalProcessado}</td>
                          <td className="p-3">{e.totalCriado}</td>
                          <td className="p-3">{e.totalNotificado}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-slate-500" colSpan={8}>
                          Sem execuções.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

