"use client";

import { useEffect, useMemo, useState } from "react";
import { AprovacoesApi } from "@/lib/modules/aprovacoes/api";
import type { AprovacaoModeloDTO, AprovacaoModeloSaveDTO, AprovacaoTipoAprovador } from "@/lib/modules/aprovacoes/types";

type EtapaForm = AprovacaoModeloSaveDTO["etapas"][number];

const EMPTY_MODEL: AprovacaoModeloSaveDTO = {
  nome: "",
  entidadeTipo: "BACKUP_RESTAURACAO",
  descricaoModelo: null,
  ativo: true,
  exigeAssinaturaAprovador: true,
  permiteDevolucao: true,
  permiteReenvio: true,
  aplicaAlcadaValor: false,
  etapas: [],
};

function nextOrdem(etapas: EtapaForm[]) {
  const max = etapas.reduce((m, e) => Math.max(m, Number(e.ordem || 0)), 0);
  return max + 1;
}

export default function AprovacoesModelosClient() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modelos, setModelos] = useState<AprovacaoModeloDTO[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AprovacaoModeloSaveDTO>(EMPTY_MODEL);

  const canSave = useMemo(() => {
    if (!form.nome.trim()) return false;
    if (!form.entidadeTipo.trim()) return false;
    if (!form.etapas.length) return false;
    return true;
  }, [form]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const data = await AprovacoesApi.listarModelos();
      setModelos(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar modelos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function editar(id: number) {
    setLoading(true);
    setErro(null);
    try {
      const d = await AprovacoesApi.obterModelo(id);
      setEditId(id);
      setForm({
        nome: d.modelo.nome,
        entidadeTipo: d.modelo.entidadeTipo,
        descricaoModelo: d.modelo.descricaoModelo,
        ativo: d.modelo.ativo,
        exigeAssinaturaAprovador: d.modelo.exigeAssinaturaAprovador,
        permiteDevolucao: d.modelo.permiteDevolucao,
        permiteReenvio: d.modelo.permiteReenvio,
        aplicaAlcadaValor: d.modelo.aplicaAlcadaValor,
        etapas: d.etapas.map((e) => ({
          ordem: e.ordem,
          nome: e.nome,
          tipoAprovador: e.tipoAprovador,
          idUsuarioAprovador: e.idUsuarioAprovador,
          permissaoAprovador: e.permissaoAprovador,
          exigeTodos: e.exigeTodos,
          quantidadeMinimaAprovacoes: e.quantidadeMinimaAprovacoes,
          prazoHoras: e.prazoHoras,
          valorMinimo: e.valorMinimo,
          valorMaximo: e.valorMaximo,
          parecerObrigatorioAprovar: e.parecerObrigatorioAprovar,
          parecerObrigatorioRejeitar: e.parecerObrigatorioRejeitar,
          ativo: e.ativo,
        })),
      });
    } catch (e: any) {
      setErro(e?.message || "Erro ao abrir modelo.");
    } finally {
      setLoading(false);
    }
  }

  function novo() {
    setEditId(null);
    setForm(EMPTY_MODEL);
  }

  function addEtapa() {
    setForm((f) => ({
      ...f,
      etapas: [
        ...f.etapas,
        {
          ordem: nextOrdem(f.etapas),
          nome: "Nova etapa",
          tipoAprovador: "PERMISSAO" as AprovacaoTipoAprovador,
          idUsuarioAprovador: null,
          permissaoAprovador: "dashboard.gerente.view",
          exigeTodos: false,
          quantidadeMinimaAprovacoes: null,
          prazoHoras: 24,
          valorMinimo: null,
          valorMaximo: null,
          parecerObrigatorioAprovar: false,
          parecerObrigatorioRejeitar: true,
          ativo: true,
        },
      ],
    }));
  }

  function updateEtapa(idx: number, patch: Partial<EtapaForm>) {
    setForm((f) => ({
      ...f,
      etapas: f.etapas.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    }));
  }

  function removerEtapa(idx: number) {
    setForm((f) => ({ ...f, etapas: f.etapas.filter((_, i) => i !== idx) }));
  }

  async function salvar() {
    try {
      setLoading(true);
      setErro(null);
      if (!canSave) throw new Error("Preencha nome, entidadeTipo e ao menos 1 etapa.");
      if (editId) {
        await AprovacoesApi.atualizarModelo(editId, form);
      } else {
        await AprovacoesApi.criarModelo(form);
      }
      await carregar();
      alert("Modelo salvo.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Aprovações (Modelos)</h1>
          <p className="text-sm text-slate-500">Configuração de fluxos, etapas, alçada e regras de parecer/assinatura.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={novo} disabled={loading}>
            Novo
          </button>
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onClick={salvar} disabled={loading}>
            Salvar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-1">
          <div className="mb-3 text-sm font-semibold text-slate-700">Modelos</div>
          <div className="space-y-2">
            {modelos.length ? (
              modelos.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    editId === m.id ? "border-blue-400 bg-blue-50" : ""
                  }`}
                  onClick={() => editar(m.id)}
                >
                  <div className="font-medium truncate">{m.nome}</div>
                  <div className="mt-1 text-xs text-slate-500 truncate">{m.entidadeTipo}</div>
                </button>
              ))
            ) : (
              <div className="text-sm text-slate-500">Nenhum modelo.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-500">Nome</div>
              <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Entidade Tipo</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={form.entidadeTipo}
                onChange={(e) => setForm((f) => ({ ...f, entidadeTipo: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500">Descrição</div>
            <textarea
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[80px]"
              value={form.descricaoModelo || ""}
              onChange={(e) => setForm((f) => ({ ...f, descricaoModelo: e.target.value || null }))}
            />
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} />
              Ativo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.exigeAssinaturaAprovador}
                onChange={(e) => setForm((f) => ({ ...f, exigeAssinaturaAprovador: e.target.checked }))}
              />
              Exige assinatura do aprovador
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.permiteDevolucao} onChange={(e) => setForm((f) => ({ ...f, permiteDevolucao: e.target.checked }))} />
              Permite devolução
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.permiteReenvio} onChange={(e) => setForm((f) => ({ ...f, permiteReenvio: e.target.checked }))} />
              Permite reenvio
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.aplicaAlcadaValor} onChange={(e) => setForm((f) => ({ ...f, aplicaAlcadaValor: e.target.checked }))} />
              Aplica alçada por valor
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-semibold text-slate-700">Etapas</div>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50" onClick={addEtapa} disabled={loading}>
              Adicionar etapa
            </button>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Ordem</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Usuário</th>
                  <th className="px-3 py-2">Permissão</th>
                  <th className="px-3 py-2">Prazo(h)</th>
                  <th className="px-3 py-2">Parecer rejeitar</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {form.etapas.length ? (
                  form.etapas
                    .slice()
                    .sort((a, b) => Number(a.ordem) - Number(b.ordem))
                    .map((e, idx) => (
                      <tr key={`${e.ordem}-${idx}`} className="border-t">
                        <td className="px-3 py-2">
                          <input
                            className="w-20 rounded-md border px-2 py-1"
                            value={String(e.ordem)}
                            onChange={(ev) => updateEtapa(idx, { ordem: Number(ev.target.value) })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input className="min-w-[220px] rounded-md border px-2 py-1" value={e.nome} onChange={(ev) => updateEtapa(idx, { nome: ev.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-md border px-2 py-1"
                            value={e.tipoAprovador}
                            onChange={(ev) => updateEtapa(idx, { tipoAprovador: ev.target.value as any })}
                          >
                            <option value="USUARIO">USUARIO</option>
                            <option value="PERMISSAO">PERMISSAO</option>
                            <option value="GESTOR_LOCAL">GESTOR_LOCAL</option>
                            <option value="SUPERIOR_HIERARQUICO">SUPERIOR_HIERARQUICO</option>
                            <option value="DIRETORIA">DIRETORIA</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-28 rounded-md border px-2 py-1"
                            value={e.idUsuarioAprovador == null ? "" : String(e.idUsuarioAprovador)}
                            onChange={(ev) => updateEtapa(idx, { idUsuarioAprovador: ev.target.value ? Number(ev.target.value) : null })}
                            placeholder="id"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="min-w-[220px] rounded-md border px-2 py-1"
                            value={e.permissaoAprovador || ""}
                            onChange={(ev) => updateEtapa(idx, { permissaoAprovador: ev.target.value || null })}
                            placeholder="ex: dashboard.gerente.view"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-24 rounded-md border px-2 py-1"
                            value={e.prazoHoras == null ? "" : String(e.prazoHoras)}
                            onChange={(ev) => updateEtapa(idx, { prazoHoras: ev.target.value ? Number(ev.target.value) : null })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!e.parecerObrigatorioRejeitar}
                            onChange={(ev) => updateEtapa(idx, { parecerObrigatorioRejeitar: ev.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="text-red-700 hover:underline" onClick={() => removerEtapa(idx)}>
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                      Nenhuma etapa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

