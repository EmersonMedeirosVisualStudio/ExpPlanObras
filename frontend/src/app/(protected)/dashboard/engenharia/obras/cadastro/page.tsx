"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type ObraRow = {
  id: number;
  name: string;
  type: string;
  status: string;
};

export default function EngenhariaCadastroObraPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [contratos, setContratos] = useState<Array<{ id: number; numeroContrato: string }>>([]);
  const [creatingContrato, setCreatingContrato] = useState(false);
  const [novoNumeroContrato, setNovoNumeroContrato] = useState("");

  const [form, setForm] = useState({
    name: "",
    contratoId: 0,
    type: "PARTICULAR",
    status: "NAO_INICIADA",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    description: "",
    valorPrevisto: "",
  });

  async function carregarObras() {
    try {
      setErr(null);
      const res = await api.get("/api/obras");
      const data = Array.isArray(res.data) ? res.data : [];
      setObras(
        data.map((o: any) => ({
          id: Number(o.id),
          name: String(o.name || `Obra #${o.id}`),
          type: String(o.type || ""),
          status: String(o.status || ""),
        }))
      );
    } catch (e: any) {
      setObras([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar obras");
    }
  }

  async function carregarContratos() {
    try {
      const res = await api.get("/api/contratos");
      const data = Array.isArray(res.data) ? res.data : [];
      const mapped = data.map((c: any) => ({ id: Number(c.id), numeroContrato: String(c.numeroContrato || "") }));
      setContratos(mapped);
      if (!form.contratoId && mapped.length > 0) {
        const nonPending = mapped.find((c) => String(c.numeroContrato).toUpperCase() !== "PENDENTE");
        setForm((p) => ({ ...p, contratoId: (nonPending || mapped[0]).id }));
      }
    } catch {
      setContratos([]);
    }
  }

  async function criarContrato() {
    const numeroContrato = novoNumeroContrato.trim();
    if (numeroContrato.length < 2) return;
    setCreatingContrato(true);
    try {
      const { data } = await api.post("/api/contratos", { numeroContrato });
      const created = { id: Number(data?.id), numeroContrato: String(data?.numeroContrato || numeroContrato) };
      if (created.id > 0) {
        setContratos((p) => [created, ...p.filter((x) => x.id !== created.id)]);
        setForm((p) => ({ ...p, contratoId: created.id }));
        setNovoNumeroContrato("");
      }
    } finally {
      setCreatingContrato(false);
    }
  }

  async function salvar() {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const obraPayload: any = {
        name: form.name.trim(),
        contratoId: form.contratoId,
        type: form.type,
        status: form.status,
        description: form.description.trim() || undefined,
        valorPrevisto: form.valorPrevisto.trim() ? Number(form.valorPrevisto) : undefined,
      };
      const created = await api.post("/api/obras", obraPayload);
      const id = Number(created.data?.id || created.data?.obra?.id || created.data?.data?.id || 0);
      const hasEndereco = !!(form.street.trim() || form.number.trim() || form.neighborhood.trim() || form.city.trim() || form.state.trim());
      if (id > 0 && hasEndereco) {
        await api.put(`/api/obras/${id}/endereco`, {
          origem: "MANUAL",
          logradouro: form.street.trim() || null,
          numero: form.number.trim() || null,
          bairro: form.neighborhood.trim() || null,
          cidade: form.city.trim() || null,
          uf: form.state.trim() || null,
        });
      }
      if (id > 0) {
        await api.post(`/api/obras/${id}/planilha/minima`).catch(() => null);
      }
      setOkMsg("Obra cadastrada.");
      setForm({
        name: "",
        contratoId: 0,
        type: "PARTICULAR",
        status: "NAO_INICIADA",
        street: "",
        number: "",
        neighborhood: "",
        city: "",
        state: "",
        description: "",
        valorPrevisto: "",
      });
      await carregarObras();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao cadastrar obra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarObras();
    carregarContratos();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl text-slate-900">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Engenharia → Cadastro de Obra</h1>
        <div className="text-sm text-slate-600">Crie obras e depois selecione a obra para abrir as janelas operacionais.</div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Contrato</div>
            <select className="input" value={String(form.contratoId || "")} onChange={(e) => setForm((p) => ({ ...p, contratoId: Number(e.target.value) }))}>
              <option value="">Selecione</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numeroContrato}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Novo contrato (se necessário)</div>
            <div className="flex gap-2">
              <input className="input" value={novoNumeroContrato} onChange={(e) => setNovoNumeroContrato(e.target.value)} placeholder="Ex: CT-2026-001" />
              <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50" type="button" onClick={criarContrato} disabled={creatingContrato || novoNumeroContrato.trim().length < 2}>
                {creatingContrato ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
          <div className="md:col-span-4">
            <div className="text-sm text-slate-600">Nome</div>
            <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: Obra X" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="PARTICULAR">Particular</option>
              <option value="PUBLICA">Pública</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Status</div>
            <select className="input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
              <option value="NAO_INICIADA">Não iniciada</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="PARADA">Parada</option>
              <option value="FINALIZADA">Finalizada</option>
              <option value="AGUARDANDO_RECURSOS">Aguardando recursos</option>
              <option value="AGUARDANDO_CONTRATO">Aguardando contrato</option>
              <option value="AGUARDANDO_OS">Aguardando OS</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Valor previsto</div>
            <input className="input" value={form.valorPrevisto} onChange={(e) => setForm((p) => ({ ...p, valorPrevisto: e.target.value }))} placeholder="Ex: 1500000" />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">UF</div>
            <input className="input" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} placeholder="Ex: SP" />
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Cidade</div>
            <input className="input" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Bairro</div>
            <input className="input" value={form.neighborhood} onChange={(e) => setForm((p) => ({ ...p, neighborhood: e.target.value }))} />
          </div>
          <div className="md:col-span-4">
            <div className="text-sm text-slate-600">Rua</div>
            <input className="input" value={form.street} onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Número</div>
            <input className="input" value={form.number} onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))} />
          </div>
          <div className="md:col-span-6">
            <div className="text-sm text-slate-600">Descrição</div>
            <textarea className="input min-h-24" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="rounded-lg border bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={carregarObras}>
            Recarregar
          </button>
          <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" disabled={loading || form.name.trim().length < 3 || !form.contratoId} onClick={salvar}>
            {loading ? "Salvando..." : "Cadastrar"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold text-slate-900">Obras cadastradas</div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2">{o.id}</td>
                  <td className="px-3 py-2">{o.name}</td>
                  <td className="px-3 py-2">{o.type}</td>
                  <td className="px-3 py-2">{o.status}</td>
                </tr>
              ))}
              {!obras.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                    Nenhuma obra cadastrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
