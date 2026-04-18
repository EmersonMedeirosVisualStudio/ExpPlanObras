"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";

type ObraFiltro = { id: number; nome: string };

type ServicoExecucaoRow = {
  codigoServico: string;
  descricaoServico: string | null;
  unidadeMedida: string | null;
  justificativa: string | null;
  anexos: string[];
  statusAprovacao: string;
  motivoRejeicao?: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
};

export default function ServicosExecucaoAprovacaoClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraFiltro[]>([]);
  const [idObra, setIdObra] = useState<number>(0);
  const [rows, setRows] = useState<ServicoExecucaoRow[]>([]);
  const [modalRejeitar, setModalRejeitar] = useState<{ open: boolean; codigoServico: string; motivo: string }>({ open: false, codigoServico: "", motivo: "" });

  const pendentes = useMemo(() => rows.filter((r) => String(r.statusAprovacao || "").toUpperCase() === "PENDENTE"), [rows]);

  async function carregarObras() {
    try {
      const { data } = await api.get("/api/v1/dashboard/me/filtros");
      const lista = Array.isArray(data?.data?.obras) ? data.data.obras : [];
      const mapped = lista.map((o: any) => ({ id: Number(o.id), nome: String(o.nome || `Obra #${o.id}`) }));
      setObras(mapped);
      if (!idObra && mapped.length) setIdObra(mapped[0].id);
    } catch {
      setObras([]);
    }
  }

  async function carregarServicos() {
    if (!idObra) return;
    try {
      setErr(null);
      setLoading(true);
      const { data } = await api.get(`/api/v1/engenharia/obras/${idObra}/servicos-execucao`);
      const lista = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setRows(lista as any);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar serviços");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function decidir(codigoServico: string, acao: "APROVAR" | "REJEITAR") {
    if (!idObra) return;
    try {
      setErr(null);
      setLoading(true);
      const body: any = { codigoServico, acao };
      if (acao === "REJEITAR") body.motivoRejeicao = modalRejeitar.motivo.trim();
      await api.put(`/api/v1/engenharia/obras/${idObra}/servicos-execucao`, body);
      await carregarServicos();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao decidir");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarObras();
  }, []);

  useEffect(() => {
    carregarServicos();
  }, [idObra]);

  return (
    <div className="p-6 space-y-6 max-w-6xl text-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Fiscalização → Aprovar serviços (execução)</h1>
          <div className="text-sm text-slate-600">Serviços não previstos criados na programação ficam pendentes até aprovação (quando aplicável).</div>
        </div>
        <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={carregarServicos} disabled={loading || !idObra}>
          Atualizar
        </button>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Obra</div>
            <select className="input" value={String(idObra || "")} onChange={(e) => setIdObra(Number(e.target.value))}>
              <option value="">Selecione</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Pendentes</div>
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">{pendentes.length}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold text-slate-900">Serviços criados na execução</div>
        {loading ? <div className="text-sm text-slate-500">Carregando…</div> : null}
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Justificativa</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.codigoServico} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{r.codigoServico}</td>
                  <td className="px-3 py-2">{r.descricaoServico || "—"}</td>
                  <td className="px-3 py-2">{r.statusAprovacao}</td>
                  <td className="px-3 py-2">
                    <div className="max-w-md whitespace-pre-wrap">{r.justificativa || "—"}</div>
                    {String(r.statusAprovacao || "").toUpperCase() === "REJEITADO" && r.motivoRejeicao ? (
                      <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">Motivo: {r.motivoRejeicao}</div>
                    ) : null}
                    {r.anexos?.length ? (
                      <div className="mt-2 space-y-1">
                        {r.anexos.slice(0, 5).map((a) => (
                          <a key={a} href={a} target="_blank" className="block truncate text-xs text-blue-700 underline">
                            {a}
                          </a>
                        ))}
                        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
                          {r.anexos
                            .filter((a) => a.includes("/api/v1/uploads/") || /\.(png|jpe?g|webp|gif)$/i.test(a))
                            .slice(0, 3)
                            .map((a) => (
                              <a key={`img-${a}`} href={a} target="_blank" className="block">
                                <img src={a} alt="Evidência" className="h-24 w-full rounded border object-cover" />
                              </a>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        className="rounded border bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        type="button"
                        disabled={loading || String(r.statusAprovacao || "").toUpperCase() === "APROVADO"}
                        onClick={() => decidir(r.codigoServico, "APROVAR")}
                      >
                        Aprovar
                      </button>
                      <button
                        className="rounded border bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        type="button"
                        disabled={loading || String(r.statusAprovacao || "").toUpperCase() === "REJEITADO"}
                        onClick={() => setModalRejeitar({ open: true, codigoServico: r.codigoServico, motivo: "" })}
                      >
                        Rejeitar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !rows.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                    Nenhum serviço criado na execução.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {modalRejeitar.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-white p-4 shadow-lg">
            <div className="text-lg font-semibold text-slate-900">Rejeitar serviço {modalRejeitar.codigoServico}</div>
            <div className="mt-1 text-sm text-slate-600">Informe o motivo da rejeição (obrigatório).</div>
            <textarea className="input mt-3 min-h-28" value={modalRejeitar.motivo} onChange={(e) => setModalRejeitar((p) => ({ ...p, motivo: e.target.value }))} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => setModalRejeitar({ open: false, codigoServico: "", motivo: "" })} disabled={loading}>
                Cancelar
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                type="button"
                disabled={loading || modalRejeitar.motivo.trim().length < 5}
                onClick={async () => {
                  const codigo = modalRejeitar.codigoServico;
                  await decidir(codigo, "REJEITAR");
                  setModalRejeitar({ open: false, codigoServico: "", motivo: "" });
                }}
              >
                Confirmar rejeição
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
