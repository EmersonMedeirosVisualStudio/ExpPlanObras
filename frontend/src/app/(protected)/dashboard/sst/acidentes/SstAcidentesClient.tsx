"use client";

import { useEffect, useMemo, useState } from "react";
import { SstAcidentesApi } from "@/lib/modules/sst-acidentes/api";
import { EpiApi } from "@/lib/modules/epi/api";

function formatFuncionarioRef(id: number | string) {
  return `@${id} funcionario`;
}

export default function SstAcidentesClient() {
  const [lista, setLista] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedResumo = useMemo(() => lista.find((x) => x.id === selectedId) || null, [lista, selectedId]);

  async function carregarLista() {
    setLista(await SstAcidentesApi.listar());
  }

  async function abrir(id: number) {
    setSelectedId(id);
    setDetalhe(await SstAcidentesApi.obter(id));
  }

  async function criarOcorrencia() {
    const tipoLocal = (prompt("Tipo local (OBRA/UNIDADE):") || "OBRA").trim().toUpperCase();
    if (!["OBRA", "UNIDADE"].includes(tipoLocal)) return;

    const idRef = Number(prompt(`ID da ${tipoLocal === "OBRA" ? "obra" : "unidade"}:`) || "");
    if (!idRef) return;

    const tipoOcorrencia = (prompt("Tipo ocorrência (ACIDENTE_SEM_AFASTAMENTO/ACIDENTE_COM_AFASTAMENTO/INCIDENTE/QUASE_ACIDENTE/DANO_MATERIAL/FATAL):") || "INCIDENTE")
      .trim()
      .toUpperCase();
    const severidade = (prompt("Severidade (BAIXA/MEDIA/ALTA/CRITICA):") || "MEDIA").trim().toUpperCase();
    const dataHoraOcorrencia = (prompt("Data/hora (YYYY-MM-DD HH:mm):") || `${new Date().toISOString().slice(0, 10)} 08:00`).trim();
    const descricaoOcorrencia = (prompt("Descrição da ocorrência:") || "").trim();
    if (!descricaoOcorrencia) return;

    const resp = await SstAcidentesApi.criar({
      tipoLocal,
      idObra: tipoLocal === "OBRA" ? idRef : null,
      idUnidade: tipoLocal === "UNIDADE" ? idRef : null,
      tipoOcorrencia,
      severidade,
      dataHoraOcorrencia,
      descricaoOcorrencia,
    });

    await carregarLista();
    await abrir(resp.id);
  }

  async function escolherTrabalhador() {
    if (!detalhe) return null;
    const trabalhadores = await EpiApi.listarTrabalhadores(detalhe.tipoLocal, detalhe.idObra || undefined, detalhe.idUnidade || undefined);
    if (!trabalhadores.length) return null;
    const preview = trabalhadores
      .slice(0, 15)
      .map((t) => `${t.tipoDestinatario}:${t.id} - ${t.nome}`)
      .join("\n");

    const escolha = (prompt(`Trabalhadores (até 15):\n${preview}\n\nDigite "TIPO:ID" (ex: TERCEIRIZADO:12) ou deixe em branco para o 1º:`) || "").trim();
    if (!escolha) return trabalhadores[0];
    const [tipoRaw, idRaw] = escolha.split(":");
    const tipo = String(tipoRaw || "").trim().toUpperCase();
    const id = Number(String(idRaw || "").trim());
    const encontrado = trabalhadores.find((t) => t.tipoDestinatario === tipo && t.id === id);
    return encontrado || trabalhadores[0];
  }

  async function adicionarEnvolvido() {
    if (!detalhe) return;
    const tipoEnvolvido = (prompt("Tipo envolvido (FUNCIONARIO/TERCEIRIZADO/EXTERNO):") || "FUNCIONARIO").trim().toUpperCase();
    if (!["FUNCIONARIO", "TERCEIRIZADO", "EXTERNO"].includes(tipoEnvolvido)) return;

    const principalEnvolvido = (prompt("Principal envolvido? (S/N):") || "S").trim().toUpperCase() === "S";

    const payload: any = { tipoEnvolvido, principalEnvolvido };

    if (tipoEnvolvido === "EXTERNO") {
      const nomeExterno = (prompt("Nome externo:") || "").trim();
      if (!nomeExterno) return;
      payload.nomeExterno = nomeExterno;
      payload.empresaExterna = (prompt("Empresa externa (opcional):") || "").trim() || null;
    } else {
      const escolhido = await escolherTrabalhador();
      if (!escolhido) return alert("Nenhum trabalhador encontrado para este local");
      payload.idFuncionario = escolhido.tipoDestinatario === "FUNCIONARIO" ? escolhido.id : null;
      payload.idTerceirizadoTrabalhador = escolhido.tipoDestinatario === "TERCEIRIZADO" ? escolhido.id : null;
      payload.funcaoInformada = escolhido.funcao || null;
    }

    await SstAcidentesApi.adicionarEnvolvido(detalhe.id, payload);
    await abrir(detalhe.id);
  }

  async function adicionarTestemunha() {
    if (!detalhe) return;
    const tipoTestemunha = (prompt("Tipo testemunha (FUNCIONARIO/TERCEIRIZADO/EXTERNO):") || "FUNCIONARIO").trim().toUpperCase();
    if (!["FUNCIONARIO", "TERCEIRIZADO", "EXTERNO"].includes(tipoTestemunha)) return;

    const payload: any = { tipoTestemunha };

    if (tipoTestemunha === "EXTERNO") {
      const nomeExterno = (prompt("Nome externo:") || "").trim();
      if (!nomeExterno) return;
      payload.nomeExterno = nomeExterno;
      payload.contato = (prompt("Contato (opcional):") || "").trim() || null;
      payload.relatoResumido = (prompt("Relato resumido (opcional):") || "").trim() || null;
    } else {
      const escolhido = await escolherTrabalhador();
      if (!escolhido) return alert("Nenhum trabalhador encontrado para este local");
      payload.idFuncionario = escolhido.tipoDestinatario === "FUNCIONARIO" ? escolhido.id : null;
      payload.idTerceirizadoTrabalhador = escolhido.tipoDestinatario === "TERCEIRIZADO" ? escolhido.id : null;
      payload.relatoResumido = (prompt("Relato resumido (opcional):") || "").trim() || null;
    }

    await SstAcidentesApi.adicionarTestemunha(detalhe.id, payload);
    await abrir(detalhe.id);
  }

  async function salvarInvestigacao() {
    if (!detalhe) return;
    const metodologia = (prompt("Metodologia (5_PORQUES/ISHIKAWA/OUTRA):") || "5_PORQUES").trim().toUpperCase();
    const causasImediatas = (prompt("Causas imediatas (opcional):") || "").trim() || null;
    const causasRaiz = (prompt("Causas raiz (opcional):") || "").trim() || null;
    const fatoresContribuintes = (prompt("Fatores contribuintes (opcional):") || "").trim() || null;
    const medidasImediatas = (prompt("Medidas imediatas (opcional):") || "").trim() || null;
    const recomendacoes = (prompt("Recomendações (opcional):") || "").trim() || null;
    const conclusao = (prompt("Conclusão (opcional):") || "").trim() || null;
    const concluir = (prompt("Concluir investigação agora? (S/N):") || "N").trim().toUpperCase() === "S";
    const dataConclusao = concluir ? `${new Date().toISOString().slice(0, 10)} 18:00` : null;

    await SstAcidentesApi.salvarInvestigacao(detalhe.id, {
      metodologia,
      causasImediatas,
      causasRaiz,
      fatoresContribuintes,
      medidasImediatas,
      recomendacoes,
      conclusao,
      dataConclusao,
    });
    await abrir(detalhe.id);
    await carregarLista();
  }

  async function registrarCat() {
    if (!detalhe) return;
    const tipoCat = (prompt("Tipo CAT (CAT_EMPRESA/CAT_TERCEIRIZADA/REGISTRO_EXTERNO):") || "CAT_EMPRESA").trim().toUpperCase();
    const dataEmissao = (prompt("Data emissão (YYYY-MM-DD HH:mm):") || `${new Date().toISOString().slice(0, 10)} 10:00`).trim();
    const emitidaPorTipo = (prompt("Emitida por (EMPRESA/EMPRESA_PARCEIRA/OUTRO):") || "EMPRESA").trim().toUpperCase();
    const numeroCat = (prompt("Número CAT (opcional):") || "").trim() || null;
    const protocolo = (prompt("Protocolo (opcional):") || "").trim() || null;
    const arquivoPdfUrl = (prompt("Arquivo PDF URL (opcional):") || "").trim() || null;

    await SstAcidentesApi.registrarCat(detalhe.id, { tipoCat, dataEmissao, emitidaPorTipo, numeroCat, protocolo, arquivoPdfUrl });
    await abrir(detalhe.id);
    await carregarLista();
  }

  async function alterarStatus() {
    if (!detalhe) return;
    const acao = (prompt("Ação (ENVIAR_VALIDACAO/VALIDAR_CONCLUSAO/REABRIR/CANCELAR):") || "").trim().toUpperCase();
    if (!acao) return;
    const parecerValidacao =
      acao === "VALIDAR_CONCLUSAO" || acao === "REABRIR" ? (prompt("Parecer validação (opcional):") || "").trim() || null : null;
    const motivo = acao === "CANCELAR" ? (prompt("Motivo cancelamento:") || "").trim() : null;
    await SstAcidentesApi.alterarStatus(detalhe.id, { acao, parecerValidacao, motivo });
    await abrir(detalhe.id);
    await carregarLista();
  }

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        await carregarLista();
      } catch (e: any) {
        setError(e?.message || "Erro ao carregar acidentes.");
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Acidentes / Incidentes</h1>
        <div className="flex gap-2">
          <button onClick={criarOcorrencia} className="rounded-lg bg-blue-600 px-4 py-2 text-white">
            Nova ocorrência
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Ocorrências</h2>
          <div className="space-y-2">
            {lista.map((a) => (
              <button
                key={a.id}
                onClick={() => abrir(a.id)}
                className={`w-full rounded border p-3 text-left hover:bg-slate-50 ${a.id === selectedId ? "border-blue-400 bg-blue-50/30" : ""}`}
              >
                <div className="font-medium">
                  #{a.id} • {a.tipoOcorrencia} • {a.severidade}
                </div>
                <div className="text-sm text-slate-500">
                  {a.tipoLocal} {a.idObra || a.idUnidade || ""} • {a.dataHoraOcorrencia} • {a.statusAcidente}
                </div>
              </button>
            ))}
            {lista.length === 0 ? <div className="text-sm text-slate-500">Nenhuma ocorrência.</div> : null}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 font-semibold">Detalhe</h2>
          {!detalhe ? (
            <div className="text-sm text-slate-500">Selecione uma ocorrência.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="font-medium">
                  #{detalhe.id} • {detalhe.tipoOcorrencia} • {detalhe.severidade}
                </div>
                <div className="text-sm text-slate-500">
                  {detalhe.tipoLocal} {detalhe.idObra || detalhe.idUnidade || ""} • {detalhe.dataHoraOcorrencia} • {detalhe.statusAcidente}
                </div>
                <div className="mt-2 whitespace-pre-wrap rounded border bg-slate-50 p-3 text-sm">{detalhe.descricaoOcorrencia}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={adicionarEnvolvido} className="rounded border px-3 py-2 text-xs">
                  Adicionar envolvido
                </button>
                <button onClick={adicionarTestemunha} className="rounded border px-3 py-2 text-xs">
                  Adicionar testemunha
                </button>
                <button onClick={salvarInvestigacao} className="rounded border px-3 py-2 text-xs">
                  Salvar investigação
                </button>
                <button onClick={registrarCat} className="rounded border px-3 py-2 text-xs">
                  Registrar CAT
                </button>
                <button onClick={alterarStatus} className="rounded border px-3 py-2 text-xs">
                  Alterar status
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Envolvidos</h3>
                  <div className="overflow-auto rounded border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Ref</th>
                          <th className="px-3 py-2">Principal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.envolvidos?.map((e: any) => (
                          <tr key={e.id} className="border-t">
                            <td className="px-3 py-2">{e.tipoEnvolvido}</td>
                            <td className="px-3 py-2">
                              {e.tipoEnvolvido === "EXTERNO"
                                ? e.nomeExterno
                                : e.idFuncionario
                                  ? formatFuncionarioRef(e.idFuncionario)
                                  : e.idTerceirizadoTrabalhador
                                    ? `@${e.idTerceirizadoTrabalhador} terceirizado`
                                    : "-"}
                            </td>
                            <td className="px-3 py-2">{e.principalEnvolvido ? "Sim" : "Não"}</td>
                          </tr>
                        ))}
                        {!detalhe.envolvidos?.length ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                              Nenhum envolvido.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Testemunhas</h3>
                  <div className="overflow-auto rounded border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Ref</th>
                          <th className="px-3 py-2">Contato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.testemunhas?.map((t: any) => (
                          <tr key={t.id} className="border-t">
                            <td className="px-3 py-2">{t.tipoTestemunha}</td>
                            <td className="px-3 py-2">
                              {t.tipoTestemunha === "EXTERNO"
                                ? t.nomeExterno
                                : t.idFuncionario
                                  ? formatFuncionarioRef(t.idFuncionario)
                                  : t.idTerceirizadoTrabalhador
                                    ? `@${t.idTerceirizadoTrabalhador} terceirizado`
                                    : "-"}
                            </td>
                            <td className="px-3 py-2">{t.contato || "-"}</td>
                          </tr>
                        ))}
                        {!detalhe.testemunhas?.length ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                              Nenhuma testemunha.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Investigação</h3>
                  <div className="rounded border bg-slate-50 p-3 text-sm">
                    <div>
                      <span className="font-medium">Metodologia:</span> {detalhe.investigacao?.metodologia || "-"}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap">{detalhe.investigacao?.conclusao || "Sem conclusão."}</div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">CATs</h3>
                  <div className="overflow-auto rounded border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Data</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.cats?.map((c: any) => (
                          <tr key={c.id} className="border-t">
                            <td className="px-3 py-2">{c.tipoCat}</td>
                            <td className="px-3 py-2">{c.dataEmissao}</td>
                            <td className="px-3 py-2">{c.statusCat}</td>
                          </tr>
                        ))}
                        {!detalhe.cats?.length ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                              Nenhuma CAT registrada.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {selectedResumo?.idNcGerada ? (
                <div className="text-sm text-slate-600">
                  NC vinculada: <span className="font-medium">#{selectedResumo.idNcGerada}</span>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
