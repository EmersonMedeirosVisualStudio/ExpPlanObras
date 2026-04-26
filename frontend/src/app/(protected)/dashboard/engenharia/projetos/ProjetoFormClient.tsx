"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

type ProjetoDTO = {
  idProjeto: number;
  titulo: string;
  endereco: string | null;
  descricao: string | null;
  tipo: string | null;
  numeroProjeto: string | null;
  revisao: string | null;
  status: string | null;
  dataProjeto: string | null;
  dataAprovacao: string | null;
};

type ProjetoResponsavelRow = {
  idProjetoResponsavel: number;
  idProjeto: number;
  idTecnico: number;
  nome: string;
  conselho: string | null;
  numeroRegistro: string | null;
  tipo: "RESPONSAVEL_TECNICO" | "FISCAL_OBRA";
  abrangencia: string | null;
  numeroDocumento: string | null;
  observacao: string | null;
};

function safeInternalPath(v: string | null) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  return s;
}

const STATUS_OPTIONS = [
  { value: "APROVADO", label: "Aprovado" },
  { value: "EM_REVISAO", label: "Em revisão" },
  { value: "EM_ELABORACAO", label: "Em elaboração" },
  { value: "CANCELADO", label: "Cancelado" },
];

const TIPO_OPTIONS_BASE = [
  "Arquitetônico",
  "Estrutural",
  "Fundações",
  "Geotécnico",
  "Topográfico",
  "Terraplenagem",
  "Pavimentação",
  "Drenagem / Pluvial",
  "Hidrossanitário",
  "Elétrico (BT/MT)",
  "Iluminação",
  "SPDA (Para-raios)",
  "Incêndio (PPCI/AVCB)",
  "Climatização (HVAC)",
  "Gás (GN/GLP)",
  "Telecom / Cabeamento",
  "Automação / BMS",
  "Acessibilidade",
  "Paisagístico",
  "As Built",
  "Compatibilização",
  "Outros",
];

