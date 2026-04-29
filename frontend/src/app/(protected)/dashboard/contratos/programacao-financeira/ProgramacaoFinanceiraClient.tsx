"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

type ContratoBasic = {
  id: number;
  numeroContrato: string;
  nome: string | null;
  objeto: string | null;
  empresaParceiraNome: string | null;
  vigenciaAtual: string | null;
  valorTotalAtual: number | null;
  planilhaVersao?: number | null;
};

type MedicaoRow = {
  id: number;
  contratoId: number;
  date: string;
  amount: number;
  status: "PENDENTE" | "APROVADO" | "REJEITADO";
};

type ProgramacaoRow = {
  id: number;
  contratoId: number;
  competencia: string;
  valorPrevisto: number;
  createdAt: string;
  updatedAt: string;
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyBR(input: string) {
  const s = String(input || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyBRFromDigits(digits: string) {
  const onlyDigits = (digits || "").replace(/\D/g, "");
  const cents = onlyDigits ? Number(onlyDigits) : 0;
  const value = cents / 100;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ymFromIsoDate(v: string) {
  const s = String(v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return s.slice(0, 7);
}

function safeInternalPath(path: string | null) {
  const raw = String(path || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.includes("://")) return null;
  return raw;
}

function parseInternalPath(path: string | null) {
  const safe = safeInternalPath(path);
  if (!safe) return null;
  try {
    const u = new URL(safe, "https://internal.local");
    return { pathname: u.pathname, searchParams: u.searchParams };
  } catch {
    return null;
  }
}

function labelsFromPath(path: string | null) {
  const parsed = parseInternalPath(path);
  if (!parsed?.pathname) return [];
  const parts = parsed.pathname.split("/").filter(Boolean);
  const segs = parts[0] === "dashboard" ? parts.slice(1) : parts;
  const labels: string[] = [];
  const map: Record<string, string> = {
    engenharia: "Engenharia",
    obras: "Obras",
    contratos: "Contratos",
    programacao-financeira: "Programação financeira",
    medicoes: "Medições",
    aditivos: "Aditivos",
    documentos: "Documentos",
  };
  for (let i = 0; i < segs.length; i++) {
    const seg = String(segs[i] || "");
    const prev = String(segs[i - 1] || "").toLowerCase();
    if (/^\d+$/.test(seg)) {
      if (prev === "obras") labels.push(`Obra #${seg}`);
      else labels.push(`#${seg}`);
      continue;
    }
    const lower = seg.toLowerCase();
    labels.push(map[lower] || (seg.length ? seg[0].toUpperCase() + seg.slice(1) : seg));
  }
  if (parsed.pathname === "/dashboard/contratos") {
    const id = parsed.searchParams.get("id");
    if (id && /^\d+$/.test(id)) labels.push(`Contrato #${id}`);
  }
  return labels.filter(Boolean);
}

export default function ProgramacaoFinanceiraClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("contratoId");
  const returnToParam = safeInternalPath(sp.get("returnTo") || sp.get("from"));
  const returnToStorageKey = "exp:returnTo:contrato-programacao";
  const [returnToStored, setReturnToStored] = useState<string | null>(null);
  const effectiveReturnTo = returnToParam || returnToStored;

  useEffect(() => {
    try {
      setReturnToStored(safeInternalPath(sessionStorage.getItem(returnToStorageKey)));
    } catch {
      setReturnToStored(null);
    }
  }, []);

  useEffect(() => {
    if (!returnToParam) return;
    try {
      sessionStorage.setItem(returnToStorageKey, returnToParam);
      setReturnToStored(returnToParam);
    } catch {}
  }, [returnToParam]);

  const breadcrumb = useMemo(() => {
    const base = labelsFromPath(effectiveReturnTo);
    const out = base.length ? base.slice() : ["Contratos"];
    if (contratoId && !out.includes(`Contrato #${contratoId}`)) out.push(`Contrato #${contratoId}`);
    out.push("Programação financeira");
    return out.join(" → ");
  }, [contratoId, effectiveReturnTo]);

  const navBtnClass = (active: boolean) =>
    active ? "rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" : "rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50";

  const contratoReturnTo = contratoId ? encodeURIComponent(`/dashboard/contratos?id=${contratoId}`) : "";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [contrato, setContrato] = useState<ContratoBasic | null>(null);
  const [medicoes, setMedicoes] = useState<MedicaoRow[]>([]);
  const [programacao, setProgramacao] = useState<Array<ProgramacaoRow & { valorPrevistoInput: string }>>([]);

  const [novaCompetencia, setNovaCompetencia] = useState("");
  const [novoValorPrevisto, setNovoValorPrevisto] = useState("0,00");

  async function carregar() {
    if (!contratoId) return;
    try {
      setLoading(true);
      setErr(null);
      const [cres, mres, pres] = await Promise.all([
        api.get(`/api/contratos/${contratoId}`),
        api.get(`/api/contratos/${contratoId}/medicoes`),
        api.get(`/api/contratos/${contratoId}/programacao-financeira`),
      ]);
      const c: any = cres.data;
      setContrato({
        id: Number(c.id),
        numeroContrato: String(c.numeroContrato || ""),
        nome: c.nome ? String(c.nome) : null,
        objeto: c.objeto ? String(c.objeto) : null,
        empresaParceiraNome: c.empresaParceiraNome ? String(c.empresaParceiraNome) : null,
        vigenciaAtual: c.vigenciaAtual ? String(c.vigenciaAtual) : null,
        valorTotalAtual: c.valorTotalAtual == null ? null : Number(c.valorTotalAtual || 0),
        planilhaVersao: c.planilhaVersao == null ? null : Number(c.planilhaVersao || 0),
      });
      const m = (Array.isArray(mres.data) ? (mres.data as any[]) : []) as any;
      setMedicoes(m);
      const p = (Array.isArray(pres.data) ? (pres.data as any[]) : []) as any[];
      setProgramacao(
        p
          .map((r) => ({
            id: Number(r.id),
            contratoId: Number(r.contratoId),
            competencia: String(r.competencia || ""),
            valorPrevisto: Number(r.valorPrevisto || 0),
            createdAt: String(r.createdAt || ""),
            updatedAt: String(r.updatedAt || ""),
            valorPrevistoInput: formatMoneyBRFromDigits(String(Math.round(Number(r.valorPrevisto || 0) * 100))),
          }))
          .sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)))
      );
    } catch (e: any) {
      setContrato(null);
      setMedicoes([]);
      setProgramacao([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar programação financeira");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [contratoId]);

  const medidoAprovByYm = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of medicoes) {
      if (String(m.status || "").toUpperCase() !== "APROVADO") continue;
      const ym = ymFromIsoDate(m.date);
      if (!ym) continue;
      map.set(ym, (map.get(ym) || 0) + Number(m.amount || 0));
    }
    return map;
  }, [medicoes]);

  async function adicionar() {
    if (!contratoId) return;
    const ym = String(novaCompetencia || "").trim();
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      setErr("Informe uma competência válida (YYYY-MM).");
      return;
    }
    const valor = parseMoneyBR(novoValorPrevisto);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErr("Informe um valor previsto válido.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      await api.post(`/api/contratos/${contratoId}/programacao-financeira`, { competencia: `${ym}-01`, valorPrevisto: valor });
      setNovaCompetencia("");
      setNovoValorPrevisto("0,00");
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao adicionar programação");
    } finally {
      setLoading(false);
    }
  }

  async function salvarLinha(id: number) {
    if (!contratoId) return;
    const row = programacao.find((p) => p.id === id) || null;
    if (!row) return;
    const valor = parseMoneyBR(row.valorPrevistoInput);
    if (!Number.isFinite(valor) || valor <= 0) {
      setErr("Valor previsto inválido.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      await api.put(`/api/contratos/${contratoId}/programacao-financeira/${id}`, { competencia: String(row.competencia || "").slice(0, 10), valorPrevisto: valor });
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar linha");
    } finally {
      setLoading(false);
    }
  }

  async function excluirLinha(id: number) {
    if (!contratoId) return;
    try {
      setLoading(true);
      setErr(null);
      await api.delete(`/api/contratos/${contratoId}/programacao-financeira/${id}`);
      await carregar();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao excluir linha");
    } finally {
      setLoading(false);
    }
  }

  const totalContrato = Number(contrato?.valorTotalAtual || 0) || 0;

  return (
    <div className="p-6 space-y-6 bg-[#f7f8fa] text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-slate-500">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Programação financeira</h1>
          <div className="text-sm text-slate-600">Cadastre a programação de execução financeira e compare com medições aprovadas.</div>
        </div>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          type="button"
          onClick={() => {
            if (effectiveReturnTo) router.push(effectiveReturnTo);
            else if (contratoId) router.push(`/dashboard/contratos?id=${contratoId}`);
            else router.push("/dashboard/contratos");
          }}
        >
          Voltar
        </button>
      </div>

      {contratoId ? (
        <div className="sticky top-0 z-40 -mx-6 px-6 py-3 bg-[#f7f8fa] border-b border-[#e6edf5]">
          <div className="flex flex-wrap gap-2">
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos?id=${contratoId}`)}>
              Contrato
            </button>
            <button
              className={navBtnClass(false)}
              type="button"
              onClick={() => {
                const qp = new URLSearchParams();
                qp.set("tipo", "CONTRATO");
                qp.set("id", String(contratoId));
                qp.set("returnTo", `/dashboard/contratos?id=${contratoId}`);
                router.push(`/dashboard/obras/documentos?${qp.toString()}`);
              }}
            >
              Documentos
            </button>
            <button className={navBtnClass(true)} type="button">
              Programação financeira
            </button>
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${contratoId}&tab=lista&returnTo=${contratoReturnTo}`)}>
              Aditivos
            </button>
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos/medicoes?contratoId=${contratoId}&returnTo=${contratoReturnTo}`)}>
              Medições
            </button>
            <button className={navBtnClass(false)} type="button" onClick={() => router.push(`/dashboard/contratos/aditivos?contratoId=${contratoId}&tab=eventos&returnTo=${contratoReturnTo}`)}>
              Eventos
            </button>
          </div>
        </div>
      ) : null}

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}

      {!contratoId ? (
        <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-2">
          <div className="text-sm font-semibold">Abra pelo contrato</div>
          <div className="text-sm text-slate-600">A tela de programação financeira é acessada pelo contrato selecionado.</div>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-2">
            <div className="text-sm text-slate-500">Contrato</div>
            <div className="text-lg font-semibold">
              {contrato?.numeroContrato || "—"} — {contrato?.nome || contrato?.objeto || "—"}
            </div>
            <div className="text-sm text-slate-600">
              {contrato?.empresaParceiraNome || "Sem empresa"} • Vigência: {contrato?.vigenciaAtual ? new Date(contrato.vigenciaAtual).toLocaleDateString("pt-BR") : "—"} • Valor atual:{" "}
              {contrato?.valorTotalAtual != null ? moeda(Number(contrato.valorTotalAtual || 0)) : "—"} • Planilha v{contrato?.planilhaVersao != null ? Math.trunc(Number(contrato.planilhaVersao || 1)) : 1}
            </div>
          </section>

          <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold">Cadastrar programação</div>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" type="button" onClick={adicionar} disabled={loading || !novaCompetencia}>
                Adicionar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-sm text-slate-600">Competência</div>
                <input className="input bg-white text-slate-900" type="month" value={novaCompetencia} onChange={(e) => setNovaCompetencia(e.target.value)} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Valor previsto</div>
                <input className="input bg-white text-slate-900 text-right" value={novoValorPrevisto} onChange={(e) => setNovoValorPrevisto(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="text-xs text-slate-600">% do contrato</div>
                <div className="text-sm font-semibold">
                  {(() => {
                    const v = parseMoneyBR(novoValorPrevisto);
                    if (!totalContrato || !v) return "—";
                    return `${Math.round((v / totalContrato) * 1000) / 10}%`;
                  })()}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#e6edf5] bg-white p-4 shadow-sm space-y-3">
            <div className="text-sm font-semibold">Programação x Medições executadas</div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Competência</th>
                    <th className="px-3 py-2 text-right">Previsto</th>
                    <th className="px-3 py-2 text-right">% contrato</th>
                    <th className="px-3 py-2 text-right">Medido (aprovado)</th>
                    <th className="px-3 py-2 text-right">Diferença</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {programacao.map((p) => {
                    const ym = ymFromIsoDate(p.competencia);
                    const med = ym ? Number(medidoAprovByYm.get(ym) || 0) : 0;
                    const prev = parseMoneyBR(p.valorPrevistoInput);
                    const dif = prev - med;
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2">{ym || "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            className="input bg-white text-slate-900 text-right h-9 w-40"
                            value={p.valorPrevistoInput}
                            onChange={(e) =>
                              setProgramacao((cur) =>
                                cur.map((x) => (x.id === p.id ? { ...x, valorPrevistoInput: formatMoneyBRFromDigits(e.target.value) } : x))
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{!totalContrato || !prev ? "—" : `${Math.round((prev / totalContrato) * 1000) / 10}%`}</td>
                        <td className="px-3 py-2 text-right">{moeda(med)}</td>
                        <td className={`px-3 py-2 text-right ${dif >= 0 ? "text-emerald-700" : "text-red-700"}`}>{moeda(dif)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={() => salvarLinha(p.id)} disabled={loading}>
                              Salvar
                            </button>
                            <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={() => excluirLinha(p.id)} disabled={loading}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!programacao.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        Nenhuma programação cadastrada.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
