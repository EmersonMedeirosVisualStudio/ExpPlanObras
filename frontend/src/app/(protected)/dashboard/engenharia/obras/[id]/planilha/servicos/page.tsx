"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageLoadStatusBadge } from "@/components/PageLoadStatus";

type ValidacaoRow = {
  item: string;
  codigoServico: string;
  servico: string;
  totalPlanilha: number;
  totalComposicao: number;
  diff: number;
  status: "SEM_COMPOSICAO" | "DIVERGENTE" | "OK";
  qtdItens: number;
};

type RefRow = { codigo: string; tipo: string; definida: boolean };
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
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [composicoesSemServico, setComposicoesSemServico] = useState<{ total: number; codes: string[]; blankCount: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
      if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
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
    if (copyForm.replaceComposicao) setCopyForm((p) => ({ ...p, replaceComposicao: false }));
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
    const byStatus = rows.filter((r) => Boolean(statusFilter[r.status]));
    if (!focusCodigo) return byStatus;
    return byStatus.filter((r) => String(r.codigoServico || "").trim().toUpperCase() === focusCodigo);
  }, [rows, statusFilter, focusCodigo]);

  useEffect(() => {
    if (!bootDone || !focusCodigo) return;
    const id = `svc-${focusCodigo}`;
    const t = setTimeout(() => {
      try {
        const el = document.getElementById(id);
        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [bootDone, focusCodigo, filteredRows.length]);

  function baixarModeloComposicoesCsv() {
    const sep = "\t";
    const lines = [
      ["Serviço", "tipo", "codigo", "banco", "descricao", "und", "quantidade", "Valor Unit"].join(sep),
      ["SER-0001", "Insumo", "INS-0001", "SINAPI", "Cimento CP-II", "kg", "100", "10,50"].join(sep),
      ["SER-0001", "Composição Auxiliar", "AUX-0001", "SBC", "Argamassa (auxiliar)", "m³", "0,20", "350,00"].join(sep),
      ["SER-0001", "Composição", "COMP-0001", "Próprio", "Concreto usinado (composição)", "m³", "1", "0"].join(sep),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `composicoes_obra_${idObra}_modelo.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importarComposicoesCsv(file: File) {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const form = new FormData();
      form.append("file", file);
      const qs = new URLSearchParams();
      if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/importar-csv?${qs.toString()}`, { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao importar composições (CSV)");
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao importar composições (CSV)");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      warnings.push("Se a Fonte do destino for diferente, a cópia também cria/atualiza o serviço e a composição na Fonte destino (impacta todas as planilhas que usam essa Fonte).");
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
          replaceComposicao: false,
          insumosPrecoMode: "MANTER",
          dryRun: false,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao copiar serviço/composição");
      setOkMsg("Serviço copiado com sucesso.");
      setCopyPreview(null);
      await carregarTudo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao copiar serviço/composição");
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = (e.target.files || [])[0] || null;
            if (f) importarComposicoesCsv(f);
          }}
        />
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title="Importar itens de composição (insumos/composições auxiliares) por CSV para a Fonte de dados"
        >
          Importar CSV (composições)
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
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
          type="button"
          onClick={baixarModeloComposicoesCsv}
          disabled={loading}
          title="Baixar um modelo de CSV para importação de composições"
        >
          Modelo CSV (composições)
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Atenção: alterações aqui são compartilhadas. Se você alterar Serviço/Insumo/Composição da Fonte, muda em TODAS as planilhas que usam essa Fonte. Se você alterar um
        Parâmetro, muda em TODAS as planilhas que usam esse Parâmetro.
        <div className="mt-1">Para criar um serviço novo no catálogo da Fonte, crie o serviço na Planilha (Adicionar linha) informando o CÓDIGO/descrição/UND.</div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
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

      {showCopyCard ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-lg font-semibold">Copiar serviço/composição entre planilhas (versões)</div>
          <div className="text-sm text-slate-600">
            Copia a linha do serviço (ITEM/QUANT.) entre versões. Se a Fonte do destino for diferente, o sistema também copia o serviço e a composição para a Fonte destino.
          </div>
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
                checked={false}
                onChange={() => null}
                disabled
                title="A composição é da Fonte e não é copiada entre versões. Para alterar composição, edite na Fonte."
              />
              <span className="text-slate-500">Substituir composição no destino</span>
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
            <div>Observação: a composição é compartilhada pela Fonte.</div>
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
            <div className="text-lg font-semibold">Serviços usados na planilha (verificação)</div>
            <div className="text-sm text-slate-600">
              Marca serviços sem composição e serviços com total divergente da planilha. O catálogo da Fonte contém, no mínimo, todos os serviços usados por planilhas que usam esta
              Fonte.
            </div>
          </div>
          <div className="text-sm text-slate-600">Planilha: {planilhaId ? `#${planilhaId}` : "—"}</div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={statusFilter.SEM_COMPOSICAO}
              onChange={(e) => setStatusFilter((p) => ({ ...p, SEM_COMPOSICAO: Boolean(e.target.checked) }))}
            />
            <span className="text-slate-700">Sem composição</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={statusFilter.DIVERGENTE} onChange={(e) => setStatusFilter((p) => ({ ...p, DIVERGENTE: Boolean(e.target.checked) }))} />
            <span className="text-slate-700">Divergente</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={statusFilter.OK} onChange={(e) => setStatusFilter((p) => ({ ...p, OK: Boolean(e.target.checked) }))} />
            <span className="text-slate-700">OK</span>
          </label>
          <div className="text-slate-500">
            Mostrando: {filteredRows.length} / {rows.length}
          </div>
          {focusCodigo ? (
            <button className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => router.push(selfHref)} disabled={loading}>
              {`Foco: ${focusCodigo} (limpar)`}
            </button>
          ) : null}
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">ITEM</th>
                <th className="px-3 py-2">CÓDIGO</th>
                <th className="px-3 py-2">SERVIÇO</th>
                <th className="px-3 py-2 text-right">PLANILHA</th>
                <th className="px-3 py-2 text-right">COMPOSIÇÃO</th>
                <th className="px-3 py-2 text-right">DIF.</th>
                <th className="px-3 py-2">STATUS</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.codigoServico}
                  id={`svc-${String(r.codigoServico || "").trim().toUpperCase()}`}
                  className={`border-t ${focusCodigo && String(r.codigoServico || "").trim().toUpperCase() === focusCodigo ? "bg-amber-50" : ""}`}
                >
                  <td className="px-3 py-2 font-medium">{r.item || "—"}</td>
                  <td className="px-3 py-2 font-medium">{r.codigoServico}</td>
                  <td className="px-3 py-2">{r.servico}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.totalPlanilha || 0))}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.totalComposicao || 0))}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.diff || 0))}</td>
                  <td className="px-3 py-2">
                    {r.status === "OK" ? (
                      <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">OK</span>
                    ) : r.status === "SEM_COMPOSICAO" ? (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Sem composição</span>
                    ) : (
                      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Divergente</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="rounded border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                      type="button"
                      onClick={() => {
                        const qs = new URLSearchParams();
                        if (planilhaIdFromQuery) qs.set("planilhaId", String(planilhaIdFromQuery));
                        qs.set("returnTo", selfHref);
                        router.push(`/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(r.codigoServico)}?${qs.toString()}`);
                      }}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-lg font-semibold">Composições auxiliares / composições referenciadas</div>
          <div className="text-sm text-slate-600">Quando um item é “Composição Auxiliar” ou “Composição”, esta lista mostra se o código já foi definido na Fonte.</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">CÓDIGO</th>
                <th className="px-3 py-2">TIPO</th>
                <th className="px-3 py-2">DEFINIDA</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={`${r.tipo}-${r.codigo}`} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.codigo}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">
                    {r.definida ? (
                      <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Sim</span>
                    ) : (
                      <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Não</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
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
              {!refs.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Sem referências.
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
