"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function NovoContratoClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [numeroContrato, setNumeroContrato] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState("ATIVO");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [valorContratado, setValorContratado] = useState("");

  async function salvar() {
    try {
      setLoading(true);
      setErr(null);
      const payload = {
        numeroContrato,
        descricao: descricao || null,
        status,
        dataInicio: dataInicio ? new Date(`${dataInicio}T00:00:00`).toISOString() : new Date().toISOString(),
        dataFim: dataFim ? new Date(`${dataFim}T00:00:00`).toISOString() : null,
        valorContratado: Number(String(valorContratado || "0").replace(",", ".")) || 0,
      };
      const res = await api.post("/api/contratos", payload);
      const id = (res.data as any)?.id;
      if (id) router.push(`/dashboard/contratos?id=${id}`);
      else router.push("/dashboard/contratos");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar contrato");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Novo contrato</h1>
          <div className="text-sm text-slate-600">Um contrato pode existir sem obra; obras podem ser vinculadas depois.</div>
        </div>
        <button className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => router.push("/dashboard/contratos")}>
          Voltar
        </button>
      </div>

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
            <div className="text-sm text-slate-600">Data início</div>
            <input className="input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Data fim</div>
            <input className="input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Objeto / descrição</div>
            <textarea className="input min-h-[100px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição do objeto do contrato" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Valor contratado</div>
            <input className="input" value={valorContratado} onChange={(e) => setValorContratado(e.target.value)} placeholder="Ex: 1500000,00" />
          </div>
        </div>

        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

        <div className="flex justify-end">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            type="button"
            onClick={salvar}
            disabled={loading || !numeroContrato.trim()}
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}

