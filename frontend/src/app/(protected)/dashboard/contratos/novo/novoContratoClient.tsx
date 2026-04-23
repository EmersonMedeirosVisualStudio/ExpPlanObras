"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Eye, Trash2 } from "lucide-react";

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

function parseDateOnlyInput(value: string) {
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function dateOnlyToString(d: Date) {
  return d.toISOString().slice(0, 10);
}

function diffDaysDateOnly(a: Date, b: Date) {
  const ta = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const tb = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.trunc((tb - ta) / (24 * 60 * 60 * 1000));
}

function addMonthsClamped(base: Date, months: number) {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  const lastDay = new Date(y, m + months + 1, 0).getDate();
  return new Date(y, m + months, Math.min(d, lastDay));
}

function addByUnidade(base: Date, q: number, unidade: "DIAS" | "SEMANAS" | "MESES" | "ANOS") {
  const r = new Date(base);
  if (unidade === "DIAS") {
    r.setDate(r.getDate() + q);
    return r;
  }
  if (unidade === "SEMANAS") {
    r.setDate(r.getDate() + q * 7);
    return r;
  }
  if (unidade === "MESES") return addMonthsClamped(base, q);
  return addMonthsClamped(base, q * 12);
}

function sameDateOnly(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function diffMonthsDateOnly(base: Date, end: Date) {
  const diff = (end.getFullYear() - base.getFullYear()) * 12 + (end.getMonth() - base.getMonth());
  const candidates = [diff, diff - 1, diff + 1].filter((n) => Number.isFinite(n));
  for (const m of candidates) {
    if (m < 0) continue;
    const cand = addMonthsClamped(base, m);
    if (sameDateOnly(cand, end)) return m;
  }
  const days = diffDaysDateOnly(base, end);
  return Math.max(0, Math.round(days / 30));
}

function diffYearsDateOnly(base: Date, end: Date) {
  const months = diffMonthsDateOnly(base, end);
  if (months % 12 === 0) return months / 12;
  return Math.max(0, Math.round(months / 12));
}

export default function NovoContratoClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("id");
  const isEdit = Boolean(contratoId);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [numeroContrato, setNumeroContrato] = useState("");
  const [nome, setNome] = useState("");
  const [objeto, setObjeto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipoPapel, setTipoPapel] = useState<"CONTRATADO" | "CONTRATANTE">("CONTRATADO");
  const [tipoContratante, setTipoContratante] = useState<"PUBLICO" | "PRIVADO" | "PF">("PUBLICO");
  const [contratoVinculadoId, setContratoVinculadoId] = useState<string>("");
  const [contratosVinculo, setContratosVinculo] = useState<Array<{ id: number; numeroContrato: string; nome: string | null; empresa: string | null }>>([]);
  const [empresaParceiraNome, setEmpresaParceiraNome] = useState("");
  const [empresaParceiraDocumento, setEmpresaParceiraDocumento] = useState("");
  const [status, setStatus] = useState("ATIVO");
  const [dataAssinatura, setDataAssinatura] = useState("");
  const [dataOS, setDataOS] = useState("");
  const [prazoValor, setPrazoValor] = useState("");
  const [prazoUnidade, setPrazoUnidade] = useState<"DIAS" | "SEMANAS" | "MESES" | "ANOS">("DIAS");

  const [vigenciaFim, setVigenciaFim] = useState<string>("");
  const [datasLastEdited, setDatasLastEdited] = useState<"PRAZO" | "VIGENCIA">("PRAZO");
  const syncingPrazoRef = useRef(false);
  const [aditivosInfo, setAditivosInfo] = useState<{ total: number; rascunho: number } | null>(null);
  type DocTipo =
    | "CONTRATO"
    | "OS"
    | "ADITIVO"
    | "MEDICAO"
    | "COMUNICACAO"
    | "TERMO_RESCISAO"
    | "TERMO_SUSPENSAO"
    | "TERMO_REINICIO"
    | "OUTROS";
  type DocDraft = { id: string; tipo: DocTipo; descricao: string; file: File };
  const [docTipoDraft, setDocTipoDraft] = useState<DocTipo>("CONTRATO");
  const [docDescricaoDraft, setDocDescricaoDraft] = useState("");
  const [docArquivoDraft, setDocArquivoDraft] = useState<File | null>(null);
  const [docInputKey, setDocInputKey] = useState(1);
  const [docsDraft, setDocsDraft] = useState<DocDraft[]>([]);
  const [docSelecionadoId, setDocSelecionadoId] = useState<string>("");
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);

  const [valorConcedenteInicial, setValorConcedenteInicial] = useState("0,00");
  const [valorProprioInicial, setValorProprioInicial] = useState("0,00");
  const [valorConcedenteAtual, setValorConcedenteAtual] = useState("0,00");
  const [valorProprioAtual, setValorProprioAtual] = useState("0,00");
  const [valorTotalInicial, setValorTotalInicial] = useState("0,00");
  const [valorTotalAtual, setValorTotalAtual] = useState("0,00");

  const isPublico = tipoContratante === "PUBLICO";

  const baseDate = useMemo(() => dataOS || dataAssinatura || "", [dataOS, dataAssinatura]);
  const prazoDias = useMemo(() => {
    const base = parseDateOnlyInput(baseDate);
    if (!base) return 0;

    if (datasLastEdited === "VIGENCIA") {
      const end = parseDateOnlyInput(vigenciaFim);
      if (!end) return 0;
      const diff = diffDaysDateOnly(base, end);
      return diff > 0 ? diff : 0;
    }

    const q = Math.trunc(Number(prazoValor || 0));
    if (!q || q <= 0) return 0;
    const end = addByUnidade(base, q, prazoUnidade);
    const diff = diffDaysDateOnly(base, end);
    return diff > 0 ? diff : 0;
  }, [baseDate, datasLastEdited, prazoUnidade, prazoValor, vigenciaFim]);

  useEffect(() => {
    const base = parseDateOnlyInput(baseDate);
    if (!base) {
      setVigenciaFim("");
      return;
    }

    if (datasLastEdited === "VIGENCIA") {
      const end = parseDateOnlyInput(vigenciaFim);
      if (!end) return;
      const diff = diffDaysDateOnly(base, end);
      if (!diff || diff <= 0) return;

      const nextPrazo =
        prazoUnidade === "DIAS"
          ? String(diff)
          : prazoUnidade === "SEMANAS"
            ? String(Math.max(1, Math.round(diff / 7)))
            : prazoUnidade === "MESES"
              ? String(Math.max(1, diffMonthsDateOnly(base, end)))
              : String(Math.max(1, diffYearsDateOnly(base, end)));
      syncingPrazoRef.current = true;
      setPrazoValor(nextPrazo);
      queueMicrotask(() => {
        syncingPrazoRef.current = false;
      });
      return;
    }

    const q = Math.trunc(Number(prazoValor || 0));
    if (!q || q <= 0) {
      setVigenciaFim("");
      return;
    }
    const end = addByUnidade(base, q, prazoUnidade);
    setVigenciaFim(dateOnlyToString(end));
  }, [baseDate, datasLastEdited, prazoUnidade, prazoValor, vigenciaFim]);

  useEffect(() => {
    if (!contratoId) {
      setAditivosInfo(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [cres, ares] = await Promise.all([api.get(`/api/contratos/${contratoId}`), api.get(`/api/contratos/${contratoId}/aditivos`)]);
        if (cancelled) return;
        const c: any = cres.data;
        const ads: any[] = Array.isArray(ares.data) ? (ares.data as any[]) : [];
        setNumeroContrato(String(c.numeroContrato || ""));
        setNome(c.nome ? String(c.nome) : "");
        setObjeto(c.objeto ? String(c.objeto) : "");
        setDescricao(c.descricao ? String(c.descricao) : "");
        setTipoPapel(String(c.tipoPapel || "CONTRATADO").toUpperCase() === "CONTRATANTE" ? "CONTRATANTE" : "CONTRATADO");
        setTipoContratante((String(c.tipoContratante || "PRIVADO").toUpperCase() === "PUBLICO" ? "PUBLICO" : String(c.tipoContratante || "PRIVADO").toUpperCase() === "PF" ? "PF" : "PRIVADO") as any);
        setContratoVinculadoId(c.contratoPrincipalId != null ? String(Number(c.contratoPrincipalId)) : "");
        setEmpresaParceiraNome(c.empresaParceiraNome ? String(c.empresaParceiraNome) : "");
        setEmpresaParceiraDocumento(c.empresaParceiraDocumento ? String(c.empresaParceiraDocumento) : "");
        setStatus(String(c.status || "ATIVO"));
        setDataAssinatura(c.dataAssinatura ? new Date(String(c.dataAssinatura)).toISOString().slice(0, 10) : "");
        setDataOS(c.dataOS ? new Date(String(c.dataOS)).toISOString().slice(0, 10) : "");

        const pd = c.prazoDias == null ? 0 : Number(c.prazoDias || 0);
        const vigFim = c.vigenciaAtual ? new Date(String(c.vigenciaAtual)).toISOString().slice(0, 10) : "";
        if (pd > 0 && pd % 365 === 0) {
          setPrazoUnidade("ANOS");
          setPrazoValor(String(Math.trunc(pd / 365)));
        } else if (pd > 0 && pd % 30 === 0) {
          setPrazoUnidade("MESES");
          setPrazoValor(String(Math.trunc(pd / 30)));
        } else if (pd > 0 && pd % 7 === 0) {
          setPrazoUnidade("SEMANAS");
          setPrazoValor(String(Math.trunc(pd / 7)));
        } else {
          setPrazoUnidade("DIAS");
          setPrazoValor(pd > 0 ? String(Math.trunc(pd)) : "");
        }
        setDatasLastEdited("PRAZO");
        setVigenciaFim(vigFim);

        setValorConcedenteInicial(c.valorConcedenteInicial == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorConcedenteInicial || 0) * 100))));
        setValorProprioInicial(c.valorProprioInicial == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorProprioInicial || 0) * 100))));
        setValorTotalInicial(c.valorTotalInicial == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorTotalInicial || 0) * 100))));
        setValorConcedenteAtual(c.valorConcedenteAtual == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorConcedenteAtual || 0) * 100))));
        setValorProprioAtual(c.valorProprioAtual == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorProprioAtual || 0) * 100))));
        setValorTotalAtual(c.valorTotalAtual == null ? "0,00" : formatMoneyBRFromDigits(String(Math.round(Number(c.valorTotalAtual || 0) * 100))));

        const rasc = ads.filter((a) => String((a as any)?.status || "").toUpperCase() === "RASCUNHO").length;
        setAditivosInfo({ total: ads.length, rascunho: rasc });
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.response?.data?.message || e?.message || "Erro ao carregar contrato");
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contratoId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/api/contratos", { params: { apenasPrincipais: "true" } });
        const rows = Array.isArray(res.data) ? (res.data as any[]) : [];
        const mapped = rows
          .map((r: any) => ({
            id: Number(r.id),
            numeroContrato: String(r.numeroContrato || ""),
            nome: r.nome ? String(r.nome) : null,
            empresa: r.empresaParceiraNome ? String(r.empresaParceiraNome) : null,
          }))
          .filter((r) => Number.isFinite(r.id) && (!contratoId || String(r.id) !== String(contratoId)));
        if (cancelled) return;
        setContratosVinculo(mapped);
      } catch {
        if (cancelled) return;
        setContratosVinculo([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contratoId]);

  useEffect(() => {
    if (tipoPapel === "CONTRATADO" && contratoVinculadoId) setContratoVinculadoId("");
  }, [tipoPapel, contratoVinculadoId]);

  function badgeClass(kind: "ok" | "info" | "warn") {
    if (kind === "ok") return "bg-emerald-50 text-emerald-800 border-emerald-200";
    if (kind === "warn") return "bg-amber-50 text-amber-900 border-amber-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  }

  function papelLabel(v: typeof tipoPapel) {
    return v === "CONTRATANTE" ? "Somos contratantes" : "Somos contratados";
  }

  function tipoContraparteLabel(v: typeof tipoContratante) {
    if (v === "PUBLICO") return "Órgão público";
    if (v === "PF") return "Pessoa física";
    return "Empresa privada";
  }

  function docTipoLabel(t: DocTipo) {
    switch (t) {
      case "CONTRATO":
        return "Contrato";
      case "OS":
        return "OS";
      case "ADITIVO":
        return "Aditivo";
      case "MEDICAO":
        return "Medição";
      case "COMUNICACAO":
        return "Comunicação";
      case "TERMO_RESCISAO":
        return "Termo de Rescisão";
      case "TERMO_SUSPENSAO":
        return "Termo de Suspensão";
      case "TERMO_REINICIO":
        return "Termo de Reinício";
      default:
        return "Outros";
    }
  }

  useEffect(() => {
    const selected = docsDraft.find((d) => d.id === docSelecionadoId) || null;
    if (docPreviewUrl) URL.revokeObjectURL(docPreviewUrl);
    if (!selected) {
      setDocPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selected.file);
    setDocPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [docSelecionadoId, docsDraft]);

  function addDocumento() {
    if (!docArquivoDraft) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? (crypto as any).randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const next: DocDraft = { id, tipo: docTipoDraft, descricao: docDescricaoDraft.trim(), file: docArquivoDraft };
    setDocsDraft((p) => [...p, next]);
    setDocTipoDraft("CONTRATO");
    setDocDescricaoDraft("");
    setDocArquivoDraft(null);
    setDocInputKey((k) => k + 1);
    setDocSelecionadoId((cur) => cur || id);
  }

  async function fileToBase64(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("Falha ao ler arquivo"));
      fr.readAsDataURL(file);
    });
    const idx = dataUrl.indexOf("base64,");
    return idx >= 0 ? dataUrl.slice(idx + 7) : dataUrl;
  }

  async function anexarDocumentos(idContrato: number) {
    const docs = docsDraft.slice();
    if (!docs.length) return;
    for (const d of docs) {
      const nomeArquivo = d.file.name || "documento";
      const mimeType = d.file.type || "application/octet-stream";
      const conteudoBase64 = await fileToBase64(d.file);
      const texto = d.descricao ? `${docTipoLabel(d.tipo)} — ${d.descricao}` : docTipoLabel(d.tipo);
      const ev = await api.post(`/api/contratos/${idContrato}/observacoes`, { texto, nivel: "NORMAL", tipoOrigem: "DOCUMENTO" });
      const eventoId = Number((ev.data as any)?.id);
      if (!Number.isFinite(eventoId) || eventoId <= 0) throw new Error("Falha ao criar evento do documento");
      await api.post(`/api/contratos/${idContrato}/eventos/${eventoId}/anexos`, { nomeArquivo, mimeType, conteudoBase64 });
    }
    setDocsDraft([]);
    setDocSelecionadoId("");
  }

  useEffect(() => {
    if (!isPublico) return;
    const total = parseMoneyBR(valorConcedenteInicial) + parseMoneyBR(valorProprioInicial);
    setValorTotalInicial(formatMoneyBRFromDigits(String(Math.round(total * 100))));
  }, [isPublico, valorConcedenteInicial, valorProprioInicial]);

  useEffect(() => {
    if (!isPublico) return;
    const total = parseMoneyBR(valorConcedenteAtual) + parseMoneyBR(valorProprioAtual);
    setValorTotalAtual(formatMoneyBRFromDigits(String(Math.round(total * 100))));
  }, [isPublico, valorConcedenteAtual, valorProprioAtual]);

  async function salvar() {
    try {
      setLoading(true);
      setErr(null);
      if (!baseDate || !prazoDias || prazoDias <= 0) {
        setErr("Informe a data base (OS ou Assinatura) e o prazo ou a vigência.");
        return;
      }

      const vti = parseMoneyBR(valorTotalInicial);
      const vta = parseMoneyBR(valorTotalAtual);
      if (vti <= 0 || vta <= 0) {
        setErr("Valor total do contrato deve ser maior que zero.");
        return;
      }

      const vincId = contratoVinculadoId ? Number(contratoVinculadoId) : null;
      const papelFinal = vincId ? "CONTRATANTE" : tipoPapel;
      const payload = {
        contratoPrincipalId: vincId && Number.isFinite(vincId) ? vincId : null,
        numeroContrato: numeroContrato.trim(),
        nome: nome || null,
        objeto: objeto || null,
        descricao: descricao || null,
        tipoPapel: papelFinal,
        tipoContratante,
        empresaParceiraNome: empresaParceiraNome || null,
        empresaParceiraDocumento: empresaParceiraDocumento || null,
        status,
        dataAssinatura: dataAssinatura ? new Date(`${dataAssinatura}T00:00:00`).toISOString() : null,
        dataOS: dataOS ? new Date(`${dataOS}T00:00:00`).toISOString() : null,
        prazoDias,
        vigenciaInicial: vigenciaFim ? new Date(`${vigenciaFim}T00:00:00`).toISOString() : null,
        vigenciaAtual: vigenciaFim ? new Date(`${vigenciaFim}T00:00:00`).toISOString() : null,
        valorConcedenteInicial: isPublico ? parseMoneyBR(valorConcedenteInicial) : null,
        valorProprioInicial: isPublico ? parseMoneyBR(valorProprioInicial) : null,
        valorTotalInicial: isPublico ? parseMoneyBR(valorTotalInicial) : parseMoneyBR(valorTotalInicial),
        valorConcedenteAtual: isPublico ? parseMoneyBR(valorConcedenteAtual) : null,
        valorProprioAtual: isPublico ? parseMoneyBR(valorProprioAtual) : null,
        valorTotalAtual: isPublico ? parseMoneyBR(valorTotalAtual) : parseMoneyBR(valorTotalAtual),
      };
      if (contratoId) {
        await api.put(`/api/contratos/${contratoId}`, payload);
        await anexarDocumentos(Number(contratoId));
        router.push(`/dashboard/contratos?id=${contratoId}`);
      } else {
        const res = await api.post("/api/contratos", payload);
        const id = (res.data as any)?.id;
        if (id) {
          await anexarDocumentos(Number(id));
          router.push(`/dashboard/contratos?id=${id}`);
        } else router.push("/dashboard/contratos");
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar contrato");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{isEdit ? "Editar Contrato" : "Novo Contrato"}</h1>
          <div className="text-sm text-slate-600">Um contrato pode existir sem obra; obras podem ser vinculadas depois.</div>
        </div>
        <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/contratos")}>
          Voltar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass(status === "ATIVO" ? "ok" : "info")}`}>{status || "—"}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass("info")}`}>{papelLabel(tipoPapel)}</span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass("info")}`}>{tipoContraparteLabel(tipoContratante)}</span>
        {contratoVinculadoId ? <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass("warn")}`}>Vinculado</span> : null}
      </div>

      {isEdit && aditivosInfo ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-slate-700">
          <div className="font-semibold">Aditivos</div>
          <div className="mt-1">
            Total: <span className="font-semibold">{aditivosInfo.total}</span>
            {" • "}
            Em rascunho: <span className="font-semibold">{aditivosInfo.rascunho}</span>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-sm text-slate-600">Número do contrato</div>
            <input className="input" value={numeroContrato} onChange={(e) => setNumeroContrato(e.target.value)} placeholder="Ex: 012/2026" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ATIVO">Ativo</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PARALISADO">Paralisado</option>
              <option value="ENCERRADO">Encerrado</option>
              <option value="FINALIZADO">Finalizado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="RESCINDIDO">Rescindido</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo de contrato (papel)</div>
            <div className="mt-2 flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="papel" checked={tipoPapel === "CONTRATADO"} onChange={() => setTipoPapel("CONTRATADO")} />
                Somos CONTRATADOS
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="papel" checked={tipoPapel === "CONTRATANTE"} onChange={() => setTipoPapel("CONTRATANTE")} />
                Somos CONTRATANTES
              </label>
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo da contraparte</div>
            <select className="input" value={tipoContratante} onChange={(e) => setTipoContratante(e.target.value as any)}>
              <option value="PUBLICO">Empresa pública</option>
              <option value="PRIVADO">Empresa privada</option>
              <option value="PF">Pessoa física</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Contrato vinculado (opcional)</div>
            <select
              className="input"
              value={contratoVinculadoId}
              onChange={(e) => {
                const v = e.target.value;
                setContratoVinculadoId(v);
                if (v) setTipoPapel("CONTRATANTE");
              }}
              disabled={tipoPapel === "CONTRATADO"}
            >
              <option value="">—</option>
              {contratosVinculo.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.numeroContrato}
                  {c.empresa ? ` — ${c.empresa}` : ""}
                  {c.nome ? ` (${c.nome})` : ""}
                </option>
              ))}
            </select>
            {tipoPapel === "CONTRATADO" ? <div className="mt-1 text-xs text-slate-500">Disponível quando o papel for "Somos contratantes".</div> : null}
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Nome do contrato</div>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Construção UBS" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Objeto</div>
            <textarea className="input min-h-[100px]" value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="Descrição do objeto do contrato" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Descrição/Observações</div>
            <textarea className="input min-h-[100px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Observações gerais, contexto, particularidades, etc." />
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="text-sm font-semibold">Datas</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Data assinatura</div>
              <input className="input" type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-slate-600">Data OS (preferencial)</div>
              <input className="input" type="date" value={dataOS} onChange={(e) => setDataOS(e.target.value)} />
            </div>
            <div className="md:col-span-6">
              <div className="text-sm text-slate-600">Prazo</div>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={prazoValor}
                  onChange={(e) => {
                    setDatasLastEdited("PRAZO");
                    if (!syncingPrazoRef.current) setPrazoValor(e.target.value);
                  }}
                  placeholder="Ex: 180"
                />
                <select
                  className="input w-[110px]"
                  value={prazoUnidade}
                  onChange={(e) => {
                    setDatasLastEdited("PRAZO");
                    setPrazoUnidade(e.target.value as any);
                  }}
                >
                  <option value="DIAS">Dias</option>
                  <option value="SEMANAS">Semanas</option>
                  <option value="MESES">Meses</option>
                  <option value="ANOS">Anos</option>
                </select>
              </div>
            </div>
            <div className="md:col-span-12">
              <div className="text-sm text-slate-600">Vigência (fim)</div>
              <input
                className="input"
                type="date"
                value={vigenciaFim}
                onChange={(e) => {
                  const next = e.target.value;
                  setDatasLastEdited("VIGENCIA");
                  setVigenciaFim(next);
                  const base = parseDateOnlyInput(baseDate);
                  const end = parseDateOnlyInput(next);
                  if (!base || !end) return;
                  const diff = diffDaysDateOnly(base, end);
                  if (!diff || diff <= 0) return;
                  const nextPrazo =
                    prazoUnidade === "DIAS"
                      ? String(diff)
                      : prazoUnidade === "SEMANAS"
                        ? String(Math.max(1, Math.round(diff / 7)))
                        : prazoUnidade === "MESES"
                          ? String(Math.max(1, diffMonthsDateOnly(base, end)))
                          : String(Math.max(1, diffYearsDateOnly(base, end)));
                  syncingPrazoRef.current = true;
                  setPrazoValor(nextPrazo);
                  queueMicrotask(() => {
                    syncingPrazoRef.current = false;
                  });
                }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold">Contraparte</div>
            <button className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/engenharia/contrapartes")}>
              Gerenciar contrapartes
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-sm text-slate-600">Nome</div>
              <input className="input" value={empresaParceiraNome} onChange={(e) => setEmpresaParceiraNome(e.target.value)} placeholder="Ex: Construtora XPTO" />
            </div>
            <div>
              <div className="text-sm text-slate-600">CNPJ/CPF</div>
              <input className="input" value={empresaParceiraDocumento} onChange={(e) => setEmpresaParceiraDocumento(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="text-sm font-semibold">Documentos</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-sm text-slate-600">Tipo</div>
              <select className="input" value={docTipoDraft} onChange={(e) => setDocTipoDraft(e.target.value as any)}>
                <option value="CONTRATO">Contrato</option>
                <option value="OS">OS</option>
                <option value="ADITIVO">Aditivo</option>
                <option value="MEDICAO">Medição</option>
                <option value="COMUNICACAO">Comunicação</option>
                <option value="TERMO_RESCISAO">Termo de Rescisão</option>
                <option value="TERMO_SUSPENSAO">Termo de Suspensão</option>
                <option value="TERMO_REINICIO">Termo de Reinício</option>
                <option value="OUTROS">Outros</option>
              </select>
            </div>
            <div>
              <div className="text-sm text-slate-600">Arquivo</div>
              <input key={docInputKey} className="input py-1.5" type="file" onChange={(e) => setDocArquivoDraft(e.target.files?.[0] || null)} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-slate-600">Descrição</div>
              <input className="input" value={docDescricaoDraft} onChange={(e) => setDocDescricaoDraft(e.target.value)} placeholder="Ex: Contrato assinado, OS emitida, termo, comunicado, etc." />
            </div>
            <div className="md:col-span-2 flex items-center justify-end">
              <button
                className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                type="button"
                onClick={addDocumento}
                disabled={!docArquivoDraft}
              >
                Adicionar documento
              </button>
            </div>
          </div>

          {docsDraft.length ? (
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white text-left text-slate-700">
                  <tr className="border-b">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="text-slate-900">
                  {docsDraft.map((d, idx) => (
                    <tr key={d.id} className="border-b">
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{docTipoLabel(d.tipo)}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{d.descricao || "—"}</div>
                        <div className="text-xs text-slate-500">{d.file.name}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="rounded-lg border bg-white p-2 hover:bg-slate-50"
                            type="button"
                            title="Exibir"
                            onClick={() => setDocSelecionadoId(d.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded-lg border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50"
                            type="button"
                            title="Excluir"
                            onClick={() => {
                              setDocsDraft((p) => p.filter((x) => x.id !== d.id));
                              setDocSelecionadoId((cur) => (cur === d.id ? "" : cur));
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 text-xs text-slate-500">Nenhum documento adicionado.</div>
          )}

          {docPreviewUrl && docSelecionadoId ? (
            <div className="mt-4 rounded-lg border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Visualização</div>
                <button
                  className="rounded-lg border bg-white px-3 py-1 text-sm hover:bg-slate-50"
                  type="button"
                  onClick={() => setDocSelecionadoId("")}
                >
                  Fechar visualização
                </button>
              </div>
              <div className="mt-2">
                {(() => {
                  const d = docsDraft.find((x) => x.id === docSelecionadoId) || null;
                  const mt = d?.file?.type || "";
                  if (!d) return null;
                  if (mt.startsWith("image/")) return <img className="max-h-[420px] w-auto rounded" src={docPreviewUrl} alt="Documento" />;
                  if (mt === "application/pdf" || d.file.name.toLowerCase().endsWith(".pdf"))
                    return <iframe className="h-[520px] w-full rounded" src={docPreviewUrl} title="Documento" />;
                  return (
                    <a className="text-sm text-blue-700 hover:underline" href={docPreviewUrl} download={d.file.name}>
                      Baixar arquivo
                    </a>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="text-sm font-semibold">Valores</div>
          {isPublico ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <div className="text-sm text-slate-600">Concedente (inicial)</div>
                <input className="input" value={valorConcedenteInicial} onChange={(e) => setValorConcedenteInicial(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Recursos próprios (inicial)</div>
                <input className="input" value={valorProprioInicial} onChange={(e) => setValorProprioInicial(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Total (inicial)</div>
                <input className="input" value={valorTotalInicial} disabled />
              </div>

              <div>
                <div className="text-sm text-slate-600">Concedente (atual)</div>
                <input className="input" value={valorConcedenteAtual} onChange={(e) => setValorConcedenteAtual(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Recursos próprios (atual)</div>
                <input className="input" value={valorProprioAtual} onChange={(e) => setValorProprioAtual(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Total (atual)</div>
                <input className="input" value={valorTotalAtual} disabled />
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-slate-600">Valor total (inicial)</div>
                <input className="input" value={valorTotalInicial} onChange={(e) => setValorTotalInicial(formatMoneyBRFromDigits(e.target.value))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">Valor total (atual)</div>
                <input className="input" value={valorTotalAtual} onChange={(e) => setValorTotalAtual(formatMoneyBRFromDigits(e.target.value))} />
              </div>
            </div>
          )}
        </div>

        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

        <div className="flex justify-end">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            type="button"
            onClick={salvar}
            disabled={loading || !numeroContrato.trim()}
          >
            {loading ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}
