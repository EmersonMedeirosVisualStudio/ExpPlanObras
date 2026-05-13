"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type ValidacaoRow = {
  item: string;
  codigoServico: string;
  fonte: string;
  servico: string;
  totalPlanilha: number;
  totalComposicao: number;
  diff: number;
  status: "SEM_COMPOSICAO" | "DIVERGENTE" | "OK";
  qtdItens: number;
};

type RefRow = { codigo: string; tipo: string; definida: boolean };
type CatalogListRow = {
  kind: "SERVICO" | "REF";
  item: string;
  codigo: string;
  tipo: string;
  fonte: string;
  descricao: string;
  totalPlanilha: number | null;
  totalComposicao: number | null;
  diff: number | null;
  status: "SEM_COMPOSICAO" | "DIVERGENTE" | "OK";
  definida: boolean | null;
};
type VersaoRow = {
  idPlanilha: number;
  numeroVersao: number;
  nome: string;
  atual: boolean;
  idFonteDados?: number | null;
  idParametros?: number | null;
  fonteNome?: string;
  parametrosNome?: string;
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();

  const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
  const returnTo = search.get("returnTo");
  const planilhaIdParam = search.get("planilhaId");
  const codigoServicoParam = search.get("codigoServico");
  const planilhaIdFromQuery = useMemo(() => {
    const n = Number(planilhaIdParam || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [planilhaIdParam]);
  const focusCodigo = useMemo(() => {
    const c = String(codigoServicoParam || "").trim().toUpperCase();
    return c ? c : null;
  }, [codigoServicoParam]);
  const safeReturnTo = useMemo(() => {
    const raw = String(returnTo || "").trim();
    const isExternal = raw.startsWith("//") || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || /^[a-z][a-z0-9+.-]*:/i.test(raw);
    return raw && !isExternal ? raw : null;
  }, [returnTo]);
  const backHref = useMemo(() => safeReturnTo || `/dashboard/engenharia/obras/${idObra}/planilha`, [idObra, safeReturnTo]);
  const selfHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
    qs.set("returnTo", backHref);
    return `/dashboard/engenharia/obras/${idObra}/planilha/servicos?${qs.toString()}`;
  }, [backHref, idObra, planilhaIdFromQuery]);

  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [planilhaId, setPlanilhaId] = useState<number | null>(null);
  const [versoes, setVersoes] = useState<VersaoRow[]>([]);
  const [rows, setRows] = useState<ValidacaoRow[]>([]);
  const [obraNome, setObraNome] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<{ OK: boolean; SEM_COMPOSICAO: boolean; DIVERGENTE: boolean }>({
    OK: true,
    SEM_COMPOSICAO: true,
    DIVERGENTE: true,
  });
  const [statusSel, setStatusSel] = useState<"TODOS" | "OK" | "SEM_COMPOSICAO" | "DIVERGENTE">("TODOS");
  const [listMode, setListMode] = useState<"TODOS" | "PLANILHADOS" | "NAO_PLANILHADOS">("TODOS");
  const [orderBy, setOrderBy] = useState<"ITEM" | "CODIGO">("ITEM");
  const [textFilter, setTextFilter] = useState("");
  const [fonteFilter, setFonteFilter] = useState<string>("");
  const [showColsCard, setShowColsCard] = useState(false);
  const [colWidths, setColWidths] = useState<{
    item: number;
    codigo: number;
    tipo: number;
    fonte: number;
    servico: number;
    planilha: number;
    composicao: number;
    dif: number;
    status: number;
    acao: number;
  }>({
    item: 90,
    codigo: 100,
    tipo: 120,
    fonte: 90,
    servico: 520,
    planilha: 120,
    composicao: 130,
    dif: 110,
    status: 120,
    acao: 90,
  });
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [composicoesSemServico, setComposicoesSemServico] = useState<{ total: number; codes: string[]; blankCount: number } | null>(null);
  const [copyForm, setCopyForm] = useState<{
    sourcePlanilhaId: number | null;
    targetPlanilhaId: number | null;
    codigoServico: string;
    replaceServico: boolean;
    replaceComposicao: boolean;
    insumosPrecoMode: "MANTER" | "SUBSTITUIR";
  }>({
    sourcePlanilhaId: null,
    targetPlanilhaId: null,
    codigoServico: "",
    replaceServico: false,
    replaceComposicao: false,
    insumosPrecoMode: "MANTER",
  });
  const [copyPreview, setCopyPreview] = useState<{
    existsServicoTarget: boolean;
    existsComposicaoTarget: boolean;
    diffs: Array<{ codigo: string; valorOrig: number; valorDest: number }>;
  } | null>(null);
  const [showCopyCard, setShowCopyCard] = useState(false);
  const [showNovoServicoCard, setShowNovoServicoCard] = useState(false);
  const [novoServicoForm, setNovoServicoForm] = useState<{ codigoServico: string; descricao: string; und: string }>({ codigoServico: "", descricao: "", und: "" });
  const [novoServicoLoading, setNovoServicoLoading] = useState(false);

  async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {}
    return fetch(input, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  }

  const colWidthsKey = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      const id = Number(u?.id);
      if (Number.isFinite(id) && id > 0) return `exp:servicos:col-widths:${id}`;
    } catch {}
    return "exp:servicos:col-widths";
  }, []);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(colWidthsKey);
      if (!raw && colWidthsKey !== "exp:servicos:col-widths") {
        const legacy = localStorage.getItem("exp:servicos:col-widths");
        if (legacy) {
          localStorage.setItem(colWidthsKey, legacy);
          raw = legacy;
        }
      }
      if (!raw) return;
      const p = JSON.parse(raw) as any;
      const n = (v: any, fallback: number) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.max(10, Math.min(1200, Math.round(x))) : fallback;
      };
      setColWidths((cur) => ({
        item: n(p?.item, cur.item),
        codigo: n(p?.codigo, cur.codigo),
        tipo: n(p?.tipo, cur.tipo),
        fonte: n(p?.fonte, cur.fonte),
        servico: n(p?.servico, cur.servico),
        planilha: n(p?.planilha, cur.planilha),
        composicao: n(p?.composicao, cur.composicao),
        dif: n(p?.dif, cur.dif),
        status: n(p?.status, cur.status),
        acao: n(p?.acao, cur.acao),
      }));
    } catch {}
  }, [colWidthsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(colWidthsKey, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths, colWidthsKey]);

  async function carregarPlanilhaAtual() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes-info`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar versões");
      const obra = json?.data?.obra || null;
      setObraNome(String(obra?.nome || obra?.name || "").trim());
      const versoes = Array.isArray(json.data?.versoes) ? json.data.versoes : [];
      const mapped: VersaoRow[] = versoes
        .map((v: any) => ({
          idPlanilha: Number(v?.idPlanilha || 0),
          numeroVersao: Number(v?.numeroVersao || 0),
          nome: String(v?.nome || ""),
          atual: Boolean(v?.atual),
          idFonteDados: v?.idFonteDados == null ? null : Number(v.idFonteDados),
          idParametros: v?.idParametros == null ? null : Number(v.idParametros),
          fonteNome: String(v?.fonteNome || ""),
          parametrosNome: String(v?.parametrosNome || ""),
        }))
        .filter((v: VersaoRow) => Number.isFinite(v.idPlanilha) && v.idPlanilha > 0);
      setVersoes(mapped);
      const byQuery = planilhaIdFromQuery != null ? versoes.find((v: any) => Number(v?.idPlanilha || 0) === Number(planilhaIdFromQuery)) : null;
      const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
      const pick = byQuery || atual || null;
      const pid = pick?.idPlanilha != null ? Number(pick.idPlanilha) : null;
      setPlanilhaId(pid);
      setCopyForm((p) => {
        const targetPlanilhaId = pid != null && pid > 0 ? pid : null;
        const sourcePlanilhaId =
          p.sourcePlanilhaId != null
            ? p.sourcePlanilhaId
            : mapped.find((x) => x.idPlanilha !== targetPlanilhaId)?.idPlanilha ?? mapped[0]?.idPlanilha ?? null;
        return { ...p, targetPlanilhaId, sourcePlanilhaId };
      });
      return pid;
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar versões");
      setPlanilhaId(null);
      setVersoes([]);
      setObraNome("");
      return null;
    }
  }

  async function carregarValidacao(pid: number) {
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/validacao?planilhaId=${pid}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao validar serviços");
      const list = Array.isArray(json.data?.rows) ? (json.data.rows as any[]) : [];
      setRows(
        list.map((r) => ({
          item: String(r.item || "").trim(),
          codigoServico: String(r.codigoServico || "").trim().toUpperCase(),
          fonte: String(r.fonte || "").trim().toUpperCase(),
          servico: String(r.servico || ""),
          totalPlanilha: Number(r.totalPlanilha || 0),
          totalComposicao: Number(r.totalComposicao || 0),
          diff: Number(r.diff || 0),
          status: String(r.status || "OK") as any,
          qtdItens: Number(r.qtdItens || 0),
        }))
      );
    } catch (e: any) {
      setErr(e?.message || "Erro ao validar serviços");
      setRows([]);
    }
  }

  async function carregarReferencias() {
    try {
      const qs = new URLSearchParams();
      const effectivePid = planilhaIdFromQuery ?? planilhaId ?? null;
      if (effectivePid) qs.set("planilhaId", String(effectivePid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/referencias?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar referências");
      const list = Array.isArray(json.data?.referencias) ? (json.data.referencias as any[]) : [];
      setRefs(
        list.map((r) => ({
          codigo: String(r.codigo || "").trim().toUpperCase(),
          tipo: String(r.tipo || ""),
          definida: Boolean(r.definida),
        }))
      );
    } catch {
      setRefs([]);
    }
  }

  async function carregarComposicoesSemServico(pid: number) {
    try {
      const qs = new URLSearchParams();
      qs.set("planilhaId", String(pid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/sem-servico?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setComposicoesSemServico(null);
        return;
      }
      const codes = Array.isArray(json.data?.codes) ? json.data.codes : [];
      setComposicoesSemServico({
        total: Number(json.data?.total || 0),
        blankCount: Number(json.data?.blankCount || 0),
        codes: codes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean),
      });
    } catch {
      setComposicoesSemServico(null);
    }
  }

  async function carregarTudo() {
    if (!idObra) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const pid = await carregarPlanilhaAtual();
      await Promise.all([carregarReferencias(), pid ? Promise.all([carregarValidacao(pid), carregarComposicoesSemServico(pid)]) : Promise.resolve()]);
    } finally {
      setLoading(false);
    }
  }

  const selectedVersao = useMemo(() => {
    const pid = planilhaId != null ? Number(planilhaId) : null;
    if (!pid) return null;
    return versoes.find((v) => Number(v.idPlanilha) === pid) || null;
  }, [planilhaId, versoes]);

  useEffect(() => {
    if (copyForm.insumosPrecoMode !== "MANTER") setCopyForm((p) => ({ ...p, insumosPrecoMode: "MANTER" }));
  }, [copyForm.insumosPrecoMode, copyForm.replaceComposicao]);

  useEffect(() => {
    if (!idObra) return;
    let cancelled = false;
    setBootLoading(true);
    setBootDone(false);
    void (async () => {
      try {
        await carregarTudo();
      } finally {
        if (!cancelled) {
          setBootLoading(false);
          setBootDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idObra]);

  const filteredRows = useMemo(() => {
    const parseItemParts = (s: string) =>
      String(s || "")
        .trim()
        .split(".")
        .filter(Boolean)
        .map((x) => Number(x))
        .map((n) => (Number.isFinite(n) ? n : NaN));
    const cmpItem = (a: string, b: string) => {
      const aa = parseItemParts(a);
      const bb = parseItemParts(b);
      const n = Math.max(aa.length, bb.length);
      for (let i = 0; i < n; i++) {
        const av = aa[i];
        const bv = bb[i];
        const aOk = Number.isFinite(av);
        const bOk = Number.isFinite(bv);
        if (aOk && bOk) {
          if (av !== bv) return av - bv;
          continue;
        }
        const as = String(a || "").trim();
        const bs = String(b || "").trim();
        return as.localeCompare(bs);
      }
      return aa.length - bb.length;
    };

    const merged: CatalogListRow[] = [
      ...rows.map((r) => ({
        kind: "SERVICO" as const,
        item: String(r.item || "").trim(),
        codigo: String(r.codigoServico || "").trim().toUpperCase(),
        tipo: "Serviço",
        fonte: String(r.fonte || "").trim().toUpperCase(),
        descricao: String(r.servico || ""),
        totalPlanilha: Number(r.totalPlanilha || 0),
        totalComposicao: Number(r.totalComposicao || 0),
        diff: Number(r.diff || 0),
        status: r.status,
        definida: null,
      })),
      ...refs.map((r) => ({
        kind: "REF" as const,
        item: "",
        codigo: String(r.codigo || "").trim().toUpperCase(),
        tipo: String(r.tipo || ""),
        fonte: "",
        descricao: "",
        totalPlanilha: null,
        totalComposicao: null,
        diff: null,
        status: r.definida ? ("OK" as const) : ("SEM_COMPOSICAO" as const),
        definida: Boolean(r.definida),
      })),
    ];

    let out = merged.filter((r) => Boolean(statusFilter[r.status]));
    if (listMode === "PLANILHADOS") out = out.filter((r) => r.kind === "REF" || Boolean(String(r.item || "").trim()));
    if (listMode === "NAO_PLANILHADOS") out = out.filter((r) => r.kind === "SERVICO" && !String(r.item || "").trim());

    const fonteSel = String(fonteFilter || "").trim().toUpperCase();
    if (fonteSel) {
      if (fonteSel === "__SEM_FONTE__") out = out.filter((r) => !String(r.fonte || "").trim());
      else out = out.filter((r) => String(r.fonte || "").trim().toUpperCase() === fonteSel);
    }
    const q = String(textFilter || "").trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const code = String(r.codigo || "").trim().toLowerCase();
        const fonte = String(r.fonte || "").trim().toLowerCase();
        const desc = String(r.descricao || "").trim().toLowerCase();
        const tipo = String(r.tipo || "").trim().toLowerCase();
        return code.includes(q) || fonte.includes(q) || desc.includes(q) || tipo.includes(q);
      });
    }
    if (focusCodigo) out = out.filter((r) => String(r.codigo || "").trim().toUpperCase() === focusCodigo);

    out = [...out].sort((a, b) => {
      if (orderBy === "CODIGO") {
        const c = String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR", { numeric: true, sensitivity: "base" });
        if (c !== 0) return c;
      } else {
        const ai = String(a.item || "").trim();
        const bi = String(b.item || "").trim();
        if (ai && bi) {
          const c = cmpItem(ai, bi);
          if (c !== 0) return c;
        } else if (ai && !bi) return -1;
        else if (!ai && bi) return 1;
      }
      return String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR", { numeric: true, sensitivity: "base" });
    });

    return out;
  }, [rows, refs, statusFilter, focusCodigo, listMode, textFilter, fonteFilter, orderBy]);

  const fonteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const f = String(r.fonte || "").trim().toUpperCase();
      if (f) set.add(f);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  useEffect(() => {
    if (!bootDone || !focusCodigo) return;
    const id = `row-${focusCodigo}`;
    const t = setTimeout(() => {
      try {
        const el = document.getElementById(id);
        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [bootDone, focusCodigo, filteredRows.length]);

  useEffect(() => {
    setStatusFilter({
      OK: statusSel === "TODOS" ? true : statusSel === "OK",
      SEM_COMPOSICAO: statusSel === "TODOS" ? true : statusSel === "SEM_COMPOSICAO",
      DIVERGENTE: statusSel === "TODOS" ? true : statusSel === "DIVERGENTE",
    });
  }, [statusSel]);

  async function criarNovoServico() {
    const codigoServico = String(novoServicoForm.codigoServico || "").trim().toUpperCase();
    const descricao = String(novoServicoForm.descricao || "").trim();
    const und = String(novoServicoForm.und || "").trim();
    if (!codigoServico) {
      setErr("Código do serviço é obrigatório.");
      return;
    }
    if (!descricao) {
      setErr("Descrição do serviço é obrigatória.");
      return;
    }
    if (!und) {
      setErr("UND do serviço é obrigatória.");
      return;
    }
    try {
      setNovoServicoLoading(true);
      setErr(null);
      setOkMsg(null);
      const qs = new URLSearchParams();
      const effectivePid = planilhaIdFromQuery ?? planilhaId ?? null;
      if (effectivePid) qs.set("planilhaId", String(effectivePid));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/novo?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoServico, descricao, und }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao criar serviço no catálogo da Fonte");
      setOkMsg("Serviço criado/atualizado no catálogo da Fonte.");
      setNovoServicoForm({ codigoServico: "", descricao: "", und: "" });
      setShowNovoServicoCard(false);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar serviço no catálogo da Fonte");
    } finally {
      setNovoServicoLoading(false);
    }
  }

  async function previewCopiar() {
    if (!copyForm.sourcePlanilhaId || !copyForm.targetPlanilhaId || !copyForm.codigoServico.trim()) {
      setErr("Preencha origem, destino e código do serviço.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      setCopyPreview(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/copiar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanilhaId: copyForm.sourcePlanilhaId,
          targetPlanilhaId: copyForm.targetPlanilhaId,
          codigoServico: copyForm.codigoServico,
          replaceServico: copyForm.replaceServico,
          replaceComposicao: copyForm.replaceComposicao,
          insumosPrecoMode: copyForm.insumosPrecoMode,
          dryRun: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro na prévia da cópia");
      const d = json.data || {};
      setCopyPreview({
        existsServicoTarget: Boolean(d.existsServicoTarget),
        existsComposicaoTarget: Boolean(d.existsComposicaoTarget),
        diffs: Array.isArray(d.diffs)
          ? d.diffs.map((x: any) => ({ codigo: String(x.codigo || ""), valorOrig: Number(x.valorOrig || 0), valorDest: Number(x.valorDest || 0) }))
          : [],
      });
    } catch (e: any) {
      setErr(e?.message || "Erro na prévia da cópia");
      setCopyPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function executarCopiar() {
    if (!copyForm.sourcePlanilhaId || !copyForm.targetPlanilhaId || !copyForm.codigoServico.trim()) {
      setErr("Preencha origem, destino e código do serviço.");
      return;
    }
    try {
      const warnings: string[] = [];
      warnings.push("Se a Fonte do destino for diferente, a cópia cria/atualiza o serviço na Fonte destino (impacta todas as planilhas que usam essa Fonte).");
      if (copyForm.replaceComposicao) warnings.push('Substituir composição pode sobrescrever a composição do serviço na Fonte destino (impacta todas as planilhas que usam essa Fonte).');
      if (copyForm.replaceServico) warnings.push("Substituir serviço no destino irá sobrescrever ITEM/QUANT. do serviço na planilha destino (versão).");
      if (warnings.length) {
        const ok = window.confirm(`${warnings.join("\n\n")}\n\nDeseja continuar?`);
        if (!ok) return;
      }
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/copiar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePlanilhaId: copyForm.sourcePlanilhaId,
          targetPlanilhaId: copyForm.targetPlanilhaId,
          codigoServico: copyForm.codigoServico,
          replaceServico: copyForm.replaceServico,
          replaceComposicao: copyForm.replaceComposicao,
          insumosPrecoMode: copyForm.insumosPrecoMode,
          dryRun: false,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao copiar serviço");
      setOkMsg("Serviço copiado com sucesso.");
      setCopyPreview(null);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao copiar serviço");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageLoadStatusBadge loading={bootLoading || loading} done={bootDone && !bootLoading && !loading} />
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia")} title="Ir para Engenharia">
              Engenharia
            </button>
            <span aria-hidden="true">→</span>
            <button className="hover:underline" type="button" onClick={() => router.push("/dashboard/engenharia/obras")} title="Ir para Obras">
              Obras
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline text-blue-600"
              type="button"
              onClick={() => router.push(`/dashboard/engenharia/obras/${idObra}`)}
              title="Ir para a Obra"
            >
              {`Obra #${idObra}${String(obraNome || "").trim() ? ` - ${obraNome}` : ""}`}
            </button>
            <span aria-hidden="true">→</span>
            <button
              className="hover:underline"
              type="button"
              onClick={() => {
                const qs = new URLSearchParams();
                if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
                qs.set("returnTo", selfHref);
                router.push(`/dashboard/engenharia/obras/${idObra}/planilha?${qs.toString()}`);
              }}
              title="Ir para Planilha orçamentária"
            >
              Planilha orçamentária
            </button>
            {selectedVersao?.idPlanilha ? (
              <>
                <span aria-hidden="true">→</span>
                <span className="text-blue-600">{`planilha #${selectedVersao.idPlanilha} - ${selectedVersao.nome || "—"}`}</span>
              </>
            ) : null}
            <span aria-hidden="true">→</span>
            <span>Serviços</span>
          </div>
          <h1 className="text-2xl font-semibold">Serviços</h1>
          <div className="text-sm text-slate-600">Catálogo técnico de serviços da fonte de dados vinculada à planilha.</div>
          <div className="mt-1 text-sm text-slate-700">
            {selectedVersao?.idPlanilha ? <div className="font-semibold">{`Planilha: #${selectedVersao.idPlanilha} - ${selectedVersao.nome || "—"}`}</div> : null}
            {selectedVersao?.idParametros ? <div>{`Parâmetros: #${selectedVersao.idParametros} - ${selectedVersao.parametrosNome || "—"}`}</div> : null}
            {selectedVersao?.idFonteDados ? <div>{`Fonte de dados: #${selectedVersao.idFonteDados} - ${selectedVersao.fonteNome || "—"}`}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha?${qs.toString()}`);
            }}
            disabled={loading}
            title="Voltar para a tela Planilha orçamentária"
          >
            Planilha
          </button>
          <button
            className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
            type="button"
            onClick={() => router.push(selfHref)}
            disabled={loading}
            title="Abrir o catálogo de serviços da Fonte de dados vinculada à planilha selecionada"
          >
            Serviços (fonte)
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/sinapi?${qs.toString()}`);
            }}
            disabled={loading}
            title="Abrir a tela SINAPI para importar/aplicar serviços e composições"
          >
            SINAPI
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
              qs.set("returnTo", selfHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/insumos?${qs.toString()}`);
            }}
            disabled={loading}
            title="Abrir a tela de Insumos consolidados da planilha selecionada"
          >
            Insumos
          </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() => router.push(backHref)}
            disabled={loading}
            title="Voltar para a tela anterior"
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={carregarTudo} disabled={loading} title="Recarregar dados da tela">
          Atualizar
        </button>
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => setShowNovoServicoCard((v) => !v)}
          disabled={loading}
          title={showNovoServicoCard ? "Ocultar card de cadastro de serviço" : "Cadastrar um serviço no catálogo da Fonte"}
        >
          Novo Serviço
        </button>
        <button
          className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => setShowCopyCard((v) => !v)}
          disabled={loading}
          title={showCopyCard ? "Ocultar card de cópia entre planilhas (versões)" : "Exibir card de cópia entre planilhas (versões)"}
        >
          Copiar
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Atenção: alterações aqui são compartilhadas. Se você alterar Serviço/Insumo/Composição da Fonte, muda em TODAS as planilhas que usam essa Fonte. Se você alterar um
        Parâmetro, muda em TODAS as planilhas que usam esse Parâmetro.
        <div className="mt-2">
          <div className="font-semibold">Para criar um serviço novo no catálogo da Fonte:</div>
          <div className="mt-1">1 - Crie o serviço na Planilha (Adicionar linha);</div>
          <div>2 - Ou através do botão Novo Serviço.</div>
          <div>3 - Crie o serviço direto na composição.</div>
          <div className="mt-1">Informando o CÓDIGO/Fonte/descrição/UND.</div>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {focusCodigo ? (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm text-red-900 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">{`ATENÇÃO: você está filtrado (FOCO) no serviço ${focusCodigo}`}</div>
            <div className="mt-1">A lista abaixo mostra somente este serviço.</div>
          </div>
          <button
            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm hover:bg-red-100 disabled:opacity-60"
            type="button"
            disabled={loading}
            onClick={() => {
              const qs = new URLSearchParams();
              const effectivePid = planilhaIdFromQuery ?? planilhaId ?? null;
              if (effectivePid) qs.set("planilhaId", String(effectivePid));
              qs.set("returnTo", backHref);
              router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos?${qs.toString()}`);
            }}
          >
            Limpar foco
          </button>
        </div>
      ) : null}
      {composicoesSemServico && (composicoesSemServico.total > 0 || composicoesSemServico.blankCount > 0) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Composições sem serviço no catálogo</div>
          <div className="mt-1">{composicoesSemServico.total} código(s) de composição existem em Composições, mas não existem em Serviços (catálogo da fonte).</div>
          {composicoesSemServico.total > 0 ? (
            <div className="mt-2 break-words">
              Códigos: {composicoesSemServico.codes.slice(0, 60).join(", ")}
              {composicoesSemServico.codes.length > 60 ? ` (+${composicoesSemServico.codes.length - 60})` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {showNovoServicoCard ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div>
            <div className="text-lg font-semibold">Novo serviço (catálogo da Fonte)</div>
            <div className="text-sm text-slate-600">Cria/atualiza um serviço no catálogo da Fonte (compartilhado por todas as planilhas que usam esta Fonte).</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3 space-y-1">
              <div className="text-sm text-slate-600">Código</div>
              <input
                className="input bg-white"
                value={novoServicoForm.codigoServico}
                onChange={(e) => setNovoServicoForm((p) => ({ ...p, codigoServico: e.target.value.toUpperCase() }))}
                placeholder="Ex: COMP.UPA.155"
                disabled={loading || novoServicoLoading}
              />
            </div>
            <div className="md:col-span-7 space-y-1">
              <div className="text-sm text-slate-600">Descrição</div>
              <input
                className="input bg-white"
                value={novoServicoForm.descricao}
                onChange={(e) => setNovoServicoForm((p) => ({ ...p, descricao: e.target.value }))}
                placeholder="Ex: Execução de alvenaria..."
                disabled={loading || novoServicoLoading}
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <div className="text-sm text-slate-600">UND</div>
              <input
                className="input bg-white"
                value={novoServicoForm.und}
                onChange={(e) => setNovoServicoForm((p) => ({ ...p, und: e.target.value.toUpperCase() }))}
                placeholder="Ex: m²"
                disabled={loading || novoServicoLoading}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => {
                setNovoServicoForm({ codigoServico: "", descricao: "", und: "" });
                setShowNovoServicoCard(false);
              }}
              disabled={loading || novoServicoLoading}
            >
              Cancelar
            </button>
            <button
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
              type="button"
              onClick={criarNovoServico}
              disabled={loading || novoServicoLoading}
            >
              Salvar
            </button>
          </div>
        </section>
      ) : null}

      {showCopyCard ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-lg font-semibold">Copiar serviço/composição entre planilhas (versões)</div>
          <div className="text-sm text-slate-600">Copia a linha do serviço (ITEM/QUANT.) entre versões. Se a Fonte do destino for diferente, o sistema também pode copiar o serviço e a composição para a Fonte destino.</div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm text-slate-600">Origem (versão)</div>
            <select
              className="input bg-white"
              value={copyForm.sourcePlanilhaId ?? ""}
              onChange={(e) => setCopyForm((p) => ({ ...p, sourcePlanilhaId: e.target.value ? Number(e.target.value) : null }))}
              disabled={loading}
              title="Versão de origem: de onde o serviço/composição será copiado"
            >
              <option value="">(selecione)</option>
              {versoes.map((v) => (
                <option key={v.idPlanilha} value={v.idPlanilha}>
                  #{v.idPlanilha} — Versão {v.numeroVersao} {v.atual ? "(atual)" : ""} {v.nome ? `— ${v.nome}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm font-semibold text-slate-800">Destino (versão)</div>
            <select
              className="input bg-white text-base font-semibold"
              value={copyForm.targetPlanilhaId ?? ""}
              onChange={(e) => setCopyForm((p) => ({ ...p, targetPlanilhaId: e.target.value ? Number(e.target.value) : null }))}
              disabled={loading}
              title="Versão de destino: para onde o serviço/composição será copiado"
            >
              <option value="">(selecione)</option>
              {versoes.map((v) => (
                <option key={v.idPlanilha} value={v.idPlanilha}>
                  #{v.idPlanilha} — Versão {v.numeroVersao} {v.atual ? "(atual)" : ""} {v.nome ? `— ${v.nome}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4 space-y-1">
            <div className="text-sm text-slate-600">Código do serviço</div>
            <input
              className="input bg-white"
              value={copyForm.codigoServico}
              onChange={(e) => setCopyForm((p) => ({ ...p, codigoServico: e.target.value.toUpperCase() }))}
              placeholder="Ex: 100309"
              disabled={loading}
              title="Código do serviço no catálogo (ex.: SINAPI/SBC/Próprio)"
            />
          </div>

          <div className="md:col-span-12 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={copyForm.replaceServico}
                onChange={(e) => setCopyForm((p) => ({ ...p, replaceServico: Boolean(e.target.checked) }))}
                disabled={loading}
                title="Se marcado, sobrescreve ITEM/QUANT. do serviço na planilha destino quando já existir."
              />
              <span>Substituir serviço no destino</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={copyForm.replaceComposicao}
                onChange={(e) => setCopyForm((p) => ({ ...p, replaceComposicao: Boolean(e.target.checked) }))}
                disabled={loading}
                title="Quando marcado e a Fonte do destino for diferente, a composição é copiada mesmo que já exista na Fonte destino (sobrescreve)."
              />
              <span>Substituir composição no destino</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="insumosPrecoMode"
                checked
                onChange={() => null}
                disabled
                title="Preços/itens de composição são geridos na Fonte."
              />
              <span className="text-slate-500">Manter preço de insumos do destino (padrão)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="insumosPrecoMode"
                checked={false}
                onChange={() => null}
                disabled
                title="Preços/itens de composição são geridos na Fonte."
              />
              <span className="text-slate-500">Substituir preço de insumos pelo da origem</span>
            </label>
          </div>

          <div className="md:col-span-12 flex items-center justify-end gap-2 flex-wrap">
            <button
              className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={previewCopiar}
              disabled={loading}
              title="Verificar o que será copiado e se já existe no destino"
            >
              Prévia
            </button>
            <button
              className="rounded-lg border bg-blue-600 px-4 py-2 text-sm text-white border-blue-600 hover:bg-blue-500 disabled:opacity-60"
              type="button"
              onClick={executarCopiar}
              disabled={loading}
              title="Executar a cópia do serviço/composição"
            >
              Copiar
            </button>
          </div>
        </div>

        {copyPreview ? (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-800 space-y-2">
            <div>
              Destino já tem serviço: {copyPreview.existsServicoTarget ? "Sim" : "Não"} • Destino já tem composição: {copyPreview.existsComposicaoTarget ? "Sim" : "Não"}
            </div>
            <div>Observação: a composição é compartilhada pela Fonte. Copiar composição só é relevante quando a Fonte do destino é diferente.</div>
            {copyPreview.diffs.length ? (
              <div className="overflow-auto">
                <table className="min-w-[600px] w-full text-xs">
                  <thead className="text-left text-slate-600">
                    <tr>
                      <th className="py-1 pr-3">INSUMO</th>
                      <th className="py-1 pr-3 text-right">ORIGEM</th>
                      <th className="py-1 pr-3 text-right">DESTINO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copyPreview.diffs.map((d) => (
                      <tr key={d.codigo} className="border-t">
                        <td className="py-1 pr-3">{d.codigo}</td>
                        <td className="py-1 pr-3 text-right">{moeda(d.valorOrig)}</td>
                        <td className="py-1 pr-3 text-right">{moeda(d.valorDest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Serviços e composições referenciadas (catálogo da Fonte)</div>
            <div className="text-sm text-slate-600">
              Lista serviços do catálogo da Fonte e também composições auxiliares/referenciadas (usadas indiretamente), marcando: sem composição/não definida e divergente entre total da planilha e total calculado pela composição.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-slate-600">Planilha: {planilhaId ? `#${planilhaId}` : "—"}</div>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              type="button"
              onClick={() => setShowColsCard((v) => !v)}
              disabled={loading}
              title={showColsCard ? "Ocultar configurações de colunas" : "Exibir configurações de colunas"}
            >
              Colunas
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate-700">Ordenar:</span>
            <select className="input bg-white" value={orderBy} onChange={(e) => setOrderBy(e.target.value as any)} disabled={loading} title="Ordenar a lista">
              <option value="ITEM">Item</option>
              <option value="CODIGO">Código</option>
            </select>
          </label>
          <div className="text-slate-500">
            Mostrando: {filteredRows.length} / {rows.length + refs.length}
          </div>
          {focusCodigo ? (
            <button
              className="rounded border-2 border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-60"
              type="button"
              onClick={() => router.push(selfHref)}
              disabled={loading}
              title="Você está filtrado (foco) em um serviço específico. Clique para limpar."
            >
              {`FOCO ATIVO: ${focusCodigo} (clique para limpar)`}
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 space-y-1" title="Filtra a lista por código do serviço ou descrição (texto livre)">
            <div className="text-xs text-slate-500">Código / Serviço</div>
            <input
              className="input bg-white w-full"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Filtrar por código, fonte ou serviço"
              disabled={loading}
            />
          </label>
          <label className="space-y-1" style={{ width: "160px" }} title="Filtra a lista pela fonte (banco) do serviço">
            <div className="text-xs text-slate-500">Fonte</div>
            <select className="input bg-white w-full" value={fonteFilter} onChange={(e) => setFonteFilter(e.target.value)} disabled={loading}>
              <option value="">(todas as fontes)</option>
              <option value="__SEM_FONTE__">(sem fonte)</option>
              {fonteOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1" style={{ width: "240px" }} title="Define se a lista mostra todos, somente planilhados (direto/indireto) ou não planilhados">
            <div className="text-xs text-slate-500">Itens planilhados</div>
            <select className="input bg-white w-full" value={listMode} onChange={(e) => setListMode(e.target.value as any)} disabled={loading}>
              <option value="TODOS">Todos</option>
              <option value="PLANILHADOS">Somente usados na planilha (direto ou indiretamente)</option>
              <option value="NAO_PLANILHADOS">Não planilhados</option>
            </select>
          </label>
          <label className="space-y-1" style={{ width: "200px" }} title="Filtra por status. Em referências: OK=Definida e Sem composição=Não definida.">
            <div className="text-xs text-slate-500">Status</div>
            <select className="input bg-white w-full" value={statusSel} onChange={(e) => setStatusSel(e.target.value as any)} disabled={loading}>
              <option value="TODOS">Todos</option>
              <option value="OK">OK / Definida</option>
              <option value="SEM_COMPOSICAO">Sem composição / Não definida</option>
              <option value="DIVERGENTE">Divergente</option>
            </select>
          </label>
        </div>

        {showColsCard ? (
          <div className="rounded-lg border bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold text-slate-800">Largura das colunas (px)</div>
              <button className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50" type="button" onClick={() => setShowColsCard(false)} title="Ocultar">
                Ocultar
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {[
                { key: "item", label: "ITEM" },
                { key: "codigo", label: "CÓDIGO" },
                { key: "tipo", label: "TIPO" },
                { key: "fonte", label: "FONTE" },
                { key: "servico", label: "SERVIÇO" },
                { key: "planilha", label: "PLANILHA" },
                { key: "composicao", label: "COMPOSIÇÃO" },
                { key: "dif", label: "DIF." },
                { key: "status", label: "STATUS" },
                { key: "acao", label: "AÇÃO" },
              ].map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1.5">
                  <div className="font-medium text-slate-700">{c.label}</div>
                  <input
                    className="input bg-white w-[92px]"
                    type="number"
                    min={10}
                    max={1200}
                    value={(colWidths as any)[c.key]}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      const next = Number.isFinite(v) ? Math.max(10, Math.min(1200, Math.round(v))) : 120;
                      setColWidths((p) => ({ ...(p as any), [c.key]: next }));
                    }}
                    title="Largura (px)"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="overflow-auto">
          <table className="min-w-[1180px] w-full text-xs" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: `${colWidths.item}px` }} />
              <col style={{ width: `${colWidths.codigo}px` }} />
              <col style={{ width: `${colWidths.tipo}px` }} />
              <col style={{ width: `${colWidths.fonte}px` }} />
              <col style={{ width: `${colWidths.servico}px` }} />
              <col style={{ width: `${colWidths.planilha}px` }} />
              <col style={{ width: `${colWidths.composicao}px` }} />
              <col style={{ width: `${colWidths.dif}px` }} />
              <col style={{ width: `${colWidths.status}px` }} />
              <col style={{ width: `${colWidths.acao}px` }} />
            </colgroup>
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.item}px` }}>
                  ITEM
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.codigo}px` }}>
                  CÓDIGO
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.tipo}px` }}>
                  TIPO
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.fonte}px` }}>
                  FONTE
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.servico}px` }}>
                  SERVIÇO
                </th>
                <th className="px-2 py-1.5 text-right" style={{ width: `${colWidths.planilha}px` }}>
                  PLANILHA
                </th>
                <th className="px-2 py-1.5 text-right" style={{ width: `${colWidths.composicao}px` }}>
                  COMPOSIÇÃO
                </th>
                <th className="px-2 py-1.5 text-right" style={{ width: `${colWidths.dif}px` }}>
                  DIF.
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.status}px` }}>
                  STATUS
                </th>
                <th className="px-2 py-1.5" style={{ width: `${colWidths.acao}px` }}>
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={`${r.kind}-${r.codigo}`}
                  id={`row-${String(r.codigo || "").trim().toUpperCase()}`}
                  className={`border-t ${focusCodigo && String(r.codigo || "").trim().toUpperCase() === focusCodigo ? "bg-red-50" : ""}`}
                >
                  <td className="px-2 py-1.5 font-medium" style={{ width: `${colWidths.item}px` }}>
                    {r.item || "—"}
                  </td>
                  <td className="px-2 py-1.5 font-medium" style={{ width: `${colWidths.codigo}px` }}>
                    {r.codigo || "—"}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: `${colWidths.tipo}px` }}>
                    {r.tipo || "—"}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: `${colWidths.fonte}px` }}>
                    {r.fonte || "—"}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: `${colWidths.servico}px` }}>
                    {r.descricao || "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ width: `${colWidths.planilha}px` }}>
                    {r.totalPlanilha == null ? "—" : moeda(Number(r.totalPlanilha || 0))}
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ width: `${colWidths.composicao}px` }}>
                    {r.totalComposicao == null ? "—" : moeda(Number(r.totalComposicao || 0))}
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ width: `${colWidths.dif}px` }}>
                    {r.diff == null ? "—" : moeda(Number(r.diff || 0))}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.kind === "REF" ? (
                      r.definida ? (
                        <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Definida</span>
                      ) : (
                        <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Não definida</span>
                      )
                    ) : r.status === "OK" ? (
                      <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">OK</span>
                    ) : r.status === "SEM_COMPOSICAO" ? (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Sem composição</span>
                    ) : (
                      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Divergente</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: `${colWidths.acao}px` }}>
                    <button
                      className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      type="button"
                      onClick={() => {
                        const qs = new URLSearchParams();
                        if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
                        qs.set("returnTo", selfHref);
                        router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(r.codigo)}?${qs.toString()}`);
                      }}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
