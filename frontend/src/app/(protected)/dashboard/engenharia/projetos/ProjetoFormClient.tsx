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

const TIPO_OPTIONS = ["Hidráulico / Sanitário", "Elétrico", "Estrutural", "Arquitetônico", "Terraplenagem", "Outros"];

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
  const [tipo, setTipo] = useState<string>(TIPO_OPTIONS[0]);
  const [numeroProjeto, setNumeroProjeto] = useState("");
  const [revisao, setRevisao] = useState("");
  const [status, setStatus] = useState<string>(STATUS_OPTIONS[0].value);
  const [dataProjeto, setDataProjeto] = useState("");
  const [dataAprovacao, setDataAprovacao] = useState("");
  const [descricao, setDescricao] = useState("");

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
        setTipo(dto.tipo || TIPO_OPTIONS[0]);
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

  const breadcrumb = idProjeto ? "Projetos > Editar Projeto" : "Projetos > Cadastro de Projeto";

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
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPO_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
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
    </div>
  );
}
