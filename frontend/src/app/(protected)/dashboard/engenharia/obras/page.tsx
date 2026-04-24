"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { setActiveObra } from "@/lib/obra/active";
import api from "@/lib/api";

type ObraRow = {
  id: number;
  contratoId: number;
  name: string;
  type: "PUBLICA" | "PARTICULAR";
  status: string;
};

type ContratoRow = {
  id: number;
  numeroContrato: string;
  tipoContratante: "PUBLICO" | "PRIVADO" | "PF" | string;
  tipoPapel?: "CONTRATADO" | "CONTRATANTE" | null;
  empresaParceiraNome: string | null;
  empresaParceiraDocumento?: string | null;
};

type ContraparteRow = {
  idContraparte: number;
  nomeRazao: string;
  documento: string | null;
};

const OBRA_STATUS_OPTIONS = [
  "AGUARDANDO_RECURSOS",
  "AGUARDANDO_CONTRATO",
  "AGUARDANDO_OS",
  "NAO_INICIADA",
  "EM_ANDAMENTO",
  "PARADA",
  "FINALIZADA",
] as const;

const OBRA_STATUS_LABEL_MAP: Record<string, string> = {
  AGUARDANDO_RECURSOS: "Aguardando recursos",
  AGUARDANDO_CONTRATO: "Aguardando assinatura do contrato",
  AGUARDANDO_OS: "Aguardando OS",
  NAO_INICIADA: "Não iniciada",
  EM_ANDAMENTO: "Em andamento",
  PARADA: "Parada",
  FINALIZADA: "Finalizada",
};

const OBRA_STATUS_COLOR_MAP: Record<string, string> = {
  AGUARDANDO_RECURSOS: "#EAB308",
  AGUARDANDO_CONTRATO: "#EAB308",
  AGUARDANDO_OS: "#F97316",
  NAO_INICIADA: "#6B7280",
  EM_ANDAMENTO: "#22C55E",
  PARADA: "#EF4444",
  FINALIZADA: "#3B82F6",
};

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

