"use client";

import { useEffect, useMemo, useState } from "react";
import { RelatoriosAgendadosApi } from "@/lib/modules/relatorios-agendados/api";
import type {
  RelatorioAgendadoContexto,
  RelatorioAgendadoDTO,
  RelatorioAgendadoExecucaoDTO,
  RelatorioAgendadoSaveDTO,
} from "@/lib/modules/relatorios-agendados/types";
import { useRealtimeEvent } from "@/lib/realtime/hooks";

const CONTEXTOS: RelatorioAgendadoContexto[] = ["CEO", "DIRETOR", "GERENTE", "RH", "SST", "SUPRIMENTOS", "ENGENHARIA"];

function normalizeTime(v: string) {
  const s = String(v || "").trim();
  if (!s) return "08:00:00";
  if (s.length === 5) return `${s}:00`;
  return s;
}

function parseJsonOrNull(text: string): any | null {
  const t = String(text || "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function splitList(text: string) {
  return String(text || "")
    .split(/[\n,;]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

type Draft = {
  id?: number;
  nome: string;
  contexto: RelatorioAgendadoContexto;
  formato: "PDF" | "XLSX" | "AMBOS";
  recorrencia: "DIARIO" | "SEMANAL" | "MENSAL";
  horarioExecucao: string;
  timezone: string;
  diaSemana: number | null;
  diaMes: number | null;
  filtrosText: string;
  widgetsText: string;
  emailsText: string;
  usuariosText: string;
  assuntoEmailTemplate: string;
  corpoEmailTemplate: string;
  ativo: boolean;
};

function emptyDraft(): Draft {
  return {
    nome: "",
    contexto: "RH",
    formato: "PDF",
    recorrencia: "DIARIO",
    horarioExecucao: "08:00",
    timezone: "America/Sao_Paulo",
    diaSemana: 1,
    diaMes: 1,
    filtrosText: "",
    widgetsText: "",
    emailsText: "",
    usuariosText: "",
    assuntoEmailTemplate: "",
    corpoEmailTemplate: "",
    ativo: true,
  };
}

function draftToSaveDTO(d: Draft): RelatorioAgendadoSaveDTO {
  const filtros = parseJsonOrNull(d.filtrosText);
  const widgets = parseJsonOrNull(d.widgetsText);

  const emails = splitList(d.emailsText);
  const usuarios = splitList(d.usuariosText)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    nome: d.nome,
    contexto: d.contexto,
    formato: d.formato,
    recorrencia: d.recorrencia,
    horarioExecucao: normalizeTime(d.horarioExecucao),
    timezone: d.timezone || "America/Sao_Paulo",
    diaSemana: d.recorrencia === "SEMANAL" ? d.diaSemana : null,
    diaMes: d.recorrencia === "MENSAL" ? d.diaMes : null,
    filtros,
    widgets: Array.isArray(widgets) ? widgets : null,
    destinatarios: [
      ...usuarios.map((idUsuario) => ({ tipo: "USUARIO" as const, idUsuario })),
      ...emails.map((emailDestino) => ({ tipo: "EMAIL" as const, emailDestino })),
    ],
    assuntoEmailTemplate: d.assuntoEmailTemplate ? d.assuntoEmailTemplate : null,
    corpoEmailTemplate: d.corpoEmailTemplate ? d.corpoEmailTemplate : null,
    ativo: d.ativo,
  };
}

export default function RelatoriosAgendadosClient() {
  const [items, setItems] = useState<RelatorioAgendadoDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [execucoes, setExecucoes] = useState<RelatorioAgendadoExecucaoDTO[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const data = await RelatoriosAgendadosApi.listar();
      setItems(data);
    } catch (e: any) {
      setErro(String(e?.message || "Erro ao carregar"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarExecucoes(id: number) {
    setExecucoes(null);
    try {
      const data = await RelatoriosAgendadosApi.listarExecucoes(id);
      setExecucoes(data);
    } catch {
      setExecucoes([]);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useRealtimeEvent("relatorios", "relatorio.execucao.changed", async (payload: any) => {
    try {
      await carregar();
      if (selectedId && payload && Number(payload.agendamentoId) === selectedId) {
        await carregarExecucoes(selectedId);
      }
    } catch {}
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios Agendados</h1>
          <p className="text-sm text-slate-600">Envio recorrente de exportação PDF/XLSX dos dashboards por e-mail.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => {
              setDraft(emptyDraft());
              setSelectedId(null);
              setExecucoes(null);
            }}
            type="button"
          >
            Novo
          </button>
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={carregar} type="button">
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div> : null}
      {loading ? <div className="text-sm text-slate-500">Carregando...</div> : null}

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="p-3">Nome</th>
              <th className="p-3">Contexto</th>
              <th className="p-3">Formato</th>
              <th className="p-3">Recorrência</th>
              <th className="p-3">Próxima</th>
              <th className="p-3">Status</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? (
              items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="p-3">{it.nome}</td>
                  <td className="p-3">{it.contexto}</td>
                  <td className="p-3">{it.formato}</td>
                  <td className="p-3">{it.recorrencia}</td>
                  <td className="p-3">{it.proximaExecucaoEm ? new Date(it.proximaExecucaoEm).toLocaleString("pt-BR") : "-"}</td>
                  <td className="p-3">{it.status}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded border px-3 py-1 text-xs"
                        onClick={async () => {
                          try {
                            const det = await RelatoriosAgendadosApi.obter(it.id);
                            const d = emptyDraft();
                            d.id = it.id;
                            d.nome = det.agendamento.nome;
                            d.contexto = det.agendamento.contexto;
                            d.formato = det.agendamento.formato;
                            d.recorrencia = det.agendamento.recorrencia;
                            d.horarioExecucao = String(det.agendamento.horarioExecucao || "08:00").slice(0, 5);
                            d.timezone = det.agendamento.timezone || "America/Sao_Paulo";
                            d.diaSemana = det.agendamento.diaSemana ?? 1;
                            d.diaMes = det.agendamento.diaMes ?? 1;
                            d.filtrosText = det.agendamento.filtros ? JSON.stringify(det.agendamento.filtros, null, 2) : "";
                            d.widgetsText = det.agendamento.widgets ? JSON.stringify(det.agendamento.widgets, null, 2) : "";
                            d.assuntoEmailTemplate = (det.agendamento as any).assuntoEmailTemplate || "";
                            d.corpoEmailTemplate = (det.agendamento as any).corpoEmailTemplate || "";
                            d.ativo = !!det.agendamento.ativo;
                            d.usuariosText = det.destinatarios
                              .filter((x) => x.tipo === "USUARIO" && x.idUsuario)
                              .map((x) => String(x.idUsuario))
                              .join("\n");
                            d.emailsText = det.destinatarios
                              .filter((x) => x.tipo === "EMAIL" && x.emailDestino)
                              .map((x) => String(x.emailDestino))
                              .join("\n");
                            setDraft(d);
                            setSelectedId(it.id);
                            carregarExecucoes(it.id);
                          } catch (e: any) {
                            setErro(String(e?.message || "Erro ao carregar agendamento"));
                          }
                        }}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="rounded border px-3 py-1 text-xs"
                        onClick={async () => {
                          await RelatoriosAgendadosApi.executarAgora(it.id);
                          carregarExecucoes(it.id);
                        }}
                        type="button"
                      >
                        Executar agora
                      </button>
                      <button
                        className="rounded border px-3 py-1 text-xs"
                        onClick={async () => {
                          await RelatoriosAgendadosApi.alterarStatus(it.id, it.ativo ? "PAUSAR" : "ATIVAR");
                          carregar();
                        }}
                        type="button"
                      >
                        {it.ativo ? "Pausar" : "Ativar"}
                      </button>
                      <button
                        className="rounded border px-3 py-1 text-xs"
                        onClick={() => {
                          setSelectedId(it.id);
                          carregarExecucoes(it.id);
                        }}
                        type="button"
                      >
                        Histórico
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-3 text-slate-500" colSpan={7}>
                  Sem agendamentos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {draft ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="font-medium">{draft.id ? `Editar #${draft.id}` : "Novo agendamento"}</div>
            <button className="rounded border px-3 py-1 text-xs" onClick={() => setDraft(null)} type="button">
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">Nome</div>
              <input className="w-full rounded-lg border px-3 py-2 text-sm" value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={draft.ativo} onChange={(e) => setDraft({ ...draft, ativo: e.target.checked })} />
              Ativo
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Contexto</div>
              <select
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                value={draft.contexto}
                onChange={(e) => setDraft({ ...draft, contexto: e.target.value as any })}
              >
                {CONTEXTOS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Formato</div>
              <select
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                value={draft.formato}
                onChange={(e) => setDraft({ ...draft, formato: e.target.value as any })}
              >
                <option value="PDF">PDF</option>
                <option value="XLSX">XLSX</option>
                <option value="AMBOS">Ambos</option>
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Recorrência</div>
              <select
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                value={draft.recorrencia}
                onChange={(e) => setDraft({ ...draft, recorrencia: e.target.value as any })}
              >
                <option value="DIARIO">Diário</option>
                <option value="SEMANAL">Semanal</option>
                <option value="MENSAL">Mensal</option>
              </select>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Horário</div>
              <input
                type="time"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={draft.horarioExecucao}
                onChange={(e) => setDraft({ ...draft, horarioExecucao: e.target.value })}
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Timezone</div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={draft.timezone}
                onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              />
            </label>

            {draft.recorrencia === "SEMANAL" ? (
              <label className="text-sm">
                <div className="mb-1 text-xs text-slate-500">Dia da semana</div>
                <select
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  value={draft.diaSemana ?? 1}
                  onChange={(e) => setDraft({ ...draft, diaSemana: Number(e.target.value) })}
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
            ) : null}

            {draft.recorrencia === "MENSAL" ? (
              <label className="text-sm">
                <div className="mb-1 text-xs text-slate-500">Dia do mês</div>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  value={draft.diaMes ?? 1}
                  onChange={(e) => setDraft({ ...draft, diaMes: Number(e.target.value) })}
                />
              </label>
            ) : null}

            <label className="text-sm md:col-span-3">
              <div className="mb-1 text-xs text-slate-500">Filtros (JSON)</div>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                rows={4}
                value={draft.filtrosText}
                onChange={(e) => setDraft({ ...draft, filtrosText: e.target.value })}
                placeholder='{"idObra": 123}'
              />
            </label>

            <label className="text-sm md:col-span-3">
              <div className="mb-1 text-xs text-slate-500">Widgets (JSON array)</div>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                rows={3}
                value={draft.widgetsText}
                onChange={(e) => setDraft({ ...draft, widgetsText: e.target.value })}
                placeholder='["RESUMO","ALERTAS"]'
              />
            </label>

            <label className="text-sm md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">Destinatários (e-mails, um por linha)</div>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                rows={3}
                value={draft.emailsText}
                onChange={(e) => setDraft({ ...draft, emailsText: e.target.value })}
                placeholder="financeiro@empresa.com.br"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-xs text-slate-500">Destinatários (IDs de usuário)</div>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono"
                rows={3}
                value={draft.usuariosText}
                onChange={(e) => setDraft({ ...draft, usuariosText: e.target.value })}
                placeholder="12\n45"
              />
            </label>

            <label className="text-sm md:col-span-3">
              <div className="mb-1 text-xs text-slate-500">Assunto (opcional)</div>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={draft.assuntoEmailTemplate}
                onChange={(e) => setDraft({ ...draft, assuntoEmailTemplate: e.target.value })}
              />
            </label>
            <label className="text-sm md:col-span-3">
              <div className="mb-1 text-xs text-slate-500">Corpo (opcional)</div>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm"
                rows={3}
                value={draft.corpoEmailTemplate}
                onChange={(e) => setDraft({ ...draft, corpoEmailTemplate: e.target.value })}
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={async () => {
                setErro(null);
                try {
                  const payload = draftToSaveDTO(draft);
                  if (draft.id) await RelatoriosAgendadosApi.atualizar(draft.id, payload);
                  else await RelatoriosAgendadosApi.criar(payload);
                  setDraft(null);
                  await carregar();
                } catch (e: any) {
                  setErro(String(e?.message || "Erro ao salvar"));
                }
              }}
              type="button"
            >
              Salvar
            </button>
            {draft.id ? (
              <button
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={async () => {
                  await RelatoriosAgendadosApi.executarAgora(draft.id!);
                  await carregarExecucoes(draft.id!);
                }}
                type="button"
              >
                Executar agora
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="font-medium">Histórico: {selected.nome}</div>
              <div className="text-xs text-slate-500">Última execução: {selected.ultimaExecucaoEm ? new Date(selected.ultimaExecucaoEm).toLocaleString("pt-BR") : "-"}</div>
            </div>
            <button className="rounded border px-3 py-1 text-xs" onClick={() => setSelectedId(null)} type="button">
              Fechar
            </button>
          </div>

          {execucoes === null ? (
            <div className="text-sm text-slate-500">Carregando...</div>
          ) : execucoes.length ? (
            <div className="space-y-2">
              {execucoes.map((e) => (
                <div key={e.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      #{e.id} · {e.status}
                    </div>
                    <div className="text-xs text-slate-500">
                      {e.iniciadoEm ? new Date(e.iniciadoEm).toLocaleString("pt-BR") : "-"} →{" "}
                      {e.finalizadoEm ? new Date(e.finalizadoEm).toLocaleString("pt-BR") : "-"}
                    </div>
                  </div>
                  {e.mensagemResultado ? <div className="mt-1 text-xs text-slate-600">{e.mensagemResultado}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                    <div>Destinatários: {e.totalDestinatarios}</div>
                    <div>E-mails: {e.totalEmailsEnfileirados}</div>
                    <div>Arquivos: {e.totalArquivos}</div>
                  </div>
                  {e.arquivos?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {e.arquivos.map((a) => (
                        <a
                          key={a.id}
                          className="rounded border px-3 py-1 text-xs hover:bg-slate-50"
                          href={`/api/v1/relatorios/agendamentos/arquivos/${a.id}/download`}
                        >
                          Baixar {a.formato}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Sem execuções.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
