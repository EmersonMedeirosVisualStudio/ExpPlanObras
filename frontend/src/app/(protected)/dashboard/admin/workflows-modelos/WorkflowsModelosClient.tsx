"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkflowsApi } from "@/lib/modules/workflows/api";
import type { WorkflowModeloDTO, WorkflowModeloSaveDTO } from "@/lib/modules/workflows/types";

const DEFAULT_JSON: WorkflowModeloSaveDTO = {
  codigo: "BACKUP_RESTAURACAO",
  nome: "Workflow de Restauração de Backup",
  entidadeTipo: "BACKUP_RESTAURACAO",
  descricaoModelo: "Fluxo padrão de restauração com aprovação e execução.",
  ativo: true,
  permiteMultiplasInstancias: false,
  iniciaAutomaticamente: false,
  estados: [
    { chaveEstado: "EM_ANALISE", nomeEstado: "Em análise", tipoEstado: "INICIAL", exigeResponsavel: true, slaHoras: 24, ativo: true },
    { chaveEstado: "AGUARDANDO_APROVACAO", nomeEstado: "Aguardando aprovação", tipoEstado: "INTERMEDIARIO", exigeResponsavel: true, slaHoras: 48, ativo: true },
    { chaveEstado: "APROVADA", nomeEstado: "Aprovada", tipoEstado: "FINAL_SUCESSO", ativo: true },
    { chaveEstado: "REJEITADA", nomeEstado: "Rejeitada", tipoEstado: "FINAL_ERRO", ativo: true },
  ],
  transicoes: [
    {
      chaveTransicao: "SUBMETER_APROVACAO",
      nomeTransicao: "Submeter para aprovação",
      estadoOrigemChave: "EM_ANALISE",
      estadoDestinoChave: "AGUARDANDO_APROVACAO",
      tipoExecutor: "RESPONSAVEL_ATUAL",
      exigeParecer: false,
      exigeAssinatura: false,
      visivelNoUi: true,
      permiteEmLote: false,
      ativo: true,
      acoes: [{ ordemExecucao: 0, tipoAcao: "CRIAR_APROVACAO", configuracao: { enviar: true }, ativo: true }],
    },
    {
      chaveTransicao: "APROVAR",
      nomeTransicao: "Aprovar",
      estadoOrigemChave: "AGUARDANDO_APROVACAO",
      estadoDestinoChave: "APROVADA",
      tipoExecutor: "APROVADOR",
      exigeParecer: true,
      exigeAssinatura: true,
      visivelNoUi: true,
      permiteEmLote: false,
      ativo: true,
    },
    {
      chaveTransicao: "REJEITAR",
      nomeTransicao: "Rejeitar",
      estadoOrigemChave: "AGUARDANDO_APROVACAO",
      estadoDestinoChave: "REJEITADA",
      tipoExecutor: "APROVADOR",
      exigeParecer: true,
      exigeAssinatura: true,
      visivelNoUi: true,
      permiteEmLote: false,
      ativo: true,
    },
  ],
};

export default function WorkflowsModelosClient() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modelos, setModelos] = useState<WorkflowModeloDTO[]>([]);
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(DEFAULT_JSON, null, 2));
  const [editId, setEditId] = useState<number | null>(null);

  const parsed = useMemo(() => {
    try {
      return JSON.parse(jsonText) as WorkflowModeloSaveDTO;
    } catch {
      return null;
    }
  }, [jsonText]);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const data = await WorkflowsApi.listarModelos();
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

  async function abrir(id: number) {
    setLoading(true);
    setErro(null);
    try {
      const d = await WorkflowsApi.obterModelo(id);
      setEditId(id);
      setJsonText(JSON.stringify(d, null, 2));
    } catch (e: any) {
      setErro(e?.message || "Erro ao abrir modelo.");
    } finally {
      setLoading(false);
    }
  }

  async function salvarNovo() {
    if (!parsed) {
      setErro("JSON inválido.");
      return;
    }
    try {
      setLoading(true);
      setErro(null);
      await WorkflowsApi.criarModelo(parsed);
      await carregar();
      alert("Modelo criado (nova versão).");
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
          <h1 className="text-2xl font-semibold text-slate-800">Workflows (Modelos)</h1>
          <p className="text-sm text-slate-500">Modelagem por JSON (versões). Instâncias ativas continuam na versão antiga.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onClick={salvarNovo} disabled={loading}>
            Criar nova versão
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
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50 ${editId === m.id ? "border-blue-400 bg-blue-50" : ""}`}
                  onClick={() => abrir(m.id)}
                >
                  <div className="font-medium truncate">
                    {m.codigo} v{m.versao}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 truncate">{m.nome}</div>
                </button>
              ))
            ) : (
              <div className="text-sm text-slate-500">Nenhum modelo.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2 space-y-3">
          <div className="text-sm font-semibold text-slate-700">JSON do modelo</div>
          <textarea className="min-h-[520px] w-full rounded-lg border p-3 font-mono text-xs" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
          <div className="text-xs text-slate-500">{parsed ? "JSON válido" : "JSON inválido"}</div>
        </div>
      </div>
    </div>
  );
}

