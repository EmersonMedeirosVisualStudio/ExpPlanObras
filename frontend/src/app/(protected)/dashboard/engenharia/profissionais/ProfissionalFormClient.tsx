"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

function safeInternalPath(v: string | null) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  return s;
}

type TecnicoDTO = {
  idTecnico: number;
  nome: string;
  conselho: string | null;
  numeroRegistro: string | null;
  email: string | null;
  telefone: string | null;
};

export default function ProfissionalFormClient() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const idTecnico = useMemo(() => {
    const n = Number(params?.id || 0);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [params]);

  const returnTo = useMemo(() => safeInternalPath(sp.get("returnTo") || null), [sp]);
  const backHref = returnTo || "/dashboard/engenharia/profissionais";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [conselho, setConselho] = useState("");
  const [numeroRegistro, setNumeroRegistro] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");

  useEffect(() => {
    if (!idTecnico) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get(`/api/v1/engenharia/tecnicos/${idTecnico}`);
        const d = unwrapApiData<any>(res?.data || null) as any;
        if (!active) return;
        const dto: TecnicoDTO = {
          idTecnico: Number(d.idTecnico),
          nome: String(d.nome || ""),
          conselho: d.conselho == null ? null : String(d.conselho),
          numeroRegistro: d.numeroRegistro == null ? null : String(d.numeroRegistro),
          email: d.email == null ? null : String(d.email),
          telefone: d.telefone == null ? null : String(d.telefone),
        };
        setNome(dto.nome);
        setConselho(dto.conselho || "");
        setNumeroRegistro(dto.numeroRegistro || "");
        setEmail(dto.email || "");
        setTelefone(dto.telefone || "");
      } catch (e: any) {
        if (active) setErr(e?.response?.data?.message || e?.message || "Erro ao carregar profissional.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [idTecnico]);

  async function salvar() {
    const n = nome.trim();
    const c = conselho.trim();
    const r = numeroRegistro.trim();
    if (!n) {
      setErr("Nome é obrigatório.");
      return;
    }
    if (!c) {
      setErr("Conselho é obrigatório.");
      return;
    }
    if (!r) {
      setErr("Registro é obrigatório.");
      return;
    }
    try {
      setLoading(true);
      setErr(null);
      const payload = {
        nome: n,
        conselho: c,
        numeroRegistro: r,
        email: email.trim() || null,
        telefone: telefone.trim() || null,
      };
      if (idTecnico) {
        await api.put(`/api/v1/engenharia/tecnicos/${idTecnico}`, payload);
        router.push(backHref);
        return;
      }
      const res = await api.post("/api/v1/engenharia/tecnicos", payload);
      const out = unwrapApiData<any>(res?.data || null) as any;
      const newId = Number(out?.idTecnico || 0);
      if (Number.isInteger(newId) && newId > 0) {
        router.push(`/dashboard/engenharia/profissionais/${newId}?returnTo=${encodeURIComponent(backHref)}`);
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
    const base = idTecnico ? "Cadastro de Profissional (editar)" : "Cadastro de Profissional (novo)";
    if (!returnTo) return `Engenharia → Profissionais (Técnicos) → ${base}`;
    const rt = returnTo.toLowerCase();
    if (rt.includes("/dashboard/engenharia/projetos/novo") || /\/dashboard\/engenharia\/projetos\/\d+/.test(rt)) {
      return `Engenharia → Projetos → Cadastro de projeto → Profissionais (Técnicos) → ${base}`;
    }
    if (/\/dashboard\/engenharia\/obras\/\d+/.test(rt)) return `Engenharia → Obras → Obra selecionada → Profissionais (Técnicos) → ${base}`;
    if (rt.includes("/dashboard/engenharia/obras")) return `Engenharia → Obras → Profissionais (Técnicos) → ${base}`;
    if (rt.includes("/dashboard/engenharia/profissionais")) return `Engenharia → Profissionais (Técnicos) → ${base}`;
    return `Engenharia → Profissionais (Técnicos) → ${base}`;
  }, [idTecnico, returnTo]);

  return (
    <div className="p-6 space-y-6 max-w-4xl text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[#6B7280]">{breadcrumb}</div>
          <h1 className="text-2xl font-semibold">Cadastro de Profissional</h1>
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
        <div className="border-b border-[#E5E7EB] px-4 py-3 font-medium">Dados do Profissional</div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Nome *</div>
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João da Silva" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Conselho *</div>
              <input className="input" value={conselho} onChange={(e) => setConselho(e.target.value)} placeholder="Ex.: CREA" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Registro *</div>
              <input className="input" value={numeroRegistro} onChange={(e) => setNumeroRegistro(e.target.value)} placeholder="Ex.: 123456/D" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">E-mail</div>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Telefone</div>
              <input className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
