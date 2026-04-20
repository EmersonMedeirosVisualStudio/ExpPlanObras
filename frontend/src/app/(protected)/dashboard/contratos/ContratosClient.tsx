"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

type ContratoRow = {
  id: number;
  numeroContrato: string;
  descricao: string | null;
  status: string;
  dataInicio: string;
  dataFim: string | null;
  valorContratado: number;
  createdAt: string;
  updatedAt: string;
};

type ContratoDetail = ContratoRow & {
  obras: Array<{ id: number; name: string; status: string; valorPrevisto: number; createdAt: string; updatedAt: string }>;
  indicadores?: { valorExecutado: number | null; valorPago: number | null };
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ContratosClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const contratoId = sp.get("id");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ContratoRow[]>([]);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContratoDetail | null>(null);

  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && String(r.status).toUpperCase() !== status) return false;
      if (!qq) return true;
      return String(r.numeroContrato || "").toLowerCase().includes(qq) || String(r.descricao || "").toLowerCase().includes(qq);
    });
  }, [rows, q, status]);

  async function carregarLista() {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.get("/api/contratos");
      setRows((res.data as any[])?.map((x) => ({ ...x, valorContratado: Number(x.valorContratado || 0) })) ?? []);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar contratos");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarDetalhe(id: string) {
    if (!id) return;
    try {
      setDetailLoading(true);
      setDetailErr(null);
      const res = await api.get(`/api/contratos/${id}`);
      const d = res.data as any;
      setDetail({
        ...d,
        valorContratado: Number(d.valorContratado || 0),
        obras: (d.obras || []).map((o: any) => ({ ...o, valorPrevisto: Number(o.valorPrevisto || 0) })),
      });
    } catch (e: any) {
      setDetail(null);
      setDetailErr(e?.response?.data?.message || e?.message || "Erro ao carregar contrato");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    carregarLista();
  }, []);

  useEffect(() => {
    if (contratoId) carregarDetalhe(contratoId);
    else {
      setDetail(null);
      setDetailErr(null);
    }
  }, [contratoId]);

  if (contratoId) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Contrato #{contratoId}</h1>
            <div className="text-sm text-slate-600">Detalhes, financeiro e vínculos com obras.</div>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              type="button"
              onClick={() => router.push(`/dashboard/contratos/planejamento?id=${contratoId}`)}
            >
              Planejamento (Gantt)
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              type="button"
              onClick={() => router.push("/dashboard/contratos")}
            >
              Voltar
            </button>
          </div>
        </div>

        {detailErr ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{detailErr}</div> : null}
        {detailLoading ? <div className="text-sm text-slate-500">Carregando...</div> : null}

        {detail ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
              <div className="text-sm text-slate-500">Número</div>
              <div className="text-xl font-semibold">{detail.numeroContrato}</div>
              <div className="mt-2 text-sm text-slate-600">{detail.descricao || "—"}</div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="font-semibold">{detail.status}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Início</div>
                  <div className="font-semibold">{new Date(detail.dataInicio).toLocaleDateString("pt-BR")}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Fim</div>
                  <div className="font-semibold">{detail.dataFim ? new Date(detail.dataFim).toLocaleDateString("pt-BR") : "—"}</div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold">Financeiro</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-slate-600">Valor contratado</div>
                  <div className="font-semibold">{moeda(detail.valorContratado)}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-slate-600">Executado (medições)</div>
                  <div className="font-semibold">{moeda(Number(detail.indicadores?.valorExecutado || 0))}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-slate-600">Pago</div>
                  <div className="font-semibold">{moeda(Number(detail.indicadores?.valorPago || 0))}</div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-semibold">Obras vinculadas</div>
                <div className="text-xs text-slate-500">Regra: toda obra tem contrato; um contrato pode ter várias obras.</div>
              </div>
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Obra</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Valor previsto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.obras.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="px-3 py-2">{o.name}</td>
                        <td className="px-3 py-2">{o.status}</td>
                        <td className="px-3 py-2 text-right">{moeda(o.valorPrevisto)}</td>
                      </tr>
                    ))}
                    {!detail.obras.length ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                          Nenhuma obra vinculada a este contrato.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <div className="text-sm text-slate-600">Cadastre, acompanhe e integre com medições/pagamentos e obras.</div>
        </div>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={() => router.push("/dashboard/contratos/novo")}>
          Novo contrato
        </button>
      </div>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">Busca</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número/objeto" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="PENDENTE">Pendente</option>
              <option value="PARALISADO">Paralisado</option>
              <option value="ENCERRADO">Encerrado</option>
              <option value="FINALIZADO">Finalizado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="RESCINDIDO">Rescindido</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-2 justify-end gap-2">
            <button className="rounded-lg border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" type="button" onClick={carregarLista} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
        {err ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">Lista</div>
        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Número</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Início</th>
                <th className="px-3 py-2">Fim</th>
                <th className="px-3 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-t hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/dashboard/contratos?id=${r.id}`)}
                >
                  <td className="px-3 py-2 font-semibold">{r.numeroContrato}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{new Date(r.dataInicio).toLocaleDateString("pt-BR")}</td>
                  <td className="px-3 py-2">{r.dataFim ? new Date(r.dataFim).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-3 py-2 text-right">{moeda(Number(r.valorContratado || 0))}</td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Nenhum contrato encontrado.
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
