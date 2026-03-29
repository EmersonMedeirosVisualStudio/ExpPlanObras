"use client";

import { useMemo, useState } from "react";

type CatalogoItem = { idItem: number; codigo: string; descricao: string; unidadeMedida: string | null };
type EstoqueLinha = { codigoFerramenta: string; descricao: string; unidadeMedida: string | null; quantidadeTotal: number; quantidadeDisponivel: number };
type CautelaHead = { idCautela: number; tipoLocal: "OBRA" | "UNIDADE"; idLocal: number; dataReferencia: string; status: "ABERTA" | "FECHADA" };
type CautelaItem = {
  idItem: number;
  codigoFerramenta: string;
  descricao: string;
  unidadeMedida: string | null;
  acao: "ENTREGA" | "DEVOLUCAO";
  quantidade: number;
  idFuncionarioDestinatario: number | null;
  codigoServico: string | null;
  observacao: string | null;
  criadoEm: string;
};

export default function FerramentasClient() {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);

  const [tipoLocal, setTipoLocal] = useState<"OBRA" | "UNIDADE">("OBRA");
  const [idLocal, setIdLocal] = useState("");
  const [estoque, setEstoque] = useState<EstoqueLinha[]>([]);

  const [cautelaData, setCautelaData] = useState(() => new Date().toISOString().slice(0, 10));
  const [cautelaHead, setCautelaHead] = useState<CautelaHead | null>(null);
  const [cautelaItens, setCautelaItens] = useState<CautelaItem[]>([]);
  const [cautelaItem, setCautelaItem] = useState({
    acao: "ENTREGA" as "ENTREGA" | "DEVOLUCAO",
    codigoFerramenta: "",
    quantidade: "1",
    idFuncionarioDestinatario: "",
    codigoServico: "",
    observacao: "",
  });

  const [novoItem, setNovoItem] = useState({ codigo: "", descricao: "", unidadeMedida: "" });
  const [mov, setMov] = useState({
    tipo: "ENTRADA" as "ENTRADA" | "SAIDA" | "TRANSFERENCIA",
    codigoFerramenta: "",
    quantidade: "1",
    codigoServico: "",
    origemTipo: "OBRA" as "OBRA" | "UNIDADE",
    origemId: "",
    destinoTipo: "OBRA" as "OBRA" | "UNIDADE",
    destinoId: "",
    observacao: "",
  });

  const qsCatalogo = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [q]);

  async function carregarCatalogo() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/ferramentas/catalogo${qsCatalogo}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar catálogo");
      setCatalogo(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar catálogo");
      setCatalogo([]);
    } finally {
      setLoading(false);
    }
  }

  async function criarCatalogo() {
    try {
      setErr(null);
      const res = await fetch("/api/v1/engenharia/ferramentas/catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: novoItem.codigo, descricao: novoItem.descricao, unidadeMedida: novoItem.unidadeMedida || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao criar item");
      setNovoItem({ codigo: "", descricao: "", unidadeMedida: "" });
      await carregarCatalogo();
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar item");
    }
  }

  async function carregarEstoque() {
    const id = Number(idLocal || 0);
    if (!id) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`/api/v1/engenharia/ferramentas/estoque?tipoLocal=${tipoLocal}&idLocal=${id}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao carregar estoque");
      setEstoque(Array.isArray(json) ? json : []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar estoque");
      setEstoque([]);
    } finally {
      setLoading(false);
    }
  }

  async function abrirCautela() {
    const id = Number(idLocal || 0);
    if (!id) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/v1/engenharia/ferramentas/cautelas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoLocal, idLocal: id, dataReferencia: cautelaData }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao abrir cautela");

      const idCautela = Number(json?.idCautela || 0);
      if (!idCautela) throw new Error("Cautela inválida");
      setCautelaHead({ idCautela, tipoLocal, idLocal: id, dataReferencia: cautelaData, status: "ABERTA" });
      await carregarCautelaItens(idCautela);
    } catch (e: any) {
      setErr(e?.message || "Erro ao abrir cautela");
      setCautelaHead(null);
      setCautelaItens([]);
    } finally {
      setLoading(false);
    }
  }

  async function carregarCautelaItens(idCautela: number) {
    const res = await fetch(`/api/v1/engenharia/ferramentas/cautelas/${idCautela}/itens`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.message || "Erro ao carregar itens da cautela");
    setCautelaItens(Array.isArray(json) ? json : []);
  }

  async function registrarCautelaItem() {
    if (!cautelaHead?.idCautela) return;
    try {
      setErr(null);
      const payload: any = {
        acao: cautelaItem.acao,
        codigoFerramenta: cautelaItem.codigoFerramenta,
        quantidade: Number(cautelaItem.quantidade.replace(",", ".")),
        idFuncionarioDestinatario: cautelaItem.idFuncionarioDestinatario ? Number(cautelaItem.idFuncionarioDestinatario) : null,
        codigoServico: cautelaItem.codigoServico || null,
        observacao: cautelaItem.observacao || null,
      };
      const res = await fetch(`/api/v1/engenharia/ferramentas/cautelas/${cautelaHead.idCautela}/itens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao registrar item da cautela");
      await carregarCautelaItens(cautelaHead.idCautela);
      await carregarEstoque();
      setCautelaItem({ acao: "ENTREGA", codigoFerramenta: "", quantidade: "1", idFuncionarioDestinatario: "", codigoServico: "", observacao: "" });
    } catch (e: any) {
      setErr(e?.message || "Erro ao registrar item da cautela");
    }
  }

  async function movimentar() {
    try {
      setErr(null);
      const payload: any = {
        tipo: mov.tipo,
        codigoFerramenta: mov.codigoFerramenta,
        quantidade: Number(mov.quantidade.replace(",", ".")),
        codigoServico: mov.codigoServico || null,
        observacao: mov.observacao || null,
      };
      if (mov.tipo === "ENTRADA") {
        payload.destinoTipo = mov.destinoTipo;
        payload.destinoId = Number(mov.destinoId || 0);
      } else if (mov.tipo === "SAIDA") {
        payload.origemTipo = mov.origemTipo;
        payload.origemId = Number(mov.origemId || 0);
      } else {
        payload.origemTipo = mov.origemTipo;
        payload.origemId = Number(mov.origemId || 0);
        payload.destinoTipo = mov.destinoTipo;
        payload.destinoId = Number(mov.destinoId || 0);
      }

      const res = await fetch("/api/v1/engenharia/ferramentas/estoque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Erro ao movimentar ferramenta");
      await carregarEstoque();
    } catch (e: any) {
      setErr(e?.message || "Erro ao movimentar ferramenta");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ferramentas (Estoque)</h1>
        <p className="text-sm text-slate-600">Controle de estoque por obra/unidade e movimentações (entrada/saída/transferência) com apropriação por serviço na saída.</p>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Catálogo</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Busca</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código ou descrição" />
          </div>
          <div className="flex items-end justify-end md:col-span-4">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarCatalogo} disabled={loading}>
              {loading ? "Carregando..." : "Carregar catálogo"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Código</div>
            <input className="input" value={novoItem.codigo} onChange={(e) => setNovoItem((p) => ({ ...p, codigo: e.target.value }))} placeholder="FER-0001" />
          </div>
          <div className="md:col-span-3">
            <div className="text-sm text-slate-600">Descrição</div>
            <input className="input" value={novoItem.descricao} onChange={(e) => setNovoItem((p) => ({ ...p, descricao: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Unidade</div>
            <input className="input" value={novoItem.unidadeMedida} onChange={(e) => setNovoItem((p) => ({ ...p, unidadeMedida: e.target.value }))} placeholder="un" />
          </div>
          <div className="flex items-end justify-end">
            <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={criarCatalogo}>
              Criar item
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {catalogo.map((c) => (
                <tr key={c.idItem} className="border-t">
                  <td className="px-3 py-2">{c.codigo}</td>
                  <td className="px-3 py-2">{c.descricao}</td>
                  <td className="px-3 py-2">{c.unidadeMedida || "-"}</td>
                </tr>
              ))}
              {!catalogo.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={3}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Estoque por local</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <div className="text-sm text-slate-600">Tipo local</div>
            <select className="input" value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value as any)}>
              <option value="OBRA">Obra</option>
              <option value="UNIDADE">Unidade</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">ID Local</div>
            <input className="input" value={idLocal} onChange={(e) => setIdLocal(e.target.value)} placeholder="Ex.: 12" />
          </div>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={carregarEstoque} disabled={loading}>
              {loading ? "Carregando..." : "Carregar estoque"}
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Ferramenta</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Disponível</th>
                <th className="px-3 py-2">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {estoque.map((e) => (
                <tr key={e.codigoFerramenta} className="border-t">
                  <td className="px-3 py-2">
                    {e.codigoFerramenta} - {e.descricao}
                  </td>
                  <td className="px-3 py-2">{Number(e.quantidadeTotal || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{Number(e.quantidadeDisponivel || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{e.unidadeMedida || "-"}</td>
                </tr>
              ))}
              {!estoque.length ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Cautelas diárias</div>
        <div className="text-sm text-slate-600">Entrega e devolução de ferramentas por responsável, com rastreabilidade e apropriação por serviço na entrega.</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Tipo local</div>
            <select className="input" value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value as any)}>
              <option value="OBRA">Obra</option>
              <option value="UNIDADE">Unidade</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">ID Local</div>
            <input className="input" value={idLocal} onChange={(e) => setIdLocal(e.target.value)} placeholder="Ex.: 12" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Data</div>
            <input className="input" type="date" value={cautelaData} onChange={(e) => setCautelaData(e.target.value)} />
          </div>
          <div className="flex items-end justify-end md:col-span-3">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" type="button" onClick={abrirCautela} disabled={loading}>
              {loading ? "Abrindo..." : cautelaHead ? "Reabrir/atualizar" : "Abrir cautela"}
            </button>
          </div>
        </div>

        {cautelaHead ? (
          <>
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              Cautela #{cautelaHead.idCautela} • {cautelaHead.tipoLocal} #{cautelaHead.idLocal} • {cautelaHead.dataReferencia}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div>
                <div className="text-sm text-slate-600">Ação</div>
                <select className="input" value={cautelaItem.acao} onChange={(e) => setCautelaItem((p) => ({ ...p, acao: e.target.value as any }))}>
                  <option value="ENTREGA">Entrega</option>
                  <option value="DEVOLUCAO">Devolução</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-600">Código da ferramenta</div>
                <input className="input" value={cautelaItem.codigoFerramenta} onChange={(e) => setCautelaItem((p) => ({ ...p, codigoFerramenta: e.target.value }))} placeholder="FER-0001" />
              </div>
              <div>
                <div className="text-sm text-slate-600">Quantidade</div>
                <input className="input" value={cautelaItem.quantidade} onChange={(e) => setCautelaItem((p) => ({ ...p, quantidade: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm text-slate-600">ID Funcionário</div>
                <input className="input" value={cautelaItem.idFuncionarioDestinatario} onChange={(e) => setCautelaItem((p) => ({ ...p, idFuncionarioDestinatario: e.target.value }))} placeholder="Ex.: 123" />
              </div>
              <div>
                <div className="text-sm text-slate-600">Serviço (obrigatório na entrega)</div>
                <input className="input" value={cautelaItem.codigoServico} onChange={(e) => setCautelaItem((p) => ({ ...p, codigoServico: e.target.value }))} placeholder="SER-0001" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="md:col-span-5">
                <div className="text-sm text-slate-600">Observação</div>
                <input className="input" value={cautelaItem.observacao} onChange={(e) => setCautelaItem((p) => ({ ...p, observacao: e.target.value }))} />
              </div>
              <div className="flex items-end justify-end">
                <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={registrarCautelaItem}>
                  Registrar
                </button>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Quando</th>
                    <th className="px-3 py-2">Ação</th>
                    <th className="px-3 py-2">Ferramenta</th>
                    <th className="px-3 py-2">Qtd</th>
                    <th className="px-3 py-2">Funcionário</th>
                    <th className="px-3 py-2">Serviço</th>
                    <th className="px-3 py-2">Obs.</th>
                  </tr>
                </thead>
                <tbody>
                  {cautelaItens.map((i) => (
                    <tr key={i.idItem} className="border-t">
                      <td className="px-3 py-2">{String(i.criadoEm || "").slice(0, 19).replace("T", " ")}</td>
                      <td className="px-3 py-2">{i.acao}</td>
                      <td className="px-3 py-2">
                        {i.codigoFerramenta} - {i.descricao}
                      </td>
                      <td className="px-3 py-2">
                        {Number(i.quantidade || 0).toFixed(2)} {i.unidadeMedida || ""}
                      </td>
                      <td className="px-3 py-2">{i.idFuncionarioDestinatario ?? "-"}</td>
                      <td className="px-3 py-2">{i.codigoServico || "-"}</td>
                      <td className="px-3 py-2">{i.observacao || "-"}</td>
                    </tr>
                  ))}
                  {!cautelaItens.length ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                        Sem itens.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-500">Abra uma cautela para visualizar e registrar entregas/devoluções.</div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="text-lg font-semibold">Movimentação</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Tipo</div>
            <select className="input" value={mov.tipo} onChange={(e) => setMov((p) => ({ ...p, tipo: e.target.value as any }))}>
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
              <option value="TRANSFERENCIA">Transferência</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Código da ferramenta</div>
            <input className="input" value={mov.codigoFerramenta} onChange={(e) => setMov((p) => ({ ...p, codigoFerramenta: e.target.value }))} placeholder="FER-0001" />
          </div>
          <div>
            <div className="text-sm text-slate-600">Quantidade</div>
            <input className="input" value={mov.quantidade} onChange={(e) => setMov((p) => ({ ...p, quantidade: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Código do serviço (obrigatório na saída)</div>
            <input className="input" value={mov.codigoServico} onChange={(e) => setMov((p) => ({ ...p, codigoServico: e.target.value }))} placeholder="SER-0001" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="text-sm text-slate-600">Origem tipo</div>
            <select className="input" value={mov.origemTipo} onChange={(e) => setMov((p) => ({ ...p, origemTipo: e.target.value as any }))}>
              <option value="OBRA">Obra</option>
              <option value="UNIDADE">Unidade</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Origem ID</div>
            <input className="input" value={mov.origemId} onChange={(e) => setMov((p) => ({ ...p, origemId: e.target.value }))} />
          </div>
          <div>
            <div className="text-sm text-slate-600">Destino tipo</div>
            <select className="input" value={mov.destinoTipo} onChange={(e) => setMov((p) => ({ ...p, destinoTipo: e.target.value as any }))}>
              <option value="OBRA">Obra</option>
              <option value="UNIDADE">Unidade</option>
            </select>
          </div>
          <div>
            <div className="text-sm text-slate-600">Destino ID</div>
            <input className="input" value={mov.destinoId} onChange={(e) => setMov((p) => ({ ...p, destinoId: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <div className="text-sm text-slate-600">Observação</div>
            <input className="input" value={mov.observacao} onChange={(e) => setMov((p) => ({ ...p, observacao: e.target.value }))} />
          </div>
        </div>

        <div className="flex justify-end">
          <button className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" type="button" onClick={movimentar}>
            Registrar movimentação
          </button>
        </div>
      </div>
    </div>
  );
}
