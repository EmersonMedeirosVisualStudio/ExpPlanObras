"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ObraRef = { id: number; nome: string };
type ResponsavelObraRef = {
  idResponsavelObra: number;
  idObra: number;
  tipo: "RESPONSAVEL_TECNICO" | "FISCAL_OBRA";
  nome: string;
  registroProfissional: string | null;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
};

export default function EngenhariaObrasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraRef[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelObraRef[]>([]);
  const [obraCadastroId, setObraCadastroId] = useState<number | null>(null);
  const [edicaoId, setEdicaoId] = useState<number | null>(null);
  const [formResp, setFormResp] = useState({
    tipo: "RESPONSAVEL_TECNICO" as "RESPONSAVEL_TECNICO" | "FISCAL_OBRA",
    nome: "",
    registroProfissional: "",
    cpf: "",
    email: "",
    telefone: "",
    ativo: true,
  });

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/v1/dashboard/me/filtros", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar obras");
      const lista = Array.isArray(json.data?.obras) ? json.data.obras : [];
      const obrasNormalizadas = lista.map((o: any) => ({ id: Number(o.id), nome: String(o.nome || `Obra #${o.id}`) }));
      setObras(obrasNormalizadas);
      if (!obraCadastroId && obrasNormalizadas.length > 0) setObraCadastroId(obrasNormalizadas[0].id);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar obras");
      setObras([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarResponsaveis(idObra: number) {
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/responsaveis?idObra=${idObra}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao carregar responsáveis.");
      const lista = Array.isArray(json.data) ? json.data : [];
      setResponsaveis(lista);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar responsáveis.");
      setResponsaveis([]);
    }
  }

  async function salvarResponsavel() {
    if (!obraCadastroId) return;
    try {
      setErr(null);
      const payload = {
        idObra: obraCadastroId,
        tipo: formResp.tipo,
        nome: formResp.nome,
        registroProfissional: formResp.registroProfissional || null,
        cpf: formResp.cpf || null,
        email: formResp.email || null,
        telefone: formResp.telefone || null,
        ativo: formResp.ativo,
      };
      const url = edicaoId ? `/api/v1/engenharia/obras/responsaveis/${edicaoId}` : "/api/v1/engenharia/obras/responsaveis";
      const method = edicaoId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao salvar responsável.");
      setEdicaoId(null);
      setFormResp({ tipo: "RESPONSAVEL_TECNICO", nome: "", registroProfissional: "", cpf: "", email: "", telefone: "", ativo: true });
      await carregarResponsaveis(obraCadastroId);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar responsável.");
    }
  }

  async function excluirResponsavel(idResponsavelObra: number) {
    if (!window.confirm("Excluir este registro?")) return;
    try {
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/obras/responsaveis/${idResponsavelObra}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.message || "Erro ao excluir responsável.");
      if (!obraCadastroId) return;
      await carregarResponsaveis(obraCadastroId);
    } catch (e: any) {
      setErr(e?.message || "Erro ao excluir responsável.");
    }
  }

  function iniciarEdicao(r: ResponsavelObraRef) {
    setEdicaoId(r.idResponsavelObra);
    setObraCadastroId(r.idObra);
    setFormResp({
      tipo: r.tipo,
      nome: r.nome || "",
      registroProfissional: r.registroProfissional || "",
      cpf: r.cpf || "",
      email: r.email || "",
      telefone: r.telefone || "",
      ativo: r.ativo,
    });
  }

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return obras;
    return obras.filter((o) => String(o.id).includes(term) || o.nome.toLowerCase().includes(term));
  }, [obras, q]);

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    const raw = searchParams.get("obraId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return;
    if (obras.some((o) => o.id === id)) setObraCadastroId(id);
  }, [searchParams, obras]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#cadastro-responsaveis") return;
    const el = document.getElementById("cadastro-responsaveis");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams, obras, obraCadastroId]);

  useEffect(() => {
    if (!obraCadastroId) return;
    carregarResponsaveis(obraCadastroId);
  }, [obraCadastroId]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Engenharia → Obras</h1>
          <div className="text-sm text-slate-600">Selecione uma obra para abrir as janelas operacionais (planejamento, apropriação, equipamentos, insumos e documentos).</div>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={carregar} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-4">
            <div className="text-sm text-slate-600">Buscar obra</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite ID ou nome" />
          </div>
          <div className="md:col-span-2 flex items-end justify-end">
            <div className="text-sm text-slate-500">{filtradas.length} obra(s)</div>
          </div>
        </div>
      </div>

      <div id="cadastro-responsaveis" className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Obras — Cadastros: Responsáveis Técnicos e Fiscais</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Obra</div>
            <select className="input" value={obraCadastroId || ""} onChange={(e) => setObraCadastroId(Number(e.target.value || 0) || null)}>
              <option value="">Selecione</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={formResp.tipo} onChange={(e) => setFormResp((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="RESPONSAVEL_TECNICO">Responsável Técnico</option>
              <option value="FISCAL_OBRA">Fiscal da Obra</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Nome</div>
            <input className="input" value={formResp.nome} onChange={(e) => setFormResp((p) => ({ ...p, nome: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Registro (CREA/CAU)</div>
            <input className="input" value={formResp.registroProfissional} onChange={(e) => setFormResp((p) => ({ ...p, registroProfissional: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">CPF</div>
            <input className="input" value={formResp.cpf} onChange={(e) => setFormResp((p) => ({ ...p, cpf: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">E-mail</div>
            <input className="input" value={formResp.email} onChange={(e) => setFormResp((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Telefone</div>
            <input className="input" value={formResp.telefone} onChange={(e) => setFormResp((p) => ({ ...p, telefone: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formResp.ativo} onChange={(e) => setFormResp((p) => ({ ...p, ativo: e.target.checked }))} />
              Ativo
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {edicaoId ? (
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm"
              onClick={() => {
                setEdicaoId(null);
                setFormResp({ tipo: "RESPONSAVEL_TECNICO", nome: "", registroProfissional: "", cpf: "", email: "", telefone: "", ativo: true });
              }}
            >
              Cancelar
            </button>
          ) : null}
          <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={salvarResponsavel} disabled={!obraCadastroId || !formResp.nome.trim()}>
            {edicaoId ? "Salvar alterações" : "Cadastrar"}
          </button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Registro</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {responsaveis.map((r) => (
                <tr key={r.idResponsavelObra} className="border-t">
                  <td className="px-3 py-2">{r.tipo === "RESPONSAVEL_TECNICO" ? "Responsável Técnico" : "Fiscal da Obra"}</td>
                  <td className="px-3 py-2">{r.nome}</td>
                  <td className="px-3 py-2">{r.registroProfissional || "-"}</td>
                  <td className="px-3 py-2">{[r.email, r.telefone].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-3 py-2">{r.ativo ? "ATIVO" : "INATIVO"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => iniciarEdicao(r)}>
                        Editar
                      </button>
                      <button type="button" className="rounded border px-2 py-1 text-xs text-red-700" onClick={() => excluirResponsavel(r.idResponsavelObra)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!responsaveis.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                    Sem responsáveis cadastrados para a obra selecionada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filtradas.map((o) => (
          <button
            key={o.id}
            type="button"
            className="rounded-xl border bg-white p-4 shadow-sm text-left hover:bg-slate-50"
            onClick={() => router.push(`/dashboard/engenharia/obras/${o.id}`)}
          >
            <div className="font-semibold">{o.nome}</div>
            <div className="text-sm text-slate-600">Abrir janelas da obra</div>
          </button>
        ))}
        {!filtradas.length ? <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">Nenhuma obra encontrada.</div> : null}
      </div>
    </div>
  );
}
