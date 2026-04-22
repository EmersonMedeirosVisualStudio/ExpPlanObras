"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const MapaObras = dynamic(() => import("@/components/MapaObras"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-lg border border-[#E5E7EB] bg-[#F3F4F6]" />,
});

type ContratoRow = { id: number; numeroContrato: string; objeto: string | null };
type ObraRow = {
  id: number;
  contratoId: number;
  name: string;
  type: "PUBLICA" | "PARTICULAR";
  status: string;
  valorPrevisto: number | null;
  enderecoObra?: { latitude?: string | null; longitude?: string | null } | null;
};

type EnderecoRow = {
  id: number;
  tenantId: number;
  obraId: number;
  nomeEndereco: string;
  principal: boolean;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: string | null;
  longitude: string | null;
  origemEndereco: string;
  origemCoordenada: string;
};

export default function EngenhariaCadastroObraPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [obrasContrato, setObrasContrato] = useState<ObraRow[]>([]);
  const [contratos, setContratos] = useState<ContratoRow[]>([]);

  const [contratoId, setContratoId] = useState<number>(0);
  const [obraId, setObraId] = useState<number | null>(null);
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const [enderecos, setEnderecos] = useState<EnderecoRow[]>([]);
  const [obraFormAberto, setObraFormAberto] = useState(false);
  const [enderecoFormAberto, setEnderecoFormAberto] = useState(false);

  const [formObra, setFormObra] = useState({
    name: "",
    type: "PARTICULAR" as "PARTICULAR" | "PUBLICA",
    status: "NAO_INICIADA",
    description: "",
    valorPrevisto: "",
  });

  async function carregarContratos() {
    try {
      const res = await api.get("/api/contratos");
      const data = Array.isArray(res.data) ? res.data : [];
      const mapped = data.map((c: any) => ({ id: Number(c.id), numeroContrato: String(c.numeroContrato || ""), objeto: c.objeto ?? null }));
      setContratos(mapped);
      if (!contratoId && mapped.length > 0) {
        const nonPending = mapped.find((c) => String(c.numeroContrato).toUpperCase() !== "PENDENTE");
        setContratoId((nonPending || mapped[0]).id);
      }
    } catch {
      setContratos([]);
    }
  }

  async function carregarObrasContrato(idContrato: number) {
    if (!idContrato) {
      setObrasContrato([]);
      return;
    }
    try {
      setErr(null);
      const res = await api.get(`/api/obras?contratoId=${idContrato}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setObrasContrato(
        data.map((o: any) => ({
          id: Number(o.id),
          contratoId: Number(o.contratoId),
          name: String(o.name || `Obra #${o.id}`),
          type: (String(o.type || "PARTICULAR").toUpperCase() === "PUBLICA" ? "PUBLICA" : "PARTICULAR") as any,
          status: String(o.status || "NAO_INICIADA"),
          valorPrevisto: o.valorPrevisto == null ? null : Number(o.valorPrevisto),
          enderecoObra: o.enderecoObra ?? null,
        }))
      );
    } catch (e: any) {
      setObrasContrato([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar obras do contrato");
    }
  }

  async function carregarObraParaEdicao(id: number) {
    try {
      setErr(null);
      const res = await api.get(`/api/obras/${id}`);
      const o: any = res.data;
      if (!o?.id) throw new Error("Obra não encontrada");
      setObraFormAberto(true);
      setObraId(Number(o.id));
      setFormObra({
        name: String(o.name || ""),
        type: (String(o.type || "PARTICULAR").toUpperCase() === "PUBLICA" ? "PUBLICA" : "PARTICULAR") as any,
        status: String(o.status || "NAO_INICIADA"),
        description: String(o.description || ""),
        valorPrevisto: o.valorPrevisto == null ? "" : String(Number(o.valorPrevisto)),
      });
      await carregarEnderecos(Number(o.id));
      setEnderecoId(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar obra");
    }
  }

  async function carregarEnderecos(idObra: number) {
    try {
      const res = await api.get(`/api/obras/${idObra}/enderecos`);
      const data = Array.isArray(res.data) ? res.data : [];
      setEnderecos(data);
    } catch (e: any) {
      setEnderecos([]);
      setErr(e?.response?.data?.message || e?.message || "Erro ao carregar endereços da obra");
    }
  }

  async function salvar() {
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const obraPayload: any = {
        name: formObra.name.trim(),
        contratoId,
        type: formObra.type,
        status: formObra.status,
        description: formObra.description.trim() || undefined,
        valorPrevisto: formObra.valorPrevisto.trim() ? Number(formObra.valorPrevisto) : undefined,
      };
      let id = obraId;
      if (obraId) {
        await api.put(`/api/obras/${obraId}`, obraPayload);
        id = obraId;
      } else {
        const created = await api.post("/api/obras", obraPayload);
        id = Number(created.data?.id || created.data?.obra?.id || created.data?.data?.id || 0);
      }
      if (id && id > 0) await api.post(`/api/obras/${id}/planilha/minima`).catch(() => null);
      await carregarObrasContrato(contratoId);
      if (id && id > 0) await carregarObraParaEdicao(id);
      setOkMsg(obraId ? "Obra atualizada." : "Obra cadastrada.");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao cadastrar obra");
    } finally {
      setLoading(false);
    }
  }

  const [formEndereco, setFormEndereco] = useState({
    nomeEndereco: "Principal",
    principal: true,
    origem: "MANUAL" as "MANUAL" | "CEP" | "LINK",
    link: "",
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

  function limparEnderecoForm() {
    setEnderecoFormAberto(true);
    setEnderecoId(null);
    setFormEndereco({
      nomeEndereco: "Principal",
      principal: enderecos.length === 0,
      origem: "MANUAL",
      link: "",
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
  }

  async function salvarEndereco() {
    if (!obraId) return;
    try {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      const payload: any = {
        nomeEndereco: formEndereco.nomeEndereco.trim() || "Principal",
        principal: Boolean(formEndereco.principal),
        origem: formEndereco.origem,
      };

      if (formEndereco.origem === "CEP") {
        payload.cep = formEndereco.cep;
        payload.numero = formEndereco.numero || null;
      } else if (formEndereco.origem === "LINK") {
        payload.link = formEndereco.link;
      } else {
        payload.cep = formEndereco.cep || null;
        payload.logradouro = formEndereco.logradouro || null;
        payload.numero = formEndereco.numero || null;
        payload.complemento = formEndereco.complemento || null;
        payload.bairro = formEndereco.bairro || null;
        payload.cidade = formEndereco.cidade || null;
        payload.uf = formEndereco.uf || null;
        payload.latitude = formEndereco.latitude || null;
        payload.longitude = formEndereco.longitude || null;
      }

      if (enderecoId) {
        await api.put(`/api/obras/${obraId}/enderecos/${enderecoId}`, payload);
      } else {
        await api.post(`/api/obras/${obraId}/enderecos`, payload);
      }
      await carregarEnderecos(obraId);
      setOkMsg(enderecoId ? "Endereço atualizado." : "Endereço cadastrado.");
      limparEnderecoForm();
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao salvar endereço");
    } finally {
      setLoading(false);
    }
  }

  async function removerEndereco(id: number) {
    if (!obraId) return;
    if (!window.confirm("Remover este endereço?")) return;
    try {
      setLoading(true);
      setErr(null);
      await api.delete(`/api/obras/${obraId}/enderecos/${id}`);
      if (enderecoId === id) limparEnderecoForm();
      await carregarEnderecos(obraId);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Erro ao remover endereço");
    } finally {
      setLoading(false);
    }
  }

  function selecionarEndereco(e: EnderecoRow) {
    setEnderecoFormAberto(true);
    setEnderecoId(e.id);
    setFormEndereco({
      nomeEndereco: e.nomeEndereco || "Principal",
      principal: Boolean(e.principal),
      origem: "MANUAL",
      link: "",
      cep: e.cep || "",
      logradouro: e.logradouro || "",
      numero: e.numero || "",
      complemento: e.complemento || "",
      bairro: e.bairro || "",
      cidade: e.cidade || "",
      uf: e.uf || "",
      latitude: e.latitude || "",
      longitude: e.longitude || "",
    });
  }

  useEffect(() => {
    carregarContratos();
  }, []);

  useEffect(() => {
    if (!contratoId) return;
    setObraId(null);
    setEnderecoId(null);
    setEnderecos([]);
    setObraFormAberto(false);
    setEnderecoFormAberto(false);
    setFormObra({ name: "", type: "PARTICULAR", status: "NAO_INICIADA", description: "", valorPrevisto: "" });
    carregarObrasContrato(contratoId);
  }, [contratoId]);

  const contratoSelecionado = useMemo(() => contratos.find((c) => c.id === contratoId) || null, [contratos, contratoId]);
  const obraSelecionada = useMemo(() => obrasContrato.find((o) => o.id === obraId) || null, [obrasContrato, obraId]);

  const mapaData = useMemo(() => {
    if (obraSelecionada && enderecos.length > 0) {
      return enderecos.map((e) => ({
        id: e.id,
        name: `${obraSelecionada.name} - ${e.nomeEndereco || "Principal"}`,
        type: obraSelecionada.type,
        status: obraSelecionada.status as any,
        enderecoObra: { latitude: e.latitude, longitude: e.longitude },
        valorPrevisto: obraSelecionada.valorPrevisto ?? undefined,
      }));
    }
    return obrasContrato.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      status: o.status as any,
      enderecoObra: o.enderecoObra ?? null,
      valorPrevisto: o.valorPrevisto ?? undefined,
    }));
  }, [obrasContrato, obraSelecionada, enderecos]);

  const mapaSelectedId = useMemo(() => {
    if (obraSelecionada && enderecos.length > 0) return enderecoId;
    return obraId;
  }, [obraId, enderecoId, obraSelecionada, enderecos]);

  const enderecoCodigo = useMemo(() => {
    if (!obraId) return "";
    const nome = formEndereco.nomeEndereco.trim() || "Principal";
    return `#${obraId}/${enderecoId ? enderecoId : "novo"} - ${nome}`;
  }, [obraId, enderecoId, formEndereco.nomeEndereco]);

  return (
    <div className="space-y-6 text-[#111827]">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Engenharia → Cadastro de Obra</h1>
        <div className="text-sm text-slate-600">Crie obras e depois selecione a obra para abrir as janelas operacionais.</div>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
      {okMsg ? <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{okMsg}</div> : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Selecionar contrato</div>
            <div className="text-xs text-[#6B7280]">Selecione um contrato para visualizar e cadastrar obras vinculadas.</div>
          </div>
          <button
            type="button"
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8]"
            onClick={() => router.push("/dashboard/contratos/novo")}
          >
            Novo Contrato
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="text-sm text-[#6B7280]">Contrato</div>
            <select className="input" value={String(contratoId || "")} onChange={(e) => setContratoId(Number(e.target.value) || 0)}>
              <option value="">Selecione</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numeroContrato}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <div className="text-sm text-[#6B7280]">Objeto do contrato</div>
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm min-h-[44px]">
              {contratoSelecionado?.objeto ? contratoSelecionado.objeto : "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Obras do contrato</div>
            <div className="text-xs text-[#6B7280]">Quando selecionar um contrato, aparece a lista de obras já cadastradas.</div>
          </div>
          <button
            type="button"
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
            disabled={!contratoId}
            onClick={() => {
              setObraFormAberto(true);
              setObraId(null);
              setEnderecoId(null);
              setEnderecos([]);
              setFormObra({ name: "", type: "PARTICULAR", status: "NAO_INICIADA", description: "", valorPrevisto: "" });
              setEnderecoFormAberto(false);
              setFormEndereco({
                nomeEndereco: "Principal",
                principal: true,
                origem: "MANUAL",
                link: "",
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
            Nova Obra
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-[#111827]">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Valor previsto</th>
              </tr>
            </thead>
            <tbody>
              {obrasContrato.map((o) => (
                <tr
                  key={o.id}
                  className={`border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB] ${obraId === o.id ? "bg-[#EFF6FF]" : ""}`}
                  onClick={() => {
                    setObraId(o.id);
                    carregarObraParaEdicao(o.id);
                  }}
                >
                  <td className="px-3 py-2">{o.id}</td>
                  <td className="px-3 py-2">{o.name}</td>
                  <td className="px-3 py-2">{o.type}</td>
                  <td className="px-3 py-2">{o.status}</td>
                  <td className="px-3 py-2">
                    {o.valorPrevisto == null ? "-" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(o.valorPrevisto)}
                  </td>
                </tr>
              ))}
              {!obrasContrato.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={5}>
                    Selecione um contrato.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {obraFormAberto ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
          <div>
            <div className="text-sm font-semibold">Cadastro / Edição de Obra</div>
            <div className="text-xs text-[#6B7280]">{obraId ? `Editando a obra #${obraId}` : "Nova obra"}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-4">
              <div className="text-sm text-[#6B7280]">Nome da Obra</div>
              <input className="input" value={formObra.name} onChange={(e) => setFormObra((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Tipo</div>
              <select className="input" value={formObra.type} onChange={(e) => setFormObra((p) => ({ ...p, type: e.target.value as any }))}>
                <option value="PARTICULAR">Particular</option>
                <option value="PUBLICA">Pública</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Status</div>
              <select className="input" value={formObra.status} onChange={(e) => setFormObra((p) => ({ ...p, status: e.target.value }))}>
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
              <div className="text-sm text-[#6B7280]">Valor Previsto (R$)</div>
              <input className="input" value={formObra.valorPrevisto} onChange={(e) => setFormObra((p) => ({ ...p, valorPrevisto: e.target.value }))} />
            </div>
            <div className="md:col-span-6">
              <div className="text-sm text-[#6B7280]">Descrição</div>
              <textarea className="input min-h-24" value={formObra.description} onChange={(e) => setFormObra((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => {
                setObraFormAberto(false);
                setObraId(null);
                setEnderecoId(null);
                setEnderecos([]);
                setEnderecoFormAberto(false);
                setFormObra({ name: "", type: "PARTICULAR", status: "NAO_INICIADA", description: "", valorPrevisto: "" });
              }}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
              type="button"
              onClick={() => carregarObrasContrato(contratoId)}
              disabled={!contratoId || loading}
            >
              Recarregar
            </button>
            <button
              className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60"
              type="button"
              disabled={loading || !contratoId || formObra.name.trim().length < 3}
              onClick={salvar}
            >
              {loading ? "Salvando..." : obraId ? "Salvar Obra" : "Cadastrar Obra"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Endereços já cadastrados nesta obra</div>
            <div className="text-xs text-[#6B7280]">A obra pode ter vários endereços. Selecione um para editar.</div>
          </div>
          <button
            type="button"
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-60"
            disabled={!obraId}
            onClick={limparEnderecoForm}
          >
            Novo Endereço
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-[#111827]">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Nome do endereço</th>
                <th className="px-3 py-2">Principal</th>
                <th className="px-3 py-2">Endereço completo</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {enderecos.map((e) => (
                <tr
                  key={e.id}
                  className={`border-t border-[#E5E7EB] cursor-pointer hover:bg-[#F9FAFB] ${enderecoId === e.id ? "bg-[#EFF6FF]" : ""}`}
                  onClick={() => selecionarEndereco(e)}
                >
                  <td className="px-3 py-2">#{e.obraId}/{e.id}</td>
                  <td className="px-3 py-2">{e.nomeEndereco || "Principal"}</td>
                  <td className="px-3 py-2">{e.principal ? "Sim" : "Não"}</td>
                  <td className="px-3 py-2">
                    {[e.logradouro, e.numero, e.bairro, [e.cidade, e.uf].filter(Boolean).join(" / "), e.cep].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-2 py-1 text-xs text-[#111827] hover:bg-[#F9FAFB]"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removerEndereco(e.id);
                      }}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {!enderecos.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-[#6B7280]" colSpan={5}>
                    Selecione uma obra para gerenciar endereços.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {enderecoFormAberto ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-4">
          <div>
            <div className="text-sm font-semibold">Cadastrar / Editar Endereço da Obra</div>
            <div className="text-xs text-[#6B7280]">{enderecoId ? `Editando o endereço #${enderecoId}` : "Novo endereço"}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <div className="md:col-span-3">
              <div className="text-sm text-[#6B7280]">Código do endereço (automático)</div>
              <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm">{obraId ? enderecoCodigo : "-"}</div>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Nome do endereço</div>
              <input className="input" value={formEndereco.nomeEndereco} onChange={(e) => setFormEndereco((p) => ({ ...p, nomeEndereco: e.target.value }))} />
            </div>
            <div className="md:col-span-1 flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formEndereco.principal} onChange={(e) => setFormEndereco((p) => ({ ...p, principal: e.target.checked }))} />
                Definir como principal
              </label>
            </div>
            <div className="md:col-span-2">
              <div className="text-sm text-[#6B7280]">Origem</div>
              <select className="input" value={formEndereco.origem} onChange={(e) => setFormEndereco((p) => ({ ...p, origem: e.target.value as any }))}>
                <option value="MANUAL">Manual</option>
                <option value="CEP">CEP</option>
                <option value="LINK">Link (Maps)</option>
              </select>
            </div>
            {formEndereco.origem === "LINK" ? (
              <div className="md:col-span-4">
                <div className="text-sm text-[#6B7280]">Link</div>
                <input className="input" value={formEndereco.link} onChange={(e) => setFormEndereco((p) => ({ ...p, link: e.target.value }))} placeholder="Cole o link do Google Maps" />
              </div>
            ) : (
              <>
                <div className="md:col-span-2">
                  <div className="text-sm text-[#6B7280]">CEP</div>
                  <input className="input" value={formEndereco.cep} onChange={(e) => setFormEndereco((p) => ({ ...p, cep: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-[#6B7280]">Número</div>
                  <input className="input" value={formEndereco.numero} onChange={(e) => setFormEndereco((p) => ({ ...p, numero: e.target.value }))} />
                </div>
                {formEndereco.origem === "MANUAL" ? (
                  <>
                    <div className="md:col-span-2">
                      <div className="text-sm text-[#6B7280]">UF</div>
                      <input className="input" value={formEndereco.uf} onChange={(e) => setFormEndereco((p) => ({ ...p, uf: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-[#6B7280]">Cidade</div>
                      <input className="input" value={formEndereco.cidade} onChange={(e) => setFormEndereco((p) => ({ ...p, cidade: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-[#6B7280]">Bairro</div>
                      <input className="input" value={formEndereco.bairro} onChange={(e) => setFormEndereco((p) => ({ ...p, bairro: e.target.value }))} />
                    </div>
                    <div className="md:col-span-4">
                      <div className="text-sm text-[#6B7280]">Logradouro</div>
                      <input className="input" value={formEndereco.logradouro} onChange={(e) => setFormEndereco((p) => ({ ...p, logradouro: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-sm text-[#6B7280]">Complemento</div>
                      <input className="input" value={formEndereco.complemento} onChange={(e) => setFormEndereco((p) => ({ ...p, complemento: e.target.value }))} />
                    </div>
                    <div className="md:col-span-3">
                      <div className="text-sm text-[#6B7280]">Latitude</div>
                      <input className="input" value={formEndereco.latitude} onChange={(e) => setFormEndereco((p) => ({ ...p, latitude: e.target.value }))} />
                    </div>
                    <div className="md:col-span-3">
                      <div className="text-sm text-[#6B7280]">Longitude</div>
                      <input className="input" value={formEndereco.longitude} onChange={(e) => setFormEndereco((p) => ({ ...p, longitude: e.target.value }))} />
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-60"
              onClick={() => {
                setEnderecoFormAberto(false);
                setEnderecoId(null);
              }}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#16A34A] px-4 py-2 text-sm text-white hover:bg-[#15803D] disabled:opacity-60"
              onClick={salvarEndereco}
              disabled={!obraId || loading || formEndereco.nomeEndereco.trim().length < 1}
            >
              {loading ? "Salvando..." : enderecoId ? "Salvar Endereço" : "Cadastrar Endereço"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm space-y-3">
        <div>
          <div className="text-sm font-semibold">Mapa</div>
          <div className="text-xs text-[#6B7280]">
            Ao selecionar uma obra ou endereço na lista, ele fica iluminado na lista e no mapa.
          </div>
        </div>
        <MapaObras obras={mapaData as any} selectedObraId={mapaSelectedId as any} />
      </div>
    </div>
  );
}
