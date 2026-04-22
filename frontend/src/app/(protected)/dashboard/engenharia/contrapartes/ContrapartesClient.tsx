"use client";

import { useEffect, useMemo, useState } from "react";

type ApiEnvelope<T> = { success: boolean; message?: string; data: T };
function unwrapApiData<T>(json: any): T {
  if (json && typeof json === "object" && "data" in json) return (json as ApiEnvelope<T>).data;
  return json as T;
}

const CLASSIFICACOES = ["EXCELENTE", "BOA", "REGULAR", "EM_AVALIACAO", "NAO_RECOMENDADO"] as const;
type ClassificacaoStatus = (typeof CLASSIFICACOES)[number];
function classificacaoLabel(v: ClassificacaoStatus) {
  if (v === "EXCELENTE") return "Excelente";
  if (v === "BOA") return "Boa";
  if (v === "REGULAR") return "Regular";
  if (v === "EM_AVALIACAO") return "Em avaliação";
  return "Não recomendado";
}
function classificacaoPill(v: ClassificacaoStatus | null | undefined) {
  const s = v || "EM_AVALIACAO";
  if (s === "EXCELENTE") return "bg-green-100 text-green-700";
  if (s === "BOA") return "bg-emerald-100 text-emerald-700";
  if (s === "REGULAR") return "bg-amber-100 text-amber-700";
  if (s === "NAO_RECOMENDADO") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

type ContraparteDTO = {
  idContraparte: number;
  tipo: "PJ" | "PF";
  nomeRazao: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  status: "ATIVO" | "INATIVO";
  classificacaoStatus: ClassificacaoStatus | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: string | null;
  longitude: string | null;
};

type ContratoDTO = { idContratoLocacao: number; tipo: "ATIVO" | "PASSIVO" | "SERVICO"; status: "ATIVO" | "ENCERRADO"; numero: string | null; codigoServico: string | null; valorMensal: number | null };
type AvaliacaoDTO = { idAvaliacao: number; nota: number | null; comentario: string | null; criadoEm: string };
type OcorrenciaDTO = {
  idOcorrencia: number;
  idContratoLocacao: number | null;
  tipo: string | null;
  gravidade: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
  dataOcorrencia: string | null;
  descricao: string;
  criadoEm: string;
};

export default function ContrapartesClient() {
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"" | "PJ" | "PF">("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [classificacaoSel, setClassificacaoSel] = useState<ClassificacaoStatus[]>([]);
  const [rows, setRows] = useState<ContraparteDTO[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [novo, setNovo] = useState({
    tipo: "PJ" as "PJ" | "PF",
    nomeRazao: "",
    documento: "",
    email: "",
    telefone: "",
    classificacaoStatus: "EM_AVALIACAO" as ClassificacaoStatus,
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    latitude: "",
    longitude: "",
  });
  const [edicaoId, setEdicaoId] = useState<number | null>(null);

  const [idSelecionado, setIdSelecionado] = useState<number | null>(null);
  const [contratos, setContratos] = useState<ContratoDTO[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoDTO[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaDTO[]>([]);

  const [novaAvaliacao, setNovaAvaliacao] = useState({ nota: "", comentario: "" });
  const [novaOcorrencia, setNovaOcorrencia] = useState({ idContratoLocacao: "", tipo: "", gravidade: "MEDIA" as OcorrenciaDTO["gravidade"], dataOcorrencia: "", descricao: "" });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (tipo) params.set("tipo", tipo);
    if (cidade.trim()) params.set("cidade", cidade.trim());
    if (uf.trim()) params.set("uf", uf.trim().toUpperCase());
    if (classificacaoSel.length) params.set("classificacaoStatus", classificacaoSel.join(","));
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [q, tipo, cidade, uf, classificacaoSel]);

  const selecionado = useMemo(() => rows.find((r) => r.idContraparte === idSelecionado) || null, [rows, idSelecionado]);
  const cidadesOpcoes = useMemo(() => Array.from(new Set(rows.map((r) => String(r.cidade || "").trim()).filter(Boolean))).sort(), [rows]);
  const ufsOpcoes = useMemo(() => Array.from(new Set(rows.map((r) => String(r.uf || "").trim().toUpperCase()).filter(Boolean))).sort(), [rows]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/contrapartes${queryString}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar contrapartes");
      const data = unwrapApiData<any>(json);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar contrapartes");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarHistorico(idContraparte: number) {
    try {
      setLoading(true);
      setErr(null);
      const [contratosRes, avalRes, ocoRes] = await Promise.all([
        fetch(`/api/v1/engenharia/contratos-locacao?idContraparte=${idContraparte}`, { cache: "no-store" }),
        fetch(`/api/v1/engenharia/contrapartes/${idContraparte}/avaliacoes`, { cache: "no-store" }),
        fetch(`/api/v1/engenharia/contrapartes/${idContraparte}/ocorrencias`, { cache: "no-store" }),
      ]);
      const contratosJson = await contratosRes.json().catch(() => null);
      const avalJson = await avalRes.json().catch(() => null);
      const ocoJson = await ocoRes.json().catch(() => null);
      if (!contratosRes.ok) throw new Error(contratosJson?.message || "Erro ao carregar contratos");
      if (!avalRes.ok) throw new Error(avalJson?.message || "Erro ao carregar avaliações");
      if (!ocoRes.ok) throw new Error(ocoJson?.message || "Erro ao carregar ocorrências");
      const contratosData = unwrapApiData<any>(contratosJson);
      const avalData = unwrapApiData<any>(avalJson);
      const ocoData = unwrapApiData<any>(ocoJson);
      setContratos(Array.isArray(contratosData) ? contratosData : []);
      setAvaliacoes(Array.isArray(avalData) ? avalData : []);
      setOcorrencias(Array.isArray(ocoData) ? ocoData : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar histórico");
      setContratos([]);
      setAvaliacoes([]);
      setOcorrencias([]);
    } finally {
      setLoading(false);
    }
  }

  async function criarAvaliacao() {
    if (!idSelecionado) return;
    try {
      setErr(null);
      const payload: any = {
        nota: novaAvaliacao.nota ? Number(novaAvaliacao.nota) : null,
        comentario: novaAvaliacao.comentario || null,
      };
      const res = await fetch(`/api/v1/engenharia/contrapartes/${idSelecionado}/avaliacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar avaliação");
      setNovaAvaliacao({ nota: "", comentario: "" });
      await carregarHistorico(idSelecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar avaliação");
    }
  }

  async function criarOcorrencia() {
    if (!idSelecionado) return;
    try {
      setErr(null);
      const payload: any = {
        idContratoLocacao: novaOcorrencia.idContratoLocacao ? Number(novaOcorrencia.idContratoLocacao) : null,
        tipo: novaOcorrencia.tipo || null,
        gravidade: novaOcorrencia.gravidade,
        dataOcorrencia: novaOcorrencia.dataOcorrencia || null,
        descricao: novaOcorrencia.descricao,
      };
      const res = await fetch(`/api/v1/engenharia/contrapartes/${idSelecionado}/ocorrencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar ocorrência");
      setNovaOcorrencia({ idContratoLocacao: "", tipo: "", gravidade: "MEDIA", dataOcorrencia: "", descricao: "" });
      await carregarHistorico(idSelecionado);
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar ocorrência");
    }
  }

  async function criar() {
    try {
      setErr(null);
      const payload = {
        tipo: novo.tipo,
        nomeRazao: novo.nomeRazao,
        documento: novo.documento || null,
        email: novo.email || null,
        telefone: novo.telefone || null,
        classificacaoStatus: novo.classificacaoStatus,
        cep: novo.cep || null,
        logradouro: novo.logradouro || null,
        numero: novo.numero || null,
        complemento: novo.complemento || null,
        bairro: novo.bairro || null,
        cidade: novo.cidade || null,
        uf: novo.uf || null,
        latitude: novo.latitude || null,
        longitude: novo.longitude || null,
      };
      const res = await fetch("/api/v1/engenharia/contrapartes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao criar contraparte");
      setNovo({
        tipo: "PJ",
        nomeRazao: "",
        documento: "",
        email: "",
        telefone: "",
        classificacaoStatus: "EM_AVALIACAO",
        cep: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        uf: "",
        latitude: "",
        longitude: "",
      });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar contraparte");
    }
  }

  async function salvarEdicao() {
    if (!edicaoId) return;
    try {
      setErr(null);
      const payload = {
        tipo: novo.tipo,
        nomeRazao: novo.nomeRazao,
        documento: novo.documento || null,
        email: novo.email || null,
        telefone: novo.telefone || null,
        classificacaoStatus: novo.classificacaoStatus,
        cep: novo.cep || null,
        logradouro: novo.logradouro || null,
        numero: novo.numero || null,
        complemento: novo.complemento || null,
        bairro: novo.bairro || null,
        cidade: novo.cidade || null,
        uf: novo.uf || null,
        latitude: novo.latitude || null,
        longitude: novo.longitude || null,
      };
      const res = await fetch(`/api/v1/engenharia/contrapartes/${edicaoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao atualizar contraparte");
      setEdicaoId(null);
      setNovo({
        tipo: "PJ",
        nomeRazao: "",
        documento: "",
        email: "",
        telefone: "",
        classificacaoStatus: "EM_AVALIACAO",
        cep: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        uf: "",
        latitude: "",
        longitude: "",
      });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao atualizar contraparte");
    }
  }

  async function inativarSelecionada() {
    if (!edicaoId) return;
    if (!window.confirm("Inativar esta contraparte?")) return;
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/contrapartes/${edicaoId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao inativar contraparte");
      if (idSelecionado === edicaoId) setIdSelecionado(null);
      setEdicaoId(null);
      setNovo({
        tipo: "PJ",
        nomeRazao: "",
        documento: "",
        email: "",
        telefone: "",
        classificacaoStatus: "EM_AVALIACAO",
        cep: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        uf: "",
        latitude: "",
        longitude: "",
      });
      await carregar();
    } catch (e: any) {
      setErr(e?.message || "Erro ao inativar contraparte");
    }
  }

  function prepararEdicao(contraparte: ContraparteDTO) {
    setEdicaoId(contraparte.idContraparte);
    setNovo({
      tipo: contraparte.tipo,
      nomeRazao: contraparte.nomeRazao || "",
      documento: contraparte.documento || "",
      email: contraparte.email || "",
      telefone: contraparte.telefone || "",
      classificacaoStatus: (contraparte.classificacaoStatus || "EM_AVALIACAO") as ClassificacaoStatus,
      cep: contraparte.cep || "",
      logradouro: contraparte.logradouro || "",
      numero: contraparte.numero || "",
      complemento: contraparte.complemento || "",
      bairro: contraparte.bairro || "",
      cidade: contraparte.cidade || "",
      uf: contraparte.uf || "",
      latitude: contraparte.latitude || "",
      longitude: contraparte.longitude || "",
    });
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (!idSelecionado) return;
    carregarHistorico(idSelecionado);
  }, [idSelecionado]);

  return (
    <div className="space-y-6 text-[#111827]">
      <div>
        <h1 className="text-2xl font-semibold">Parceiros Comerciais (Contrapartes)</h1>
        <p className="text-sm text-[#6B7280]">Cadastro unificado de pessoas jurídicas e pessoas físicas.</p>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#2563EB]" />
            <div>
              <div className="text-sm font-semibold">Filtros</div>
              <div className="text-xs text-[#6B7280]">Use filtros de seleção e status (caixa de marcar).</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              onClick={() => setFiltrosAberto((v) => !v)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {filtrosAberto ? "Ocultar" : "Exibir"}
            </button>
            <button
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
              type="button"
              onClick={carregar}
              disabled={loading}
            >
              {loading ? "Carregando..." : "Aplicar"}
            </button>
          </div>
        </div>

        {filtrosAberto ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <div className="text-sm text-[#6B7280]">Busca</div>
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, documento, email ou telefone" />
              </div>
              <div>
                <div className="text-sm text-[#6B7280]">Tipo</div>
                <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="PJ">PJ</option>
                  <option value="PF">PF</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-[#6B7280]">Cidade</div>
                <input className="input" value={cidade} onChange={(e) => setCidade(e.target.value)} list="contrapartes-cidades" placeholder="Selecione ou digite" />
                <datalist id="contrapartes-cidades">
                  {cidadesOpcoes.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <div className="text-sm text-[#6B7280]">UF</div>
                <input className="input" value={uf} onChange={(e) => setUf(e.target.value)} list="contrapartes-ufs" placeholder="Selecione" />
                <datalist id="contrapartes-ufs">
                  {ufsOpcoes.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <div className="text-sm text-[#6B7280]">Status</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CLASSIFICACOES.map((s) => {
                  const checked = classificacaoSel.includes(s);
                  return (
                    <label key={s} className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setClassificacaoSel((prev) => (on ? Array.from(new Set([...prev, s])) : prev.filter((x) => x !== s)));
                        }}
                      />
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${classificacaoPill(s)}`}>{classificacaoLabel(s)}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                  onClick={() => {
                    setQ("");
                    setTipo("");
                    setCidade("");
                    setUf("");
                    setClassificacaoSel([]);
                  }}
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#16A34A]" />
            <div>
              <div className="text-sm font-semibold">{edicaoId ? `Editar contraparte #${edicaoId}` : "Nova contraparte"}</div>
              <div className="text-xs text-[#6B7280]">Cadastre uma nova pessoa jurídica ou física.</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-[#6B7280]">Tipo</div>
            <select className="input" value={novo.tipo} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="PJ">PJ</option>
              <option value="PF">PF</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Nome/Razão Social</div>
            <input className="input" value={novo.nomeRazao} onChange={(e) => setNovo((p) => ({ ...p, nomeRazao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Documento</div>
            <input className="input" value={novo.documento} onChange={(e) => setNovo((p) => ({ ...p, documento: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Status</div>
            <select className="input" value={novo.classificacaoStatus} onChange={(e) => setNovo((p) => ({ ...p, classificacaoStatus: e.target.value as any }))}>
              {CLASSIFICACOES.map((s) => (
                <option key={s} value={s}>
                  {classificacaoLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Email</div>
            <input className="input" value={novo.email} onChange={(e) => setNovo((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-[#6B7280]">Telefone</div>
            <input className="input" value={novo.telefone} onChange={(e) => setNovo((p) => ({ ...p, telefone: e.target.value }))} />
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 space-y-3">
          <div className="text-sm font-semibold">Endereço</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div>
              <div className="text-sm text-[#6B7280]">CEP</div>
              <input className="input" value={novo.cep} onChange={(e) => setNovo((p) => ({ ...p, cep: e.target.value }))} />
            </div>
            <div className="md:col-span-3">
              <div className="text-sm text-[#6B7280]">Logradouro</div>
              <input className="input" value={novo.logradouro} onChange={(e) => setNovo((p) => ({ ...p, logradouro: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Número</div>
              <input className="input" value={novo.numero} onChange={(e) => setNovo((p) => ({ ...p, numero: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Complemento</div>
              <input className="input" value={novo.complemento} onChange={(e) => setNovo((p) => ({ ...p, complemento: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Bairro</div>
              <input className="input" value={novo.bairro} onChange={(e) => setNovo((p) => ({ ...p, bairro: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Cidade</div>
              <input className="input" value={novo.cidade} onChange={(e) => setNovo((p) => ({ ...p, cidade: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">UF</div>
              <input className="input" value={novo.uf} onChange={(e) => setNovo((p) => ({ ...p, uf: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Latitude</div>
              <input className="input" value={novo.latitude} onChange={(e) => setNovo((p) => ({ ...p, latitude: e.target.value }))} />
            </div>
            <div>
              <div className="text-sm text-[#6B7280]">Longitude</div>
              <input className="input" value={novo.longitude} onChange={(e) => setNovo((p) => ({ ...p, longitude: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="flex gap-2">
            {edicaoId ? (
              <button
                className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                type="button"
                onClick={() => {
                  setEdicaoId(null);
                  setNovo({
                    tipo: "PJ",
                    nomeRazao: "",
                    documento: "",
                    email: "",
                    telefone: "",
                    classificacaoStatus: "EM_AVALIACAO",
                    cep: "",
                    logradouro: "",
                    numero: "",
                    complemento: "",
                    bairro: "",
                    cidade: "",
                    uf: "",
                    latitude: "",
                    longitude: "",
                  });
                }}
              >
                Cancelar
              </button>
            ) : null}
            {edicaoId ? (
              <button className="rounded-lg bg-[#EF4444] px-4 py-2 text-sm text-white hover:bg-[#DC2626]" type="button" onClick={inativarSelecionada}>
                Inativar
              </button>
            ) : null}
            <button
              className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60"
              type="button"
              onClick={edicaoId ? salvarEdicao : criar}
              disabled={loading}
            >
              {edicaoId ? "Salvar" : "Criar"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Contrapartes cadastradas</div>
            <div className="text-xs text-[#6B7280]">Lista de todas as contrapartes registradas no sistema.</div>
          </div>
        </div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-[#111827]">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Nome/Razão</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Cidade/UF</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.idContraparte}
                  className={`border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB] ${idSelecionado === r.idContraparte ? "bg-[#EFF6FF]" : ""}`}
                  onClick={() => setIdSelecionado(r.idContraparte)}
                >
                  <td className="px-3 py-2">{r.idContraparte}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">{r.nomeRazao}</td>
                  <td className="px-3 py-2">{r.documento || "-"}</td>
                  <td className="px-3 py-2">{[r.cidade, r.uf].filter(Boolean).join(" / ") || "-"}</td>
                  <td className="px-3 py-2">{[r.email, r.telefone].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${classificacaoPill(r.classificacaoStatus)}`}>
                      {classificacaoLabel((r.classificacaoStatus || "EM_AVALIACAO") as ClassificacaoStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.status === "ATIVO" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {r.status === "ATIVO" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-2 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                      onClick={(e) => {
                        e.stopPropagation();
                        prepararEdicao(r);
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={9}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#7C3AED]" />
          <div>
            <div className="text-sm font-semibold">Histórico do parceiro</div>
            <div className="text-xs text-[#6B7280]">Selecione uma contraparte na tabela para visualizar o histórico completo.</div>
          </div>
        </div>
        {!selecionado ? <div className="text-sm text-[#6B7280]">Selecione uma contraparte na tabela acima para visualizar o histórico.</div> : null}

        {selecionado ? (
          <>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm">
              {selecionado.nomeRazao} ({selecionado.tipo}) • ID {selecionado.idContraparte}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="font-semibold">Contratos</div>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#F9FAFB] text-left text-[#111827]">
                      <tr>
                        <th className="px-2 py-1">ID</th>
                        <th className="px-2 py-1">Tipo</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Serviço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratos.map((c) => (
                        <tr key={c.idContratoLocacao} className="border-t border-[#E5E7EB]">
                          <td className="px-2 py-1">{c.idContratoLocacao}</td>
                          <td className="px-2 py-1">{c.tipo}</td>
                          <td className="px-2 py-1">{c.status}</td>
                          <td className="px-2 py-1">{c.codigoServico || "-"}</td>
                        </tr>
                      ))}
                      {!contratos.length ? (
                        <tr>
                          <td className="px-2 py-3 text-center text-[#6B7280]" colSpan={4}>
                            Sem contratos.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="font-semibold">Avaliações</div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-sm text-[#6B7280]">Nota (0–10)</div>
                    <input className="input" value={novaAvaliacao.nota} onChange={(e) => setNovaAvaliacao((p) => ({ ...p, nota: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-sm text-[#6B7280]">Comentário</div>
                    <input className="input" value={novaAvaliacao.comentario} onChange={(e) => setNovaAvaliacao((p) => ({ ...p, comentario: e.target.value }))} />
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60" type="button" onClick={criarAvaliacao} disabled={loading}>
                      Registrar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {avaliacoes.map((a) => (
                    <div key={a.idAvaliacao} className="rounded-md border border-[#E5E7EB] p-2 text-sm">
                      <div className="font-semibold">{a.nota == null ? "Sem nota" : `Nota ${a.nota}`}</div>
                      <div className="text-[#6B7280]">{a.comentario || "-"}</div>
                      <div className="text-xs text-[#6B7280]">{String(a.criadoEm || "").slice(0, 19).replace("T", " ")}</div>
                    </div>
                  ))}
                  {!avaliacoes.length ? <div className="text-sm text-[#6B7280]">Sem avaliações.</div> : null}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="font-semibold">Ocorrências</div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-sm text-[#6B7280]">Contrato (opcional)</div>
                    <input
                      className="input"
                      value={novaOcorrencia.idContratoLocacao}
                      onChange={(e) => setNovaOcorrencia((p) => ({ ...p, idContratoLocacao: e.target.value }))}
                      placeholder="ID do contrato"
                    />
                  </div>
                  <div>
                    <div className="text-sm text-[#6B7280]">Tipo</div>
                    <input className="input" value={novaOcorrencia.tipo} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, tipo: e.target.value }))} placeholder="Ex.: atraso" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-[#6B7280]">Gravidade</div>
                      <select className="input" value={novaOcorrencia.gravidade} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, gravidade: e.target.value as any }))}>
                        <option value="BAIXA">Baixa</option>
                        <option value="MEDIA">Média</option>
                        <option value="ALTA">Alta</option>
                        <option value="CRITICA">Crítica</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-sm text-[#6B7280]">Data</div>
                      <input className="input" type="date" value={novaOcorrencia.dataOcorrencia} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, dataOcorrencia: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-[#6B7280]">Descrição</div>
                    <input className="input" value={novaOcorrencia.descricao} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, descricao: e.target.value }))} />
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60" type="button" onClick={criarOcorrencia} disabled={loading}>
                      Registrar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {ocorrencias.map((o) => (
                    <div key={o.idOcorrencia} className="rounded-md border border-[#E5E7EB] p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{o.tipo || "Ocorrência"}</div>
                        <div className="text-xs">{o.gravidade}</div>
                      </div>
                      <div className="text-[#6B7280]">{o.descricao}</div>
                      <div className="text-xs text-[#6B7280]">
                        {o.dataOcorrencia || String(o.criadoEm || "").slice(0, 10)} • Contrato {o.idContratoLocacao ?? "-"}
                      </div>
                    </div>
                  ))}
                  {!ocorrencias.length ? <div className="text-sm text-[#6B7280]">Sem ocorrências.</div> : null}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