function normalizeTipoLabel(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function ProjetoFormClient() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const idProjeto = useMemo(() => {
    const n = Number(params?.id || 0);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [params]);

  const returnTo = useMemo(() => safeInternalPath(sp.get("returnTo") || null), [sp]);
  const autoLink = String(sp.get("autoLink") || "") === "1";
  const obraIdToLink = useMemo(() => {
    const n = Number(sp.get("obraId") || 0);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [sp]);

  const backHref = returnTo || "/dashboard/engenharia/projetos";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [titulo, setTitulo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [tipo, setTipo] = useState<string>(TIPO_OPTIONS_BASE[0]);
  const [tipoQuery, setTipoQuery] = useState<string>(TIPO_OPTIONS_BASE[0]);
  const [tipoOptions, setTipoOptions] = useState<string[]>(TIPO_OPTIONS_BASE);
  const [tipoOpen, setTipoOpen] = useState(false);
  const [numeroProjeto, setNumeroProjeto] = useState("");
  const [revisao, setRevisao] = useState("");
  const [status, setStatus] = useState<string>(STATUS_OPTIONS[0].value);
  const [dataProjeto, setDataProjeto] = useState("");
  const [dataAprovacao, setDataAprovacao] = useState("");
  const [descricao, setDescricao] = useState("");

  const tipoFiltered = useMemo(() => {
    const q = tipoQuery.trim().toLowerCase();
    const base = tipoOptions;
    if (!q) return base;
    return base.filter((x) => x.toLowerCase().includes(q));
  }, [tipoOptions, tipoQuery]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("engenharia:tiposProjeto") || "";
      const parsed = JSON.parse(raw || "[]");
      const extra = Array.isArray(parsed) ? parsed.map((x) => String(x || "").trim()).filter(Boolean) : [];
      const merged = Array.from(new Set([...TIPO_OPTIONS_BASE, ...extra].map((x) => normalizeTipoLabel(x)))).filter(Boolean);
      setTipoOptions(merged);
    } catch {
      setTipoOptions(TIPO_OPTIONS_BASE);
    }
  }, []);

  function persistTipoOptions(next: string[]) {
    try {
      const extra = next.filter((x) => !TIPO_OPTIONS_BASE.includes(x));
      localStorage.setItem("engenharia:tiposProjeto", JSON.stringify(extra));
    } catch {}
  }

  function ensureTipoOption(value: string) {
    const normalized = normalizeTipoLabel(value);
    if (!normalized) return;
    setTipoOptions((prev) => {
      const next = Array.from(new Set([...prev, normalized]));
      persistTipoOptions(next);
      return next;
    });
  }

  const [respLoading, setRespLoading] = useState(false);
  const [respErr, setRespErr] = useState<string | null>(null);
  const [respRows, setRespRows] = useState<ProjetoResponsavelRow[]>([]);

  useEffect(() => {
    if (!idProjeto) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get(`/api/v1/engenharia/projetos/${idProjeto}`);
        const d = unwrapApiData<any>(res?.data || null) as any;
        if (!active) return;
        const dto: ProjetoDTO = {
          idProjeto: Number(d.idProjeto),
          titulo: String(d.titulo || ""),
          endereco: d.endereco == null ? null : String(d.endereco),
          descricao: d.descricao == null ? null : String(d.descricao),
          tipo: d.tipo == null ? null : String(d.tipo),
          numeroProjeto: d.numeroProjeto == null ? null : String(d.numeroProjeto),
          revisao: d.revisao == null ? null : String(d.revisao),
          status: d.status == null ? null : String(d.status),
          dataProjeto: d.dataProjeto == null ? null : String(d.dataProjeto),
          dataAprovacao: d.dataAprovacao == null ? null : String(d.dataAprovacao),
        };
        setTitulo(dto.titulo);
        setEndereco(dto.endereco || "");
        setTipo(dto.tipo || TIPO_OPTIONS_BASE[0]);
        setTipoQuery(dto.tipo || TIPO_OPTIONS_BASE[0]);
        setNumeroProjeto(dto.numeroProjeto || "");
        setRevisao(dto.revisao || "");
        setStatus(dto.status || STATUS_OPTIONS[0].value);
        setDataProjeto(dto.dataProjeto ? String(dto.dataProjeto).slice(0, 10) : "");
        setDataAprovacao(dto.dataAprovacao ? String(dto.dataAprovacao).slice(0, 10) : "");
        setDescricao(dto.descricao || "");
      } catch (e: any) {
        if (active) setErr(e?.response?.data?.message || e?.message || "Erro ao carregar projeto.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [idProjeto]);

  async function carregarResponsaveisProjeto() {
    if (!idProjeto) return;
    try {
      setRespLoading(true);
      setRespErr(null);
      const res = await api.get(`/api/v1/engenharia/projetos/responsaveis?idProjeto=${idProjeto}`);
      const list = unwrapApiData<any[]>(res?.data || []);
      const mapped: ProjetoResponsavelRow[] = Array.isArray(list)
        ? list.map((r) => ({
            idProjetoResponsavel: Number(r.idProjetoResponsavel),
            idProjeto: Number(r.idProjeto),
            idTecnico: Number(r.idTecnico),
            nome: String(r.nome || ""),
            conselho: r.conselho == null ? null : String(r.conselho),
            numeroRegistro: r.numeroRegistro == null ? null : String(r.numeroRegistro),
            tipo: (String(r.tipo || "").toUpperCase() === "FISCAL_OBRA" ? "FISCAL_OBRA" : "RESPONSAVEL_TECNICO") as any,
            abrangencia: r.abrangencia == null ? null : String(r.abrangencia),
            numeroDocumento: r.numeroDocumento == null ? null : String(r.numeroDocumento),
            observacao: r.observacao == null ? null : String(r.observacao),
          }))
        : [];
      setRespRows(mapped);
    } catch (e: any) {
      setRespErr(e?.response?.data?.message || e?.message || "Erro ao carregar responsáveis do projeto.");
    } finally {
      setRespLoading(false);
    }
  }

  useEffect(() => {
    if (!idProjeto) return;
    carregarResponsaveisProjeto();
  }, [idProjeto]);

  async function adicionarResponsavelProjeto() {
    if (!idProjeto) {
      setErr("Salve o projeto antes de cadastrar responsáveis.");
      return;
    }
    try {
      setRespLoading(true);
      setRespErr(null);

      const idTecnicoRaw = (prompt("ID do técnico (deixe vazio para cadastrar um novo):") || "").trim();
      let idTecnico: number | null = null;
      if (idTecnicoRaw) {
        const n = Number(idTecnicoRaw);
        idTecnico = Number.isInteger(n) && n > 0 ? n : null;
        if (!idTecnico) {
          setRespErr("ID do técnico inválido.");
          return;
        }
      } else {
        const nome = (prompt("Nome do técnico:") || "").trim();
        if (!nome) {
          setRespErr("Nome é obrigatório.");
          return;
        }
        const conselho = (prompt("Conselho (ex.: CREA, CAU):") || "").trim();
        const numeroRegistro = (prompt("Número do registro:") || "").trim();
        if (!conselho) {
          setRespErr("Conselho é obrigatório.");
          return;
        }
        if (!numeroRegistro) {
          setRespErr("Registro é obrigatório.");
          return;
        }
        const resTec = await api.post("/api/v1/engenharia/tecnicos", {
          nome,
          conselho,
          numeroRegistro,
        });
        const outTec = unwrapApiData<any>(resTec?.data || null) as any;
        const newId = Number(outTec?.idTecnico || 0);
        if (!Number.isInteger(newId) || newId <= 0) {
          setRespErr("Não foi possível cadastrar o técnico.");
          return;
        }
        idTecnico = newId;
      }

      const tipo = (prompt("Tipo (RESPONSAVEL_TECNICO / FISCAL_OBRA):", "RESPONSAVEL_TECNICO") || "RESPONSAVEL_TECNICO")
        .trim()
        .toUpperCase();
      const abrangencia = (prompt("Abrangência (opcional):") || "").trim();
      const numeroDocumento = (prompt("Nº documento (opcional):") || "").trim();
      const observacao = (prompt("Observação (opcional):") || "").trim();

      await api.post("/api/v1/engenharia/projetos/responsaveis", {
        idProjeto,
        idTecnico,
        tipo,
        abrangencia: abrangencia || null,
        numeroDocumento: numeroDocumento || null,
        observacao: observacao || null,
      });
      await carregarResponsaveisProjeto();
    } catch (e: any) {
      setRespErr(e?.response?.data?.message || e?.message || "Erro ao adicionar responsável.");
    } finally {
      setRespLoading(false);
    }
  }

  async function editarResponsavelProjeto(r: ProjetoResponsavelRow) {
    try {
      setRespLoading(true);
      setRespErr(null);
      const tipo = (prompt("Tipo (RESPONSAVEL_TECNICO / FISCAL_OBRA):", r.tipo) || r.tipo).trim().toUpperCase();
      const abrangencia = (prompt("Abrangência:", r.abrangencia || "") || "").trim() || null;
      const numeroDocumento = (prompt("Nº documento:", r.numeroDocumento || "") || "").trim() || null;
      const observacao = (prompt("Observação:", r.observacao || "") || "").trim() || null;
      await api.put(`/api/v1/engenharia/projetos/responsaveis/${r.idProjetoResponsavel}`, {
        tipo,
        abrangencia,
        numeroDocumento,
        observacao,
      });
      await carregarResponsaveisProjeto();
    } catch (e: any) {
      setRespErr(e?.response?.data?.message || e?.message || "Erro ao editar responsável.");
    } finally {
      setRespLoading(false);
    }
  }

  async function removerResponsavelProjeto(r: ProjetoResponsavelRow) {
    if (!confirm(`Remover "${r.nome}" do projeto?`)) return;
    try {
      setRespLoading(true);
      setRespErr(null);
      await api.delete(`/api/v1/engenharia/projetos/responsaveis/${r.idProjetoResponsavel}`);
      await carregarResponsaveisProjeto();
    } catch (e: any) {
      setRespErr(e?.response?.data?.message || e?.message || "Erro ao remover responsável.");
    } finally {
      setRespLoading(false);
    }
  }

  async function salvar() {
    const t = titulo.trim();
    const e = endereco.trim();
    if (!t) {
      setErr("Título do projeto é obrigatório.");
      return;
    }
    if (!e) {
      setErr("Endereço é obrigatório.");
      return;
    }

    try {
      setLoading(true);
      setErr(null);
      const payload = {
        titulo: t,
        endereco: e,
        tipo: tipo.trim() || null,
        numeroProjeto: numeroProjeto.trim() || null,
        revisao: revisao.trim() || null,
        status: status.trim() || null,
        dataProjeto: dataProjeto.trim() || null,
        dataAprovacao: dataAprovacao.trim() || null,
        descricao: descricao.trim() || null,
      };

      if (idProjeto) {
        await api.put(`/api/v1/engenharia/projetos/${idProjeto}`, payload);
        router.push(backHref);
        return;
      }

      const res = await api.post("/api/v1/engenharia/projetos", payload);
      const out = unwrapApiData<any>(res?.data || null) as any;
      const newId = Number(out?.idProjeto || 0);
      if (autoLink && obraIdToLink && Number.isInteger(newId) && newId > 0) {
        await api.post("/api/v1/engenharia/obras/projetos", { idObra: obraIdToLink, idProjeto: newId });
        const importar = confirm("Deseja importar responsáveis do projeto para a obra agora?");
        if (importar) {
          await api.post("/api/v1/engenharia/obras/responsabilidades/importar", { idObra: obraIdToLink, idProjeto: newId });
        }
        router.push(backHref);
        return;
      }

      if (Number.isInteger(newId) && newId > 0) {
        router.push(`/dashboard/engenharia/projetos/${newId}?returnTo=${encodeURIComponent(backHref)}`);
        return;
      }

      router.push(backHref);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  const breadcrumb = useMemo(() => {
    const base = idProjeto ? "Cadastro de Projeto (editar)" : "Cadastro de Projeto (novo)";
    if (!returnTo) return `Engenharia → Projetos → ${base}`;
    const rt = returnTo.toLowerCase();
    if (/\/dashboard\/engenharia\/obras\/\d+\/projetos/.test(rt)) return `Engenharia → Obras → Obra selecionada → Projetos da Obra → ${base}`;
    if (/\/dashboard\/engenharia\/obras\/\d+/.test(rt)) return `Engenharia → Obras → Obra selecionada → ${base}`;
    if (rt.includes("/dashboard/engenharia/obras")) return `Engenharia → Obras → ${base}`;
    if (rt.includes("/dashboard/engenharia/projetos")) return `Engenharia → Projetos → ${base}`;
    return `Engenharia → Projetos → ${base}`;
  }, [idProjeto, returnTo]);

  return (
    <div className="p-6 space-y-6 max-w-5xl text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[#6B7280]">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">{idProjeto ? "Cadastro de Projeto" : "Cadastro de Projeto"}</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm hover:bg-[#F9FAFB]" type="button" onClick={() => router.push(backHref)} disabled={loading}>
            Voltar
          </button>
          <button className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8]" type="button" onClick={salvar} disabled={loading}>
            Salvar
          </button>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-4 py-3 font-medium">Dados do Projeto</div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Título do Projeto *</div>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Projeto Hidrossanitário - Residencial Porto Seguro" />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Endereço *</div>
              <input className="input" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, nº, bairro, cidade/UF" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Tipo de Projeto *</div>
              <div className="relative">
                <input
                  className="input"
                  value={tipoQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTipoQuery(v);
                    setTipo(v);
                    setTipoOpen(true);
                  }}
                  onFocus={() => setTipoOpen(true)}
                  onBlur={() => {
                    const finalValue = normalizeTipoLabel(tipoQuery);
                    if (finalValue) {
                      setTipo(finalValue);
                      setTipoQuery(finalValue);
                      ensureTipoOption(finalValue);
                    }
                    setTimeout(() => setTipoOpen(false), 120);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const finalValue = normalizeTipoLabel(tipoQuery);
                      if (finalValue) {
                        setTipo(finalValue);
                        setTipoQuery(finalValue);
                        ensureTipoOption(finalValue);
                        setTipoOpen(false);
                      }
                    }
                    if (e.key === "Escape") setTipoOpen(false);
                  }}
                  placeholder="Digite para filtrar ou adicionar..."
                />
                {tipoOpen && tipoFiltered.length ? (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
                    <div className="max-h-56 overflow-auto">
                      {tipoFiltered.slice(0, 30).map((x) => (
                        <button
                          key={x}
                          type="button"
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#F9FAFB] ${x === tipo ? "bg-[#F9FAFB]" : ""}`}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setTipo(x);
                            setTipoQuery(x);
                            ensureTipoOption(x);
                            setTipoOpen(false);
                          }}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Nº do Projeto</div>
              <input className="input" value={numeroProjeto} onChange={(e) => setNumeroProjeto(e.target.value)} placeholder="Ex.: PH-2024-001" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Revisão</div>
              <input className="input" value={revisao} onChange={(e) => setRevisao(e.target.value)} placeholder="Ex.: 01" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Status *</div>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Data do Projeto</div>
              <input className="input" type="date" value={dataProjeto} onChange={(e) => setDataProjeto(e.target.value)} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Data de Aprovação</div>
              <input className="input" type="date" value={dataAprovacao} onChange={(e) => setDataAprovacao(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Descrição / Observações</div>
              <textarea className="input min-h-[110px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Observações, escopo, etc." />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        <div className="border-b border-[#E5E7EB] px-4 py-3 font-medium">Responsáveis Técnicos / Fiscais do Projeto</div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <button
                className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]"
                type="button"
                onClick={carregarResponsaveisProjeto}
                disabled={respLoading || !idProjeto}
              >
                Atualizar
              </button>
              <button className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm text-white hover:bg-[#1D4ED8]" type="button" onClick={adicionarResponsavelProjeto} disabled={respLoading}>
                Adicionar
              </button>
              <button
                className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm hover:bg-[#F9FAFB]"
                type="button"
                onClick={() => router.push(`/dashboard/engenharia/profissionais?returnTo=${encodeURIComponent(`/dashboard/engenharia/projetos/${idProjeto || "novo"}?returnTo=${encodeURIComponent(backHref)}`)}`)}
              >
                Abrir Profissionais
              </button>
            </div>
            {!idProjeto ? <div className="text-sm text-[#6B7280]">Salve o projeto para habilitar.</div> : null}
          </div>

          {respErr ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{respErr}</div> : null}

          <div className="overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-700">
                <tr>
                  <th className="px-3 py-2">Técnico</th>
                  <th className="px-3 py-2">Conselho</th>
                  <th className="px-3 py-2">Registro</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Abrangência</th>
                  <th className="px-3 py-2">Nº Doc</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {respLoading ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                      Carregando...
                    </td>
                  </tr>
                ) : respRows.length ? (
                  respRows.map((r) => (
                    <tr key={r.idProjetoResponsavel} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.nome || "—"}</td>
                      <td className="px-3 py-2">{r.conselho || "—"}</td>
                      <td className="px-3 py-2">{r.numeroRegistro || "—"}</td>
                      <td className="px-3 py-2">{r.tipo === "FISCAL_OBRA" ? "Fiscal" : "Responsável Técnico"}</td>
                      <td className="px-3 py-2">{r.abrangencia || "—"}</td>
                      <td className="px-3 py-2">{r.numeroDocumento || "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => editarResponsavelProjeto(r)} disabled={respLoading}>
                          Editar
                        </button>{" "}
                        <button
                          className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          type="button"
                          onClick={() => removerResponsavelProjeto(r)}
                          disabled={respLoading}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                      Nenhum vínculo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
