"use client";

import { useEffect, useState } from "react";
import { AnalyticsApi } from "@/lib/modules/analytics/api";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function fmtDuration(sec?: number | null) {
  if (sec === null || sec === undefined) return "-";
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return "-";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

const TABS = ["SAUDE", "PIPELINES", "EXECUCOES", "DATASETS", "EXTERNOS"] as const;
type TabKey = (typeof TABS)[number];

export default function AnalyticsAdminClient() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [saude, setSaude] = useState<any[]>([]);
  const [execucoes, setExecucoes] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [metricas, setMetricas] = useState<any[]>([]);
  const [tokensExternos, setTokensExternos] = useState<any[]>([]);
  const [tab, setTab] = useState<TabKey>("SAUDE");

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const [s, e, p, d, m] = await Promise.all([
        AnalyticsApi.saude(),
        AnalyticsApi.execucoes(100),
        AnalyticsApi.pipelines().catch(() => []),
        AnalyticsApi.datasets().catch(() => []),
        AnalyticsApi.metricas().catch(() => []),
      ]);
      setSaude(Array.isArray(s) ? s : []);
      setExecucoes(Array.isArray(e) ? e : []);
      setPipelines(Array.isArray(p) ? p : []);
      setDatasets(Array.isArray(d) ? d : []);
      setMetricas(Array.isArray(m) ? m : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar analytics.");
    } finally {
      setLoading(false);
    }
  }

  async function executar(pipelineNome: string) {
    try {
      setLoading(true);
      setErro(null);
      await AnalyticsApi.executar(pipelineNome);
      await carregar();
      alert("Execução disparada.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao executar pipeline.");
    } finally {
      setLoading(false);
    }
  }

  async function reprocessar(pipelineNome: string) {
    const full = confirm("Resetar watermark e reprocessar do zero este pipeline?");
    try {
      setLoading(true);
      setErro(null);
      await AnalyticsApi.reprocessar({ pipelineNome, full });
      await carregar();
      alert("Reprocessamento disparado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao reprocessar pipeline.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarExternos() {
    try {
      const t = await AnalyticsApi.listarExternalTokens(200);
      setTokensExternos(Array.isArray(t) ? t : []);
    } catch {
      setTokensExternos([]);
    }
  }

  async function criarTokenExterno() {
    const nome = (prompt("Nome do acesso externo (ex: PowerBI):") || "").trim();
    if (!nome) return;
    const dataset = (prompt("Datasets (separados por vírgula) ex: rh_presencas_diarias,sst_nc:") || "").trim();
    if (!dataset) return;
    const datasets = dataset
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      setLoading(true);
      setErro(null);
      const res = await AnalyticsApi.criarExternalToken({ nome, datasets });
      await carregarExternos();
      alert(`Token gerado (copie agora): ${res.token}`);
    } catch (e: any) {
      setErro(e?.message || "Erro ao criar token externo.");
    } finally {
      setLoading(false);
    }
  }

  async function desativarTokenExterno(tokenId: number) {
    if (!confirm("Desativar este token?")) return;
    try {
      setLoading(true);
      setErro(null);
      await AnalyticsApi.desativarExternalToken(tokenId);
      await carregarExternos();
    } catch (e: any) {
      setErro(e?.message || "Erro ao desativar token externo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    carregarExternos();
  }, []);

  const healthy = saude.filter((s) => s.ultimoStatus === "SUCESSO").length;
  const falhas = saude.filter((s) => s.ultimoStatus === "ERRO").length;
  const maiorAtraso = saude.reduce((acc, s) => {
    const v = s.atrasadoMinutos !== null && s.atrasadoMinutos !== undefined ? Number(s.atrasadoMinutos) : null;
    if (!v || !Number.isFinite(v)) return acc;
    return acc === null ? v : Math.max(acc, v);
  }, null as number | null);

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Analytics / BI</h1>
          <p className="text-sm text-slate-500">Camada analítica, cargas incrementais e datasets para BI externo.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm ${tab === t ? "bg-slate-900 text-white border-slate-900" : "bg-white hover:bg-slate-50"}`}
            onClick={() => setTab(t)}
          >
            {t === "SAUDE" ? "Saúde" : t === "PIPELINES" ? "Pipelines" : t === "EXECUCOES" ? "Execuções" : t === "DATASETS" ? "Datasets" : "Acessos externos"}
          </button>
        ))}
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      {tab === "SAUDE" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Pipelines saudáveis</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">{healthy}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Falhas recentes</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">{falhas}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Maior atraso (min)</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">{maiorAtraso ?? "-"}</div>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Datasets publicados</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">{datasets.length}</div>
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Saúde das cargas</div>
            <div className="p-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Pipeline</th>
                    <th className="px-2 py-2 text-left font-semibold">Último status</th>
                    <th className="px-2 py-2 text-left font-semibold">Último sucesso</th>
                    <th className="px-2 py-2 text-left font-semibold">Atraso (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {saude.length ? (
                    saude.map((s, idx) => (
                      <tr key={`${s.pipelineNome}-${idx}`} className="border-t">
                        <td className="px-2 py-2">{s.pipelineNome}</td>
                        <td className="px-2 py-2">{s.ultimoStatus || "-"}</td>
                        <td className="px-2 py-2">{fmtDateTime(s.ultimoSucessoEm)}</td>
                        <td className="px-2 py-2">{s.atrasadoMinutos !== null && s.atrasadoMinutos !== undefined ? s.atrasadoMinutos : "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-2 py-3 text-slate-500" colSpan={4}>
                        {loading ? "Carregando..." : "Sem dados."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "PIPELINES" ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Pipelines</div>
          <div className="p-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Nome</th>
                  <th className="px-2 py-2 text-left font-semibold">Status</th>
                  <th className="px-2 py-2 text-left font-semibold">Última execução</th>
                  <th className="px-2 py-2 text-left font-semibold">Duração</th>
                  <th className="px-2 py-2 text-left font-semibold">Watermark</th>
                  <th className="px-2 py-2 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pipelines.length ? (
                  pipelines.map((p) => (
                    <tr key={p.pipelineNome} className="border-t">
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-800">{p.pipelineNome}</div>
                        {p.ultimoExecucaoId ? <div className="text-xs text-slate-500">#{p.ultimoExecucaoId}</div> : null}
                      </td>
                      <td className="px-2 py-2">{p.ultimoStatus || "-"}</td>
                      <td className="px-2 py-2">{fmtDateTime(p.ultimoFim || p.ultimoInicio)}</td>
                      <td className="px-2 py-2">{fmtDuration(p.duracaoSeg)}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">
                        {(p.watermarks || []).length ? (
                          <div className="space-y-1">
                            {(p.watermarks || []).map((w: any) => (
                              <div key={w.origemNome}>
                                {w.origemNome}: {w.ultimoId ?? "-"}
                              </div>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex gap-2 justify-end flex-wrap">
                          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => executar(p.pipelineNome)} disabled={loading}>
                            Executar agora
                          </button>
                          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => reprocessar(p.pipelineNome)} disabled={loading}>
                            Reprocessar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={6}>
                      {loading ? "Carregando..." : "Sem pipelines."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "EXECUCOES" ? (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Execuções</div>
          <div className="p-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Pipeline</th>
                  <th className="px-2 py-2 text-left font-semibold">Status</th>
                  <th className="px-2 py-2 text-left font-semibold">Processado</th>
                  <th className="px-2 py-2 text-left font-semibold">Início</th>
                  <th className="px-2 py-2 text-left font-semibold">Fim</th>
                  <th className="px-2 py-2 text-left font-semibold">Erro</th>
                </tr>
              </thead>
              <tbody>
                {execucoes.length ? (
                  execucoes.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-800">{e.pipelineNome}</div>
                        <div className="text-xs text-slate-500">#{e.id}</div>
                      </td>
                      <td className="px-2 py-2">{e.statusExecucao}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">
                        L:{e.registrosLidos} I:{e.registrosInseridos} U:{e.registrosAtualizados} Ig:{e.registrosIgnorados}
                      </td>
                      <td className="px-2 py-2">{fmtDateTime(e.iniciadoEm)}</td>
                      <td className="px-2 py-2">{fmtDateTime(e.finalizadoEm)}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">{e.mensagemResultado || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={6}>
                      {loading ? "Carregando..." : "Sem execuções."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "DATASETS" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Datasets</div>
            <div className="p-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Dataset</th>
                    <th className="px-2 py-2 text-left font-semibold">Escopo</th>
                    <th className="px-2 py-2 text-left font-semibold">PII</th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.length ? (
                    datasets.map((d) => (
                      <tr key={d.key} className="border-t">
                        <td className="px-2 py-2">
                          <div className="font-medium text-slate-800">{d.key}</div>
                          <div className="text-xs text-slate-500">{d.label}</div>
                        </td>
                        <td className="px-2 py-2">{d.scope}</td>
                        <td className="px-2 py-2">{d.containsPii ? "SIM" : "NÃO"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-2 py-3 text-slate-500" colSpan={3}>
                        {loading ? "Carregando..." : "Sem datasets."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Métricas</div>
            <div className="p-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Métrica</th>
                    <th className="px-2 py-2 text-left font-semibold">Dataset</th>
                  </tr>
                </thead>
                <tbody>
                  {metricas.length ? (
                    metricas.map((m) => (
                      <tr key={m.key} className="border-t">
                        <td className="px-2 py-2">
                          <div className="font-medium text-slate-800">{m.key}</div>
                          <div className="text-xs text-slate-500">{m.label}</div>
                        </td>
                        <td className="px-2 py-2">{m.dataset}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-2 py-3 text-slate-500" colSpan={2}>
                        {loading ? "Carregando..." : "Sem métricas."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "EXTERNOS" ? (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregarExternos} disabled={loading}>
              Atualizar acessos
            </button>
            <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onClick={criarTokenExterno} disabled={loading}>
              Novo token
            </button>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Acessos externos</div>
            <div className="p-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Nome</th>
                    <th className="px-2 py-2 text-left font-semibold">Datasets</th>
                    <th className="px-2 py-2 text-left font-semibold">Expira</th>
                    <th className="px-2 py-2 text-right font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tokensExternos.length ? (
                    tokensExternos.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="px-2 py-2">
                          <div className="font-medium text-slate-800">{t.nome}</div>
                          <div className="text-xs text-slate-500">#{t.id} • {t.ativo ? "ATIVO" : "INATIVO"}</div>
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-600">{Array.isArray(t.datasets) ? t.datasets.join(", ") : "-"}</td>
                        <td className="px-2 py-2">{fmtDateTime(t.expiraEm)}</td>
                        <td className="px-2 py-2 text-right">
                          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => desativarTokenExterno(t.id)} disabled={loading || !t.ativo}>
                            Desativar
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-2 py-3 text-slate-500" colSpan={4}>
                        {loading ? "Carregando..." : "Sem tokens."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

