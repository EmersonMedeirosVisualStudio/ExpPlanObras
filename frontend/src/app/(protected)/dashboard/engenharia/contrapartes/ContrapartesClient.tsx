"use client";

import { useEffect, useMemo, useState } from "react";

type ContraparteDTO = {
  idContraparte: number;
  tipo: "PJ" | "PF";
  nomeRazao: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  status: "ATIVO" | "INATIVO";
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
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"" | "PJ" | "PF">("");
  const [rows, setRows] = useState<ContraparteDTO[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [novo, setNovo] = useState({ tipo: "PJ" as "PJ" | "PF", nomeRazao: "", documento: "", email: "", telefone: "" });
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
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [q, tipo]);

  const selecionado = useMemo(() => rows.find((r) => r.idContraparte === idSelecionado) || null, [rows, idSelecionado]);

  async function carregar() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/contrapartes${queryString}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar contrapartes");
      const data = await res.json();
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
      setContratos(Array.isArray(contratosJson) ? contratosJson : []);
      setAvaliacoes(Array.isArray(avalJson) ? avalJson : []);
      setOcorrencias(Array.isArray(ocoJson) ? ocoJson : []);
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
      };
      const res = await fetch("/api/v1/engenharia/contrapartes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Erro ao criar contraparte");
      setNovo({ tipo: "PJ", nomeRazao: "", documento: "", email: "", telefone: "" });
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
      };
      const res = await fetch(`/api/v1/engenharia/contrapartes/${edicaoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Erro ao atualizar contraparte");
      setEdicaoId(null);
      setNovo({ tipo: "PJ", nomeRazao: "", documento: "", email: "", telefone: "" });
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
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Erro ao inativar contraparte");
      if (idSelecionado === edicaoId) setIdSelecionado(null);
      setEdicaoId(null);
      setNovo({ tipo: "PJ", nomeRazao: "", documento: "", email: "", telefone: "" });
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Parceiros Comerciais (Contrapartes)</h1>
        <p className="text-sm text-slate-600">Cadastro unificado de pessoas jurídicas e pessoas físicas.</p>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Busca</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome/razão social, documento" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
              <option value="">Todos</option>
              <option value="PJ">PJ</option>
              <option value="PF">PF</option>
            </select>
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregar} disabled={loading}>
              {loading ? "Carregando..." : "Atualizar"}
            </button>
          </div>
        </div>
        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">{edicaoId ? `Editar contraparte #${edicaoId}` : "Nova contraparte"}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={novo.tipo} onChange={(e) => setNovo((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="PJ">PJ</option>
              <option value="PF">PF</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Nome/Razão</div>
            <input className="input" value={novo.nomeRazao} onChange={(e) => setNovo((p) => ({ ...p, nomeRazao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Documento</div>
            <input className="input" value={novo.documento} onChange={(e) => setNovo((p) => ({ ...p, documento: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Email</div>
            <input className="input" value={novo.email} onChange={(e) => setNovo((p) => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Telefone</div>
            <input className="input" value={novo.telefone} onChange={(e) => setNovo((p) => ({ ...p, telefone: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end">
          <div className="flex gap-2">
            {edicaoId ? (
              <button
                className="rounded-lg border px-4 py-2 text-sm"
                type="button"
                onClick={() => {
                  setEdicaoId(null);
                  setNovo({ tipo: "PJ", nomeRazao: "", documento: "", email: "", telefone: "" });
                }}
              >
                Cancelar
              </button>
            ) : null}
            {edicaoId ? (
              <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white" type="button" onClick={inativarSelecionada}>
                Inativar
              </button>
            ) : null}
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={edicaoId ? salvarEdicao : criar}>
              {edicaoId ? "Salvar" : "Criar"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-lg font-semibold">Contrapartes</div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Nome/Razão</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Contato</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.idContraparte}
                  className={`border-t cursor-pointer ${idSelecionado === r.idContraparte ? "bg-blue-50" : ""}`}
                  onClick={() => setIdSelecionado(r.idContraparte)}
                >
                  <td className="px-3 py-2">{r.idContraparte}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2">{r.nomeRazao}</td>
                  <td className="px-3 py-2">{r.documento || "-"}</td>
                  <td className="px-3 py-2">{[r.email, r.telefone].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
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
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="text-lg font-semibold">Histórico do parceiro</div>
        {!selecionado ? <div className="text-sm text-slate-500">Selecione uma contraparte na tabela para visualizar o histórico.</div> : null}

        {selecionado ? (
          <>
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              {selecionado.nomeRazao} ({selecionado.tipo}) • ID {selecionado.idContraparte}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="font-semibold">Contratos</div>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-2 py-1">ID</th>
                        <th className="px-2 py-1">Tipo</th>
                        <th className="px-2 py-1">Status</th>
                        <th className="px-2 py-1">Serviço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contratos.map((c) => (
                        <tr key={c.idContratoLocacao} className="border-t">
                          <td className="px-2 py-1">{c.idContratoLocacao}</td>
                          <td className="px-2 py-1">{c.tipo}</td>
                          <td className="px-2 py-1">{c.status}</td>
                          <td className="px-2 py-1">{c.codigoServico || "-"}</td>
                        </tr>
                      ))}
                      {!contratos.length ? (
                        <tr>
                          <td className="px-2 py-3 text-center text-slate-500" colSpan={4}>
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
                    <div className="text-sm text-slate-600">Nota (0–10)</div>
                    <input className="input" value={novaAvaliacao.nota} onChange={(e) => setNovaAvaliacao((p) => ({ ...p, nota: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-sm text-slate-600">Comentário</div>
                    <input className="input" value={novaAvaliacao.comentario} onChange={(e) => setNovaAvaliacao((p) => ({ ...p, comentario: e.target.value }))} />
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criarAvaliacao} disabled={loading}>
                      Registrar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {avaliacoes.map((a) => (
                    <div key={a.idAvaliacao} className="rounded-md border p-2 text-sm">
                      <div className="font-semibold">{a.nota == null ? "Sem nota" : `Nota ${a.nota}`}</div>
                      <div className="text-slate-600">{a.comentario || "-"}</div>
                      <div className="text-xs text-slate-500">{String(a.criadoEm || "").slice(0, 19).replace("T", " ")}</div>
                    </div>
                  ))}
                  {!avaliacoes.length ? <div className="text-sm text-slate-500">Sem avaliações.</div> : null}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <div className="font-semibold">Ocorrências</div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-sm text-slate-600">Contrato (opcional)</div>
                    <input
                      className="input"
                      value={novaOcorrencia.idContratoLocacao}
                      onChange={(e) => setNovaOcorrencia((p) => ({ ...p, idContratoLocacao: e.target.value }))}
                      placeholder="ID do contrato"
                    />
                  </div>
                  <div>
                    <div className="text-sm text-slate-600">Tipo</div>
                    <input className="input" value={novaOcorrencia.tipo} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, tipo: e.target.value }))} placeholder="Ex.: atraso" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-slate-600">Gravidade</div>
                      <select className="input" value={novaOcorrencia.gravidade} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, gravidade: e.target.value as any }))}>
                        <option value="BAIXA">Baixa</option>
                        <option value="MEDIA">Média</option>
                        <option value="ALTA">Alta</option>
                        <option value="CRITICA">Crítica</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-sm text-slate-600">Data</div>
                      <input className="input" type="date" value={novaOcorrencia.dataOcorrencia} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, dataOcorrencia: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600">Descrição</div>
                    <input className="input" value={novaOcorrencia.descricao} onChange={(e) => setNovaOcorrencia((p) => ({ ...p, descricao: e.target.value }))} />
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criarOcorrencia} disabled={loading}>
                      Registrar
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {ocorrencias.map((o) => (
                    <div key={o.idOcorrencia} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{o.tipo || "Ocorrência"}</div>
                        <div className="text-xs">{o.gravidade}</div>
                      </div>
                      <div className="text-slate-600">{o.descricao}</div>
                      <div className="text-xs text-slate-500">
                        {o.dataOcorrencia || String(o.criadoEm || "").slice(0, 10)} • Contrato {o.idContratoLocacao ?? "-"}
                      </div>
                    </div>
                  ))}
                  {!ocorrencias.length ? <div className="text-sm text-slate-500">Sem ocorrências.</div> : null}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
