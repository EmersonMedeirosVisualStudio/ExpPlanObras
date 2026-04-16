"use client";

import { useEffect, useMemo, useState } from "react";
import { PortalGestorApi } from "@/lib/modules/portal-gestor/api";
import type { PortalGestorAgendaDTO, PortalGestorAtalhoDTO, PortalGestorEquipeItemDTO, PortalGestorPendenciaDTO, PortalGestorResumoDTO, PortalGestorSstLocalDTO, PortalGestorSuprimentosDTO, PortalGestorTipoLocal } from "@/lib/modules/portal-gestor/types";

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("pt-BR");
}

function toneClass(t: string) {
  if (t === "CRITICA") return "border-red-200 bg-red-50 text-red-800";
  if (t === "ALTA") return "border-amber-200 bg-amber-50 text-amber-900";
  if (t === "MEDIA") return "border-blue-200 bg-blue-50 text-blue-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function PortalGestorClient() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [filtros, setFiltros] = useState<any | null>(null);
  const [layout, setLayout] = useState<any | null>(null);

  const [tipoLocal, setTipoLocal] = useState<PortalGestorTipoLocal | "">("");
  const [idObra, setIdObra] = useState<number | null>(null);
  const [idUnidade, setIdUnidade] = useState<number | null>(null);
  const [dataReferencia, setDataReferencia] = useState<string>(todayIsoDate());

  const [resumo, setResumo] = useState<PortalGestorResumoDTO | null>(null);
  const [equipe, setEquipe] = useState<PortalGestorEquipeItemDTO[]>([]);
  const [pendencias, setPendencias] = useState<PortalGestorPendenciaDTO[]>([]);
  const [agenda, setAgenda] = useState<PortalGestorAgendaDTO[]>([]);
  const [atalhos, setAtalhos] = useState<PortalGestorAtalhoDTO[]>([]);
  const [sst, setSst] = useState<PortalGestorSstLocalDTO | null>(null);
  const [suprimentos, setSuprimentos] = useState<PortalGestorSuprimentosDTO | null>(null);

  const widgetsVisiveis = useMemo(() => {
    const ws = layout?.widgets || [];
    if (!Array.isArray(ws) || !ws.length) return null;
    const map = new Map<string, boolean>();
    for (const w of ws) map.set(String(w.widgetCodigo), Boolean(w.visivel));
    return map;
  }, [layout]);

  function widgetOn(key: string) {
    if (!widgetsVisiveis) return true;
    return widgetsVisiveis.get(key) !== false;
  }

  async function carregarBase() {
    setErro(null);
    try {
      const [f, l] = await Promise.all([PortalGestorApi.filtros(), PortalGestorApi.obterLayout().catch(() => null)]);
      setFiltros(f);
      setLayout(l);
      const obras = Array.isArray(f?.obras) ? f.obras : [];
      const unidades = Array.isArray(f?.unidades) ? f.unidades : [];

      if (!tipoLocal) {
        if (obras.length === 1 && unidades.length === 0) {
          setTipoLocal("OBRA");
          setIdObra(Number(obras[0].id));
        } else if (unidades.length === 1 && obras.length === 0) {
          setTipoLocal("UNIDADE");
          setIdUnidade(Number(unidades[0].id));
        }
      }
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar filtros.");
    }
  }

  async function carregarDados() {
    if (!tipoLocal) return;
    if (tipoLocal === "OBRA" && !idObra) return;
    if (tipoLocal === "UNIDADE" && !idUnidade) return;

    setLoading(true);
    setErro(null);
    const params = { tipoLocal: tipoLocal as any, idObra: idObra || undefined, idUnidade: idUnidade || undefined, dataReferencia };

    try {
      const [r, eq, p, a, at, s, sup] = await Promise.all([
        PortalGestorApi.resumo(params),
        PortalGestorApi.equipe(params).catch(() => []),
        PortalGestorApi.pendencias(params).catch(() => []),
        PortalGestorApi.agenda(params).catch(() => []),
        PortalGestorApi.atalhos(params).catch(() => []),
        PortalGestorApi.sstLocal(params).catch(() => null),
        PortalGestorApi.suprimentosLocal(params).catch(() => null),
      ]);
      setResumo(r);
      setEquipe(eq);
      setPendencias(p);
      setAgenda(a);
      setAtalhos(at);
      setSst(s);
      setSuprimentos(sup);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarBase();
  }, []);

  useEffect(() => {
    carregarDados();
  }, [tipoLocal, idObra, idUnidade, dataReferencia]);

  const obras = Array.isArray(filtros?.obras) ? filtros.obras : [];
  const unidades = Array.isArray(filtros?.unidades) ? filtros.unidades : [];

  const localLabel = resumo ? `${resumo.tipoLocal === "OBRA" ? "Obra" : "Unidade"} • ${resumo.localNome}` : null;

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Obras — Execução → Portal do Gestor</h1>
          <p className="text-sm text-slate-500">Visão operacional por obra/unidade, equipe do dia e pendências críticas.</p>
          {localLabel ? <div className="mt-1 text-xs text-slate-500">{localLabel}</div> : null}
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <label className="text-xs text-slate-500">
            Tipo
            <select
              className="mt-1 block rounded-md border px-2 py-1 text-sm"
              value={tipoLocal}
              onChange={(e) => {
                const v = e.target.value as any;
                setTipoLocal(v);
                setIdObra(null);
                setIdUnidade(null);
              }}
              disabled={loading}
            >
              <option value="">Selecione</option>
              <option value="OBRA">OBRA</option>
              <option value="UNIDADE">UNIDADE</option>
            </select>
          </label>

          {tipoLocal === "OBRA" ? (
            <label className="text-xs text-slate-500">
              Obra
              <select className="mt-1 block rounded-md border px-2 py-1 text-sm" value={idObra || ""} onChange={(e) => setIdObra(e.target.value ? Number(e.target.value) : null)} disabled={loading}>
                <option value="">Selecione</option>
                {obras.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {tipoLocal === "UNIDADE" ? (
            <label className="text-xs text-slate-500">
              Unidade
              <select className="mt-1 block rounded-md border px-2 py-1 text-sm" value={idUnidade || ""} onChange={(e) => setIdUnidade(e.target.value ? Number(e.target.value) : null)} disabled={loading}>
                <option value="">Selecione</option>
                {unidades.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="text-xs text-slate-500">
            Data
            <input className="mt-1 block rounded-md border px-2 py-1 text-sm" type="date" value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} disabled={loading} />
          </label>

          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregarDados} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      {loading && !resumo ? <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Carregando...</div> : null}

      {widgetOn("RESUMO_LOCAL") && resumo ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Equipe prevista</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo.equipePrevista}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Presentes</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo.equipePresente}</div>
            <div className="mt-1 text-xs text-slate-500">Ausências: {resumo.ausencias}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Atrasos</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800">{resumo.atrasos}</div>
            <div className="mt-1 text-xs text-slate-500">HE pendente: {resumo.horasExtrasPendentes}</div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">Pendências críticas</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800">{(resumo.ncsCriticasAbertas || 0) + (resumo.solicitacoesUrgentes || 0) + (resumo.checklistsPendentes || 0)}</div>
            <div className="mt-1 text-xs text-slate-500">NC: {resumo.ncsCriticasAbertas} • Urgências: {resumo.solicitacoesUrgentes}</div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {widgetOn("EQUIPE_HOJE") ? (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2">
              <div className="text-sm font-semibold text-slate-700">Equipe hoje</div>
              <div className="text-xs text-slate-500">{equipe.length} pessoas</div>
            </div>
            <div className="p-3 space-y-2">
              {equipe.length ? (
                equipe.slice(0, 30).map((m) => (
                  <div key={m.idFuncionario} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{m.nome}</div>
                        <div className="mt-1 text-xs text-slate-500">{[m.cargoNome, m.setorNome].filter(Boolean).join(" • ") || "-"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">{m.situacaoPresenca || "-"}</div>
                        <div className="text-xs text-slate-500">
                          {m.horaEntrada || "-"} → {m.horaSaida || "-"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {m.assinaturaPendente ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Assinatura pendente</span> : null}
                      {m.treinamentoVencido ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-800">Treinamento vencido</span> : null}
                      {m.epiPendente ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-900">EPI pendente</span> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">Nenhum membro retornado para este local.</div>
              )}
            </div>
          </div>
        ) : null}

        {widgetOn("PENDENCIAS_CRITICAS") ? (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2">
              <div className="text-sm font-semibold text-slate-700">Pendências críticas</div>
              <div className="text-xs text-slate-500">{pendencias.length}</div>
            </div>
            <div className="p-3 space-y-2">
              {pendencias.length ? (
                pendencias.slice(0, 20).map((p, idx) => (
                  <a key={`${p.tipo}-${idx}`} href={p.rota || "#"} className={`block rounded-lg border p-3 hover:bg-slate-50 ${toneClass(p.criticidade)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{p.titulo}</div>
                        <div className="mt-1 text-xs opacity-80 truncate">{p.subtitulo}</div>
                      </div>
                      <div className="text-xs opacity-70">{p.prazoEm ? fmtDate(p.prazoEm) : p.criticidade}</div>
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-sm text-slate-500">Sem pendências retornadas.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {widgetOn("AGENDA_OPERACIONAL") ? (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2">
              <div className="text-sm font-semibold text-slate-700">Agenda operacional</div>
              <div className="text-xs text-slate-500">{agenda.length}</div>
            </div>
            <div className="p-3 space-y-2">
              {agenda.length ? (
                agenda.map((a, idx) => (
                  <a key={`${a.tipo}-${idx}`} href={a.rota || "#"} className="block rounded-lg border p-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{a.titulo}</div>
                        <div className="mt-1 text-xs text-slate-500">{a.tipo}</div>
                      </div>
                      <div className="text-xs text-slate-500">{a.prazoEm ? fmtDate(a.prazoEm) : a.status || "-"}</div>
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-sm text-slate-500">Sem itens para esta data.</div>
              )}
            </div>
          </div>
        ) : null}

        {widgetOn("ATALHOS_CAMPO") ? (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-2">
              <div className="text-sm font-semibold text-slate-700">Atalhos de campo</div>
              <div className="text-xs text-slate-500">toque rápido</div>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(atalhos || []).map((a) => (
                <a
                  key={a.key}
                  href={a.enabled ? a.href : "#"}
                  className={`rounded-lg border p-3 text-sm font-medium ${a.enabled ? "hover:bg-slate-50 text-slate-800" : "opacity-50 cursor-not-allowed text-slate-500"}`}
                >
                  {a.label}
                </a>
              ))}
              {!atalhos.length ? <div className="col-span-2 sm:col-span-3 text-sm text-slate-500">Sem atalhos.</div> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {widgetOn("STATUS_SST_LOCAL") && sst ? (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Status SST local</div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Checklists atrasados</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{sst.checklistsAtrasados}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">NCs críticas</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{sst.ncsCriticas}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Acidentes 90d</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{sst.acidentes90d}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Treinamentos vencidos</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{sst.treinamentosVencidos}</div>
              </div>
            </div>
          </div>
        ) : null}

        {widgetOn("SUPRIMENTOS_LOCAL") && suprimentos ? (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Suprimentos local</div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Solicitações abertas</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{suprimentos.solicitacoesAbertas}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Solicitações urgentes</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{suprimentos.solicitacoesUrgentes}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Entregas atrasadas</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{suprimentos.entregasAtrasadas}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-slate-500">Estoque crítico</div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{suprimentos.itensAbaixoMinimo}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