export default function EngenhariaObrasPage() {
  const router = useRouter();
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [contratos, setContratos] = useState<ContratoRow[]>([]);
  const [contrapartes, setContrapartes] = useState<ContraparteRow[]>([]);

  const [statusSel, setStatusSel] = useState<Record<(typeof OBRA_STATUS_OPTIONS)[number], boolean>>(() =>
    Object.fromEntries(OBRA_STATUS_OPTIONS.map((k) => [k, true])) as any
  );
  const [numeroContratoFiltro, setNumeroContratoFiltro] = useState("");
  const [contraparteFiltro, setContraparteFiltro] = useState("");
  const [tipoContratanteFiltro, setTipoContratanteFiltro] = useState<"" | "PUBLICO" | "PRIVADO" | "PF">("");
  const [papelFiltro, setPapelFiltro] = useState<"" | "CONTRATADO" | "CONTRATANTE">("");

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const [obrasRes, contratosRes, contrapartesRes] = await Promise.all([
        api.get("/api/obras"),
        api.get("/api/contratos"),
        api.get("/api/v1/engenharia/contrapartes").catch(() => ({ data: null } as any)),
      ]);

      const obrasData = Array.isArray(obrasRes.data) ? obrasRes.data : [];
      setObras(
        obrasData.map((o: any) => ({
          id: Number(o.id),
          contratoId: Number(o.contratoId || 0),
          name: String(o.name || ""),
          type: (String(o.type || "PARTICULAR").toUpperCase() as any) || "PARTICULAR",
          status: String(o.status || "NAO_INICIADA"),
        }))
      );

      const contratosData = Array.isArray(contratosRes.data) ? contratosRes.data : [];
      setContratos(
        contratosData.map((c: any) => ({
          id: Number(c.id),
          numeroContrato: String(c.numeroContrato || ""),
          tipoContratante: String(c.tipoContratante || ""),
          tipoPapel: (c.tipoPapel ?? null) as any,
          empresaParceiraNome: c.empresaParceiraNome ? String(c.empresaParceiraNome) : null,
          empresaParceiraDocumento: c.empresaParceiraDocumento ? String(c.empresaParceiraDocumento) : null,
        }))
      );

      const cpRaw = (contrapartesRes as any)?.data;
      const cpJson = cpRaw && typeof cpRaw === "object" ? cpRaw : null;
      const cpData = cpJson?.success ? cpJson.data : Array.isArray(cpRaw) ? cpRaw : [];
      setContrapartes(
        (Array.isArray(cpData) ? cpData : []).map((x: any) => ({
          idContraparte: Number(x.idContraparte),
          nomeRazao: String(x.nomeRazao || ""),
          documento: x.documento ? String(x.documento) : null,
        }))
      );
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar obras");
      setObras([]);
      setContratos([]);
      setContrapartes([]);
    } finally {
      setLoading(false);
    }
  }

  const contratoById = useMemo(() => new Map(contratos.map((c) => [c.id, c])), [contratos]);
  const contraparteByDoc = useMemo(() => {
    const m = new Map<string, ContraparteRow>();
    for (const c of contrapartes) {
      const d = onlyDigits(String(c.documento || ""));
      if (d && !m.has(d)) m.set(d, c);
    }
    return m;
  }, [contrapartes]);

  useEffect(() => {
    carregar();
  }, []);

  const contratoNumeroOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contratos) if (c.numeroContrato?.trim()) set.add(c.numeroContrato.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [contratos]);

  const contraparteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of contrapartes) {
      const doc = c.documento ? onlyDigits(c.documento) : "";
      const label = `${c.idContraparte} - ${c.nomeRazao}${doc ? " - " + doc : ""}`;
      if (c.nomeRazao?.trim()) set.add(label);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [contrapartes]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    const numContrato = numeroContratoFiltro.trim();
    const contraparteTxt = contraparteFiltro.trim().toLowerCase();
    const statusAtivos = OBRA_STATUS_OPTIONS.filter((s) => statusSel[s]);
    const totalSelected = statusAtivos.length;
    const hasStatusFilter = totalSelected > 0 && totalSelected < OBRA_STATUS_OPTIONS.length;

    function matchContraparte(contrato: ContratoRow | null) {
      if (!contraparteTxt) return true;
      if (!contrato) return false;
      const docDigits = onlyDigits(String(contrato.empresaParceiraDocumento || ""));
      const cp = docDigits ? contraparteByDoc.get(docDigits) || null : null;
      const label = cp ? `${cp.idContraparte} - ${cp.nomeRazao}${cp.documento ? " - " + onlyDigits(cp.documento) : ""}` : "";
      const fallback = `${contrato.empresaParceiraNome || ""} ${docDigits}`.trim();
      return `${label} ${fallback}`.toLowerCase().includes(contraparteTxt);
    }

    return obras.filter((o) => {
      if (hasStatusFilter && !statusSel[(o.status as any) || "NAO_INICIADA"]) return false;

      const contrato = contratoById.get(o.contratoId) || null;
      if (numContrato && String(contrato?.numeroContrato || "") !== numContrato) return false;
      if (tipoContratanteFiltro && String(contrato?.tipoContratante || "").toUpperCase() !== tipoContratanteFiltro) return false;
      if (papelFiltro && String(contrato?.tipoPapel || "").toUpperCase() !== papelFiltro) return false;
      if (!matchContraparte(contrato)) return false;

      if (!term) return true;
      const contratoTexto = contrato ? `${contrato.numeroContrato} ${contrato.empresaParceiraNome || ""} ${contrato.empresaParceiraDocumento || ""}` : "";
      const hay = `${o.id} ${o.name} ${o.status} ${contratoTexto}`.toLowerCase();
      return hay.includes(term);
    });
  }, [q, numeroContratoFiltro, contraparteFiltro, tipoContratanteFiltro, papelFiltro, obras, contratoById, contraparteByDoc, statusSel]);

  return (
    <div className="p-6 space-y-6 max-w-5xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Engenharia → Obras</h1>
          <div className="text-sm text-slate-600">Selecione uma obra para abrir as janelas operacionais (planejamento, apropriação, equipamentos, insumos e documentos).</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push("/dashboard/obras")}
            disabled={loading}
          >
            Nova obra
          </button>
          <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={carregar} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-600">{filtradas.length} obra(s)</div>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => setFiltrosAberto((v) => !v)}
          >
            {filtrosAberto ? "Ocultar filtros" : "Mostrar filtros"}
          </button>
        </div>
        {filtrosAberto ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-6">
                <div className="text-sm text-slate-600">Buscar</div>
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite ID da obra, nome, contrato, contraparte..." />
              </div>
              <div className="md:col-span-3">
                <div className="text-sm text-slate-600">Nº contrato</div>
                <input className="input" list="obrasContratoNumeroList" value={numeroContratoFiltro} onChange={(e) => setNumeroContratoFiltro(e.target.value)} placeholder="Selecione" />
                <datalist id="obrasContratoNumeroList">
                  {contratoNumeroOptions.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="md:col-span-3">
                <div className="text-sm text-slate-600">Contraparte</div>
                <input className="input" list="obrasContraparteList" value={contraparteFiltro} onChange={(e) => setContraparteFiltro(e.target.value)} placeholder="ID - nome - documento" />
                <datalist id="obrasContraparteList">
                  {contraparteOptions.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-3">
                <div className="text-sm text-slate-600">Tipo do contrato</div>
                <select className="input" value={tipoContratanteFiltro} onChange={(e) => setTipoContratanteFiltro(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="PUBLICO">Público</option>
                  <option value="PRIVADO">Privado</option>
                  <option value="PF">PF</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <div className="text-sm text-slate-600">Papel no contrato</div>
                <select className="input" value={papelFiltro} onChange={(e) => setPapelFiltro(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="CONTRATANTE">Contratante</option>
                  <option value="CONTRATADO">Contratado</option>
                </select>
              </div>
              <div className="md:col-span-6">
                <div className="text-sm text-slate-600">Status</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => setStatusSel(Object.fromEntries(OBRA_STATUS_OPTIONS.map((k) => [k, true])) as any)}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => setStatusSel(Object.fromEntries(OBRA_STATUS_OPTIONS.map((k) => [k, false])) as any)}
                  >
                    Nenhum
                  </button>
                  <div className="flex flex-wrap items-center gap-4">
                    {OBRA_STATUS_OPTIONS.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!statusSel[s]} onChange={(e) => setStatusSel((p) => ({ ...p, [s]: e.target.checked } as any))} />
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OBRA_STATUS_COLOR_MAP[s] || "#9CA3AF" }} />
                        <span>{OBRA_STATUS_LABEL_MAP[s] || s}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Obras cadastradas</div>
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Obra</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Nº contrato</th>
                <th className="px-3 py-2">Contraparte</th>
                <th className="px-3 py-2">Tipo do contrato</th>
                <th className="px-3 py-2">Papel no contrato</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o) => {
                const contrato = contratoById.get(o.contratoId) || null;
                const docDigits = onlyDigits(String(contrato?.empresaParceiraDocumento || ""));
                const cp = docDigits ? contraparteByDoc.get(docDigits) || null : null;
                const cpLabel = cp ? `${cp.idContraparte} - ${cp.nomeRazao}${cp.documento ? " - " + onlyDigits(cp.documento) : ""}` : `${contrato?.empresaParceiraNome || "-"}${docDigits ? " - " + docDigits : ""}`;
                return (
                  <tr
                    key={o.id}
                    className="border-t cursor-pointer hover:bg-slate-50"
                    onClick={() => {
                      setActiveObra({ id: o.id, nome: o.name });
                      router.push(`/dashboard/engenharia/obras/${o.id}`);
                    }}
                  >
                    <td className="px-3 py-2">
                      <div className="font-semibold">#{o.id} — {o.name}</div>
                      <div className="text-xs text-slate-500">{o.type === "PUBLICA" ? "Pública" : "Particular"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OBRA_STATUS_COLOR_MAP[o.status] || "#9CA3AF" }} />
                        <span>{OBRA_STATUS_LABEL_MAP[o.status] || o.status}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{contrato?.numeroContrato || "-"}</td>
                    <td className="px-3 py-2">{cpLabel || "-"}</td>
                    <td className="px-3 py-2">{contrato?.tipoContratante ? String(contrato.tipoContratante) : "-"}</td>
                    <td className="px-3 py-2">{contrato?.tipoPapel ? String(contrato.tipoPapel) : "-"}</td>
                  </tr>
                );
              })}
              {!filtradas.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                    Nenhuma obra encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
