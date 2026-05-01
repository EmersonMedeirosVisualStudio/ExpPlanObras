 "use client";
 
import { useEffect, useMemo, useRef, useState } from "react";
 import { useParams, useRouter, useSearchParams } from "next/navigation";
 
 type ItemRow = {
  idItemBase: number;
   etapa: string;
   tipoItem: string;
   codigoItem: string;
  banco: string;
   descricao: string;
   und: string;
   quantidade: string;
  valorUnitario: string;
   perdaPercentual: string;
   codigoCentroCusto: string;
  codigoCentroCustoBase: string;
 };
 
type CentroCustoOption = { codigo: string; descricao: string };

type PrevistoPlanilhaRow = {
  item: string;
  servicos: string;
  und: string;
  quant: string;
  valorUnitario: string;
  valorParcial: string;
};

type PlanilhaParams = {
  bdiServicosSbc: number | null;
  bdiServicosSinapi: number | null;
  encSociaisSemDesSbc: number | null;
  encSociaisSemDesSinapi: number | null;
};

 function toNum(v: string) {
   const s = String(v || "").trim();
   if (!s) return null;
   const norm = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
   const n = Number(norm);
   return Number.isFinite(n) ? n : null;
 }
 
function parseNumberLoose(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (cleaned.includes(",")) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeHeader(h: string) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvTextAuto(text: string) {
  const cleaned = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = cleaned
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const first = lines[0];
  const comma = (first.match(/,/g) || []).length;
  const semi = (first.match(/;/g) || []).length;
  const tab = (first.match(/\t/g) || []).length;
  const sep = tab >= comma && tab >= semi ? "\t" : semi >= comma ? ";" : ",";

  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else inQuotes = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === sep) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

async function readTextSmart(file: File) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const win1252 = new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  const score = (t: string) => (t.match(/\uFFFD/g) || []).length * 10 + (t.match(/[ÃÂ]/g) || []).length;
  return score(utf8) <= score(win1252) ? utf8 : win1252;
}

 export default function Page() {
   const router = useRouter();
   const params = useParams();
   const search = useSearchParams();
 
   const idObra = useMemo(() => Number((params as any)?.id || 0), [params]);
   const codigoServico = useMemo(() => decodeURIComponent(String((params as any)?.codigo || "")).trim().toUpperCase(), [params]);
   const returnTo = search.get("returnTo");
 
   const [loading, setLoading] = useState(false);
   const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
   const [itens, setItens] = useState<ItemRow[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoOption[]>([]);
  const [previstoRows, setPrevistoRows] = useState<PrevistoPlanilhaRow[]>([]);
  const [planilhaParams, setPlanilhaParams] = useState<PlanilhaParams | null>(null);
  const [definedComposicoesCodes, setDefinedComposicoesCodes] = useState<Set<string>>(new Set());
  const [bancosCustom, setBancosCustom] = useState<string[]>([]);
  const [editingBancoOutroIdx, setEditingBancoOutroIdx] = useState<number | null>(null);
  const [bancoOutroValue, setBancoOutroValue] = useState("");
  const [importPreview, setImportPreview] = useState<{
    file: File | null;
    rows: Array<{
      rowIndex: number;
      etapa: string;
      tipoItem: string;
      codigoItem: string;
      banco: string;
      descricao: string;
      und: string;
      quantidade: string;
      valorUnitario: string;
      perdaPercentual: string;
      codigoCentroCusto: string;
      errors: Partial<Record<"tipoItem" | "codigoItem" | "descricao" | "und" | "quantidade", string>>;
    }>;
  }>({ file: null, rows: [] });
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [importChoiceInfo, setImportChoiceInfo] = useState<{ existingCount: number; incomingCount: number } | null>(null);
 
   const fileInputRef = useRef<HTMLInputElement | null>(null);
 
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
 
  async function carregar(silent?: boolean) {
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      if (!silent) setOkMsg(null);
       const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`);
       const json = await res.json().catch(() => null);
       if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar composição");
       const list = Array.isArray(json.data?.itens) ? json.data.itens : [];
       setItens(
         list.map((i: any) => ({
          idItemBase: Number(i.idItemBase || 0),
           etapa: String(i.etapa || ""),
           tipoItem: String(i.tipoItem || "INSUMO"),
           codigoItem: String(i.codigoItem || ""),
          banco: String(i.banco || ""),
           descricao: String(i.descricao || ""),
           und: String(i.und || ""),
           quantidade: i.quantidade == null ? "" : String(i.quantidade),
          valorUnitario: i.valorUnitario == null ? "" : String(i.valorUnitario),
           perdaPercentual: i.perdaPercentual == null ? "" : String(i.perdaPercentual),
           codigoCentroCusto: String(i.codigoCentroCusto || ""),
          codigoCentroCustoBase: String(i.codigoCentroCustoBase || ""),
         }))
       );
      if (!silent) setOkMsg("Composição carregada.");
     } catch (e: any) {
       setErr(e?.message || "Erro ao carregar composição");
       setItens([]);
     } finally {
       setLoading(false);
     }
   }
 
   async function salvar() {
     if (!idObra || !codigoServico) return;
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);
       const payload = itens
         .map((i) => ({
           etapa: i.etapa,
           tipoItem: i.tipoItem,
           codigoItem: i.codigoItem,
          banco: i.banco,
           descricao: i.descricao,
           und: i.und,
           quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
           perdaPercentual: i.perdaPercentual,
           codigoCentroCusto: i.codigoCentroCusto,
         }))
         .filter((i) => i.codigoItem.trim() && toNum(i.quantidade) != null);
 
       const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`, {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ itens: payload }),
       });
       const json = await res.json().catch(() => null);
       if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição");
       await carregar();
      setOkMsg("Composição salva com sucesso.");
     } catch (e: any) {
       setErr(e?.message || "Erro ao salvar composição");
     } finally {
       setLoading(false);
     }
   }
 
  async function salvarItens(payload: Array<any>, successMsg: string) {
     try {
       setLoading(true);
       setErr(null);
      setOkMsg(null);
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}/composicao-itens`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: payload }),
      });
       const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar composição");
      await carregar(true);
      setOkMsg(successMsg);
     } catch (e: any) {
      setErr(e?.message || "Erro ao salvar composição");
     } finally {
       setLoading(false);
     }
   }

  function mergeImport(existing: ItemRow[], incoming: ItemRow[]) {
    const keyOf = (i: ItemRow) =>
      [
        String(i.etapa || "").trim().toUpperCase(),
        String(i.tipoItem || "").trim().toUpperCase(),
        String(i.codigoItem || "").trim().toUpperCase(),
        String(i.banco || "").trim().toUpperCase(),
        String(i.descricao || "").trim().toUpperCase(),
        String(i.und || "").trim().toUpperCase(),
        String(i.codigoCentroCusto || "").trim().toUpperCase(),
      ].join("|");
    const map = new Map<string, ItemRow>();
    for (const e of existing) map.set(keyOf(e), { ...e });
    for (const i of incoming) {
      const k = keyOf(i);
      if (!map.has(k)) {
        map.set(k, { ...i });
        continue;
      }
      const cur = map.get(k)!;
      const qCur = parseNumberLoose(cur.quantidade);
      const qInc = parseNumberLoose(i.quantidade);
      const nextQ = (qCur == null ? 0 : qCur) + (qInc == null ? 0 : qInc);
      const vu = String(i.valorUnitario || "").trim() ? i.valorUnitario : cur.valorUnitario;
      const perda = String(i.perdaPercentual || "").trim() ? i.perdaPercentual : cur.perdaPercentual;
      map.set(k, { ...cur, quantidade: nextQ ? String(nextQ) : cur.quantidade, valorUnitario: vu, perdaPercentual: perda });
    }
    return Array.from(map.values());
  }

  async function prepararImportacaoCsv(file: File) {
    if (!idObra || !codigoServico) return;
    try {
      setErr(null);
      setOkMsg(null);
      const text = await readTextSmart(file);
      const { headers, rows } = parseCsvTextAuto(text);
      if (!headers.length || !rows.length) throw new Error("CSV vazio ou inválido");
      const idx: Record<string, number> = Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), i]));
      const get = (r: string[], key: string) => String(r[idx[key]] ?? "").trim();

      const hasOld = idx["codigo_item"] != null || idx["tipo_item"] != null;
      const hasNew = idx["codigo"] != null || idx["tipo"] != null || idx["servico"] != null;
      if (!hasOld && !hasNew) throw new Error("Cabeçalho do CSV inválido");

      const mapTipo = (raw: string) => {
        const v = String(raw || "").trim().toUpperCase();
        if (!v) return "INSUMO";
        if (v.includes("AUXILIAR")) return "COMPOSICAO_AUXILIAR";
        if (v.includes("COMPOSICAO")) return "COMPOSICAO";
        if (v.includes("INSUMO")) return "INSUMO";
        if (v.includes("MAO")) return "MAO_DE_OBRA";
        if (v.includes("EQUIP")) return "EQUIPAMENTO";
        return "";
      };

      const previewRows: (typeof importPreview.rows) = [];
      const incoming: ItemRow[] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const servicoIn = idx["servico"] != null ? get(r, "servico").toUpperCase() : "";
        if (servicoIn && servicoIn !== codigoServico) continue;
        const etapa = idx["etapa"] != null ? get(r, "etapa") : "";
        const tipoRaw = hasOld ? (idx["tipo_item"] != null ? get(r, "tipo_item") : "INSUMO") : get(r, "tipo");
        const tipoItem = mapTipo(tipoRaw);
        const codigoItem = hasOld ? get(r, "codigo_item") : get(r, "codigo");
        const banco = idx["banco"] != null ? get(r, "banco") : "";
        const descricao = idx["descricao"] != null ? get(r, "descricao") : "";
        const und = idx["und"] != null ? get(r, "und") : "";
        const quantidade = get(r, "quantidade");
        const valorUnitario = idx["valor_unit"] != null ? get(r, "valor_unit") : idx["valor_unitario"] != null ? get(r, "valor_unitario") : "";
        const perdaPercentual = idx["perda_percentual"] != null ? get(r, "perda_percentual") : "";
        const codigoCentroCusto = idx["codigo_centro_custo"] != null ? get(r, "codigo_centro_custo") : "";

        const errors: any = {};
        if (!codigoItem) errors.codigoItem = "Obrigatório";
        if (!tipoItem) errors.tipoItem = "Tipo inválido";
        if (!String(descricao || "").trim()) errors.descricao = "Obrigatório";
        if (!String(und || "").trim()) errors.und = "Obrigatório";
        const q = parseNumberLoose(quantidade);
        if (q == null || !(q > 0)) errors.quantidade = "Inválida";

        previewRows.push({
          rowIndex: i,
          etapa,
          tipoItem: tipoItem || "",
          codigoItem,
          banco,
          descricao,
          und,
          quantidade,
          valorUnitario,
          perdaPercentual,
          codigoCentroCusto,
          errors,
        });

        if (Object.keys(errors).length === 0) {
          incoming.push({
            idItemBase: Date.now() + i,
            etapa,
            tipoItem,
            codigoItem,
            banco,
            descricao,
            und,
            quantidade,
            valorUnitario,
            perdaPercentual,
            codigoCentroCusto,
            codigoCentroCustoBase: "",
          });
        }
      }

      if (!previewRows.length) throw new Error("Nenhuma linha aplicável para este serviço no CSV.");
      setImportPreview({ file, rows: previewRows });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setOkMsg(`Prévia carregada: ${incoming.length} linha(s) válida(s) para importação.`);
    } catch (e: any) {
      setImportPreview({ file: null, rows: [] });
      setErr(e?.message || "Erro ao preparar importação");
    }
  }

  async function confirmarImportacao(mode: "REPLACE" | "MERGE") {
    const file = importPreview.file;
    if (!file) return;
    const valid = importPreview.rows.filter((r) => Object.keys(r.errors || {}).length === 0);
    const incoming: ItemRow[] = valid.map((r, i) => ({
      idItemBase: Date.now() + i,
      etapa: r.etapa,
      tipoItem: r.tipoItem,
      codigoItem: r.codigoItem,
      banco: r.banco,
      descricao: r.descricao,
      und: r.und,
      quantidade: r.quantidade,
      valorUnitario: r.valorUnitario,
      perdaPercentual: r.perdaPercentual,
      codigoCentroCusto: r.codigoCentroCusto,
      codigoCentroCustoBase: "",
    }));
    if (!incoming.length) {
      setErr("Não há linhas válidas para importar. Corrija o CSV.");
      return;
    }

    let base = itens;
    if (!base.length) await carregar(true);
    base = itens;

    const finalList = mode === "MERGE" ? mergeImport(base, incoming) : incoming;
    const payload = finalList
      .map((i) => ({
        etapa: i.etapa,
        tipoItem: i.tipoItem,
        codigoItem: i.codigoItem,
        banco: i.banco,
        descricao: i.descricao,
        und: i.und,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
        perdaPercentual: i.perdaPercentual,
        codigoCentroCusto: i.codigoCentroCusto,
      }))
      .filter((i) => String(i.codigoItem || "").trim() && toNum(i.quantidade) != null);

    await salvarItens(payload, mode === "MERGE" ? "CSV importado e mesclado com a composição existente." : "CSV importado substituindo a composição existente.");
    setImportPreview({ file: null, rows: [] });
    setImportChoiceOpen(false);
    setImportChoiceInfo(null);
  }

  async function carregarCentrosCusto() {
    try {
      const res = await authFetch(`/api/v1/engenharia/centros-custo?ativo=1`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setCentrosCusto([]);
        return;
      }
      const lista = Array.isArray(json.data) ? json.data : [];
      setCentrosCusto(lista.map((c: any) => ({ codigo: String(c.codigo), descricao: String(c.descricao || "") })));
    } catch {
      setCentrosCusto([]);
    }
  }

  async function carregarPrevistoPlanilha() {
    if (!idObra || !codigoServico) return;
    try {
      const resV = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?view=versoes`);
      const jsonV = await resV.json().catch(() => null);
      if (!resV.ok || !jsonV?.success) throw new Error(jsonV?.message || "Erro ao carregar versões");
      const versoes = Array.isArray(jsonV.data?.versoes) ? jsonV.data.versoes : [];
      const atual = versoes.find((v: any) => Boolean(v.atual)) || versoes[0] || null;
      const planilhaId = atual?.idPlanilha != null ? Number(atual.idPlanilha) : 0;
      if (!planilhaId) {
        setPrevistoRows([]);
        return;
      }

      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha?planilhaId=${planilhaId}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar planilha");
      const p = (json.data?.planilha?.parametros || {}) as any;
      setPlanilhaParams({
        bdiServicosSbc: p.bdiServicosSbc == null ? null : Number(p.bdiServicosSbc),
        bdiServicosSinapi: p.bdiServicosSinapi == null ? null : Number(p.bdiServicosSinapi),
        encSociaisSemDesSbc: p.encSociaisSemDesSbc == null ? null : Number(p.encSociaisSemDesSbc),
        encSociaisSemDesSinapi: p.encSociaisSemDesSinapi == null ? null : Number(p.encSociaisSemDesSinapi),
      });
      const linhas = Array.isArray(json.data?.planilha?.linhas) ? json.data.planilha.linhas : [];
      const rows = linhas
        .filter((l: any) => String(l.tipoLinha || "").toUpperCase() === "SERVICO" && String(l.codigo || "").trim().toUpperCase() === codigoServico)
        .map((l: any) => ({
          item: String(l.item || ""),
          servicos: String(l.servicos || ""),
          und: String(l.und || ""),
          quant: String(l.quant || ""),
          valorUnitario: String(l.valorUnitario || ""),
          valorParcial: String(l.valorParcial || ""),
        }));
      setPrevistoRows(rows);
    } catch {
      setPrevistoRows([]);
      setPlanilhaParams(null);
    }
  }

  async function carregarComposicoesDefinidas() {
    if (!idObra) return;
    try {
      const res = await authFetch(`/api/v1/engenharia/obras/${idObra}/planilha/composicoes/status`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setDefinedComposicoesCodes(new Set());
        return;
      }
      const codes = Array.isArray(json.data?.codes) ? json.data.codes : [];
      setDefinedComposicoesCodes(new Set(codes.map((c: any) => String(c || "").trim().toUpperCase()).filter(Boolean)));
    } catch {
      setDefinedComposicoesCodes(new Set());
    }
  }

  function baixarModeloComposicoesCsv() {
    const sep = "\t";
    const lines = [
      ["Serviço", "tipo", "codigo", "banco", "descricao", "und", "quantidade", "Valor Unit"].join(sep),
      [`${codigoServico || "SER-0001"}`, "Insumo", "INS-0001", "SINAPI", "Cimento CP-II", "kg", "100", "10,50"].join(sep),
      [`${codigoServico || "SER-0001"}`, "Insumo", "INS-0002", "Próprio", "Areia média", "m³", "0,50", "150,00"].join(sep),
    ];
    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `composicao_servico_${codigoServico || "modelo"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getBancosKey() {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      const id = Number(u?.id);
      if (Number.isFinite(id) && id > 0) return `exp:composicao:bancos:${id}`;
    } catch {}
    return "exp:composicao:bancos";
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getBancosKey());
      const arr = raw ? (JSON.parse(raw) as any[]) : [];
      const list = Array.isArray(arr) ? arr.map((x) => String(x || "").trim()).filter(Boolean) : [];
      setBancosCustom(Array.from(new Set(list)));
    } catch {
      setBancosCustom([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(getBancosKey(), JSON.stringify(bancosCustom));
    } catch {}
  }, [bancosCustom]);

  useEffect(() => {
    if (!idObra || !codigoServico) return;
    carregarCentrosCusto();
    carregar(true);
    carregarPrevistoPlanilha();
    carregarComposicoesDefinidas();
  }, [idObra, codigoServico]);

  const bancosBase = useMemo(() => ["SINAPI", "Próprio", "SBC", "SICRO3"], []);
  const bancosOptions = useMemo(() => Array.from(new Set([...bancosBase, ...bancosCustom])), [bancosBase, bancosCustom]);

  const previstoTotal = useMemo(() => {
    let total = 0;
    for (const r of previstoRows) {
      const n = parseNumberLoose(r.valorParcial);
      if (n != null) total += n;
    }
    return Number(total.toFixed(2));
  }, [previstoRows]);

  const bdiPercent = useMemo(() => {
    const sinapi = planilhaParams?.bdiServicosSinapi;
    const sbc = planilhaParams?.bdiServicosSbc;
    if (sinapi != null && Number.isFinite(sinapi) && sinapi > 0) return sinapi;
    if (sbc != null && Number.isFinite(sbc) && sbc > 0) return sbc;
    return 0;
  }, [planilhaParams]);

  const totalBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const totalComBDI = useMemo(() => {
    const t = totalBase * (1 + Number(bdiPercent || 0) / 100);
    return Number(t.toFixed(2));
  }, [totalBase, bdiPercent]);

  const totalMaoBase = useMemo(() => {
    let total = 0;
    for (const i of itens) {
      if (String(i.tipoItem || "").toUpperCase() !== "MAO_DE_OBRA") continue;
      const q = parseNumberLoose(i.quantidade);
      const v = parseNumberLoose(i.valorUnitario);
      if (q == null || v == null) continue;
      total += q * v;
    }
    return Number(total.toFixed(2));
  }, [itens]);

  const lsPercent = useMemo(() => {
    const sinapi = planilhaParams?.encSociaisSemDesSinapi;
    const sbc = planilhaParams?.encSociaisSemDesSbc;
    if (sinapi != null && Number.isFinite(sinapi) && sinapi > 0) return sinapi;
    if (sbc != null && Number.isFinite(sbc) && sbc > 0) return sbc;
    return 0;
  }, [planilhaParams]);

  const totalComLS = useMemo(() => {
    const mao = totalMaoBase * (1 + Number(lsPercent || 0) / 100);
    const total = (totalBase - totalMaoBase) + mao;
    return Number(total.toFixed(2));
  }, [totalBase, totalMaoBase, lsPercent]);

  const totalComLSComBDI = useMemo(() => {
    const t = totalComLS * (1 + Number(bdiPercent || 0) / 100);
    return Number(t.toFixed(2));
  }, [totalComLS, bdiPercent]);
 
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl text-slate-900">
       <div className="flex items-start justify-between gap-3 flex-wrap">
         <div>
           <div className="text-xs text-slate-500">Engenharia → Obras → Obra selecionada → Planilha orçamentária → Serviço</div>
           <h1 className="text-2xl font-semibold">Composição do serviço {codigoServico || "—"}</h1>
           <div className="text-sm text-slate-600">Importe por CSV ou cadastre manualmente os insumos do serviço.</div>
         </div>
         <div className="flex items-center gap-2 flex-wrap">
           <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push(returnTo || `/dashboard/engenharia/obras/${idObra}/planilha`)}>
             Voltar
           </button>
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={async () => {
              await Promise.all([carregar(), carregarPrevistoPlanilha()]);
            }}
            disabled={loading}
          >
             Carregar
           </button>
           <input
             ref={fileInputRef}
             type="file"
             accept=".csv,text/csv"
             className="hidden"
             onChange={(e) => {
               const f = (e.target.files || [])[0] || null;
               if (f) prepararImportacaoCsv(f);
             }}
           />
           <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}>
             Importar CSV
           </button>
           <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="button" onClick={salvar} disabled={loading}>
             Salvar
           </button>
         </div>
       </div>
 
      <div className="flex flex-wrap gap-2">
        <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={baixarModeloComposicoesCsv} disabled={loading}>
          Modelo CSV (composição)
        </button>
      </div>

      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      {importPreview.file ? (
        <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-lg font-semibold">Prévia da importação (CSV)</div>
              <div className="text-sm text-slate-600">
                Arquivo: <span className="font-medium">{importPreview.file.name}</span> • Válidas:{" "}
                <span className="font-medium">{importPreview.rows.filter((r) => !Object.keys(r.errors || {}).length).length}</span> • Com erros:{" "}
                <span className="font-medium">{importPreview.rows.filter((r) => Object.keys(r.errors || {}).length).length}</span>
              </div>
              {importPreview.rows.some((r) => Object.keys(r.errors || {}).length) ? (
                <div className="mt-2 text-xs text-slate-500">Linhas com erro não serão importadas. Ajuste o CSV se precisar.</div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => setImportPreview({ file: null, rows: [] })}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                type="button"
                onClick={() => {
                  const incomingCount = importPreview.rows.filter((r) => !Object.keys(r.errors || {}).length).length;
                  const existingCount = itens.filter((i) => String(i.codigoItem || "").trim()).length;
                  if (existingCount > 0) {
                    setImportChoiceInfo({ existingCount, incomingCount });
                    setImportChoiceOpen(true);
                    return;
                  }
                  confirmarImportacao("REPLACE");
                }}
                disabled={loading || !importPreview.rows.filter((r) => !Object.keys(r.errors || {}).length).length}
              >
                Confirmar importação
              </button>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Etapa</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Banco</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">UND</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Valor Unit</th>
                  <th className="px-3 py-2">CC</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.slice(0, 200).map((r) => {
                  const cell = (k: keyof typeof r.errors) => (r.errors?.[k] ? "bg-red-50 text-red-700" : "");
                  return (
                    <tr key={r.rowIndex} className="border-t">
                      <td className="px-3 py-2 text-xs text-slate-500">{r.rowIndex + 2}</td>
                      <td className="px-3 py-2">{r.etapa || "—"}</td>
                      <td className={`px-3 py-2 ${cell("tipoItem")}`}>{r.tipoItem || "—"}</td>
                      <td className={`px-3 py-2 ${cell("codigoItem")}`}>{r.codigoItem || "—"}</td>
                      <td className="px-3 py-2">{r.banco || "—"}</td>
                      <td className={`px-3 py-2 ${cell("descricao")}`}>{r.descricao || "—"}</td>
                      <td className={`px-3 py-2 ${cell("und")}`}>{r.und || "—"}</td>
                      <td className={`px-3 py-2 text-right ${cell("quantidade")}`}>{r.quantidade || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.valorUnitario || "—"}</td>
                      <td className="px-3 py-2">{r.codigoCentroCusto || "—"}</td>
                    </tr>
                  );
                })}
                {importPreview.rows.length > 200 ? (
                  <tr className="border-t">
                    <td colSpan={10} className="px-3 py-3 text-xs text-slate-500">
                      Mostrando as primeiras 200 linhas. Total no arquivo: {importPreview.rows.length}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {importChoiceOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Este serviço já tem composição cadastrada</div>
                <div className="text-sm text-slate-600">
                  Atual: <span className="font-medium">{importChoiceInfo?.existingCount ?? itens.length}</span> itens • CSV:{" "}
                  <span className="font-medium">{importChoiceInfo?.incomingCount ?? 0}</span> itens válidos
                </div>
              </div>
              <button className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setImportChoiceOpen(false)} disabled={loading}>
                Fechar
              </button>
            </div>

            <div className="text-sm text-slate-700">Como você quer importar?</div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                type="button"
                onClick={() => confirmarImportacao("MERGE")}
                disabled={loading}
              >
                Mesclar (somar)
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-60"
                type="button"
                onClick={() => confirmarImportacao("REPLACE")}
                disabled={loading}
              >
                Apagar e importar
              </button>
            </div>
          </div>
        </div>
      ) : null}
 
      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Previsto na planilha</div>
            <div className="text-sm text-slate-600">Quant., valor unit. e total previsto para este serviço (se houver mais de 1 linha, aparece separado).</div>
          </div>
          <div className="text-sm text-slate-700">
            Total: <span className="font-semibold">{moeda(Number(previstoTotal || 0))}</span>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">ITEM</th>
                <th className="px-3 py-2">SERVIÇO</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">QUANT.</th>
                <th className="px-3 py-2 text-right">VALOR UNIT.</th>
                <th className="px-3 py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {previstoRows.map((r, idx) => (
                <tr key={`${r.item}-${idx}`} className="border-t">
                  <td className="px-3 py-2">{r.item}</td>
                  <td className="px-3 py-2">{r.servicos}</td>
                  <td className="px-3 py-2">{r.und}</td>
                  <td className="px-3 py-2 text-right">{r.quant}</td>
                  <td className="px-3 py-2 text-right">{r.valorUnitario}</td>
                  <td className="px-3 py-2 text-right">{r.valorParcial ? moeda(Number(parseNumberLoose(r.valorParcial) || 0)) : ""}</td>
                </tr>
              ))}
              {previstoRows.length > 1 ? (
                <tr className="border-t bg-slate-50">
                  <td className="px-3 py-2 font-semibold" colSpan={5}>
                    Totais
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{moeda(Number(previstoTotal || 0))}</td>
                </tr>
              ) : null}
              {!previstoRows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Serviço não encontrado na planilha atual.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-lg font-semibold">Itens (composição)</div>
            <div className="text-sm text-slate-600">Total base: {moeda(Number(totalBase || 0))} • LS: {Number(lsPercent || 0).toFixed(2)}% • BDI: {Number(bdiPercent || 0).toFixed(2)}%</div>
            <div className="text-sm text-slate-600">Total (com LS): {moeda(Number(totalComLS || 0))} • Total (com LS + BDI): {moeda(Number(totalComLSComBDI || 0))}</div>
          </div>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
            type="button"
            onClick={() =>
              setItens((p) => [
                ...p,
                {
                  idItemBase: Date.now(),
                  etapa: "",
                  tipoItem: "INSUMO",
                  codigoItem: "",
                  banco: "",
                  descricao: "",
                  und: "",
                  quantidade: "",
                  valorUnitario: "",
                  perdaPercentual: "",
                  codigoCentroCusto: "",
                  codigoCentroCustoBase: "",
                },
              ])
            }
            disabled={loading}
          >
            Adicionar item
          </button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1500px] w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Banco</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">UND</th>
                <th className="px-3 py-2 text-right">Qtd</th>
                <th className="px-3 py-2 text-right">Valor Unit</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Perda%</th>
                <th className="px-3 py-2">Centro de custo</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((r, idx) => {
                const q = parseNumberLoose(r.quantidade);
                const v = parseNumberLoose(r.valorUnitario);
                const total = q != null && v != null ? q * v : null;
                const bancoInOptions = !r.banco || bancosOptions.includes(r.banco);
                const selectBancoValue = bancoInOptions ? r.banco : "__OUTRO__";
                return (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">
                      <input className="input bg-white" value={r.etapa} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, etapa: e.target.value } : x)))} />
                    </td>
                    <td className="px-3 py-2">
                      <select className="input bg-white" value={r.tipoItem} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, tipoItem: e.target.value } : x)))}>
                        <option value="INSUMO">Insumo</option>
                        <option value="COMPOSICAO">Composição</option>
                        <option value="COMPOSICAO_AUXILIAR">Composição Auxiliar</option>
                        <option value="MAO_DE_OBRA">Mão de obra</option>
                        <option value="EQUIPAMENTO">Equipamento</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input className="input bg-white" value={r.codigoItem} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, codigoItem: e.target.value } : x)))} />
                        {String(r.tipoItem || "").toUpperCase() === "COMPOSICAO" || String(r.tipoItem || "").toUpperCase() === "COMPOSICAO_AUXILIAR" ? (
                          (() => {
                            const codigo = String(r.codigoItem || "").trim().toUpperCase();
                            if (!codigo) return null;
                            const definida = definedComposicoesCodes.has(codigo);
                            return (
                              <div className="flex items-center gap-2">
                                {definida ? (
                                  <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Definida</span>
                                ) : (
                                  <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Não definida</span>
                                )}
                                <button
                                  className="rounded border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigo)}?returnTo=${encodeURIComponent(
                                        `/dashboard/engenharia/obras/${idObra}/planilha/servicos/${encodeURIComponent(codigoServico)}`
                                      )}`
                                    )
                                  }
                                >
                                  Abrir
                                </button>
                              </div>
                            );
                          })()
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <select
                          className="input bg-white"
                          value={selectBancoValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__OUTRO__") {
                              setEditingBancoOutroIdx(idx);
                              setBancoOutroValue("");
                              setItens((p) => p.map((x, i) => (i === idx ? { ...x, banco: "" } : x)));
                              return;
                            }
                            setEditingBancoOutroIdx((cur) => (cur === idx ? null : cur));
                            setItens((p) => p.map((x, i) => (i === idx ? { ...x, banco: v } : x)));
                          }}
                        >
                          <option value="">(sem banco)</option>
                          {bancosOptions.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                          <option value="__OUTRO__">Outro…</option>
                        </select>
                        {editingBancoOutroIdx === idx ? (
                          <input
                            className="input bg-white"
                            placeholder="Digite outro banco"
                            value={bancoOutroValue}
                            onChange={(e) => setBancoOutroValue(e.target.value)}
                            onBlur={() => {
                              const v = String(bancoOutroValue || "").trim();
                              if (!v) {
                                setEditingBancoOutroIdx(null);
                                setBancoOutroValue("");
                                return;
                              }
                              setBancosCustom((p) => (p.includes(v) ? p : [...p, v]));
                              setItens((p) => p.map((x, i) => (i === idx ? { ...x, banco: v } : x)));
                              setEditingBancoOutroIdx(null);
                              setBancoOutroValue("");
                            }}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input className="input bg-white" value={r.descricao} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, descricao: e.target.value } : x)))} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="input bg-white" value={r.und} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, und: e.target.value } : x)))} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input className="input bg-white text-right" value={r.quantidade} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input className="input bg-white text-right" value={r.valorUnitario} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, valorUnitario: e.target.value } : x)))} />
                    </td>
                    <td className="px-3 py-2 text-right">{total == null ? "" : moeda(Number(total))}</td>
                    <td className="px-3 py-2 text-right">
                      <input className="input bg-white text-right" value={r.perdaPercentual} onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, perdaPercentual: e.target.value } : x)))} />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input bg-white"
                        value={r.codigoCentroCusto}
                        onChange={(e) => setItens((p) => p.map((x, i) => (i === idx ? { ...x, codigoCentroCusto: e.target.value } : x)))}
                      >
                        <option value="">(sem CC)</option>
                        {centrosCusto.map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {c.codigo} — {c.descricao}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button className="rounded border px-2 py-1 text-xs text-red-700 disabled:opacity-60" type="button" onClick={() => setItens((p) => p.filter((_, i) => i !== idx))} disabled={loading}>
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!itens.length ? (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                    Sem itens. Clique em Carregar, Importar CSV ou Adicionar item.
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
