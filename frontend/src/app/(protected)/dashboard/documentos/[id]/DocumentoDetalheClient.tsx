"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { DocumentosApi } from "@/lib/modules/documentos/api";
import type { DocumentoDetalheDTO, DocumentoFluxoUpsertDTO, DocumentoVersaoDetalheDTO } from "@/lib/modules/documentos/types";

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR");
}

function getCookieValue(name: string): string | null {
  try {
    const parts = String(document.cookie || "")
      .split(";")
      .map((p) => p.trim());
    for (const p of parts) {
      if (!p.startsWith(`${name}=`)) continue;
      return p.slice(name.length + 1);
    }
    return null;
  } catch {
    return null;
  }
}

function getCurrentUserId(): number | null {
  try {
    const raw = getCookieValue("exp_user");
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    const obj = JSON.parse(decoded) as { id?: number };
    const id = Number(obj?.id);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export default function DocumentoDetalheClient() {
  const params = useParams<{ id: string }>();
  const documentoId = Number(params?.id);
  const userId = useMemo(() => getCurrentUserId(), []);

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocumentoDetalheDTO | null>(null);
  const [versao, setVersao] = useState<DocumentoVersaoDetalheDTO | null>(null);
  const [versaoId, setVersaoId] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  async function carregarDocumento() {
    if (!Number.isFinite(documentoId)) return;
    setLoading(true);
    setErro(null);
    try {
      const d = await DocumentosApi.obter(documentoId);
      setDoc(d);
      const prefer = d.documento.idVersaoAtual || (d.versoes.length ? d.versoes[0].id : null);
      setVersaoId(prefer);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar documento.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarVersao(id: number) {
    setLoading(true);
    setErro(null);
    try {
      const v = await DocumentosApi.obterVersao(id);
      setVersao(v);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar versão.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDocumento();
  }, [documentoId]);

  useEffect(() => {
    if (!versaoId) return;
    carregarVersao(versaoId);
  }, [versaoId]);

  async function uploadNovaVersao() {
    if (!uploadFile) return;
    try {
      setLoading(true);
      setErro(null);
      const res = await DocumentosApi.criarVersaoUpload(documentoId, uploadFile);
      setUploadFile(null);
      await carregarDocumento();
      setVersaoId(res.id);
      alert("Versão enviada.");
    } catch (e: any) {
      setErro(e?.message || "Erro no upload.");
    } finally {
      setLoading(false);
    }
  }

  async function setFluxoQuick(body: DocumentoFluxoUpsertDTO) {
    if (!versaoId) return;
    try {
      setLoading(true);
      setErro(null);
      await DocumentosApi.upsertFluxo(versaoId, body);
      await carregarVersao(versaoId);
      alert("Fluxo atualizado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao atualizar fluxo.");
    } finally {
      setLoading(false);
    }
  }

  async function enviarParaAssinatura() {
    if (!versaoId) return;
    try {
      setLoading(true);
      setErro(null);
      await DocumentosApi.acao(versaoId, { acao: "ENVIAR_ASSINATURA" });
      await carregarDocumento();
      await carregarVersao(versaoId);
      alert("Enviado para assinatura.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao enviar para assinatura.");
    } finally {
      setLoading(false);
    }
  }

  async function gerarPdfFinal() {
    if (!versaoId) return;
    try {
      setLoading(true);
      setErro(null);
      await DocumentosApi.acao(versaoId, { acao: "GERAR_PDF_FINAL" });
      await carregarVersao(versaoId);
      alert("PDF final gerado.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao gerar PDF final.");
    } finally {
      setLoading(false);
    }
  }

  async function decidir(acao: "ASSINAR" | "APROVAR" | "CIENTE" | "REJEITAR") {
    if (!versaoId) return;
    const parecer = (prompt("Parecer (opcional):") || "").trim();
    const pin = (prompt("PIN:") || "").trim();
    if (!pin) return;
    try {
      setLoading(true);
      setErro(null);
      await DocumentosApi.acao(versaoId, { acao, parecer: parecer || null, assinatura: { tipo: "PIN", pin } });
      await carregarDocumento();
      await carregarVersao(versaoId);
      alert("Ação registrada.");
    } catch (e: any) {
      setErro(e?.message || "Erro ao assinar.");
    } finally {
      setLoading(false);
    }
  }

  const versoes = doc?.versoes || [];
  const verificacaoUrl = versao?.verificacaoToken ? `/verificacao-documento/${versao.verificacaoToken}` : null;

  return (
    <div className="max-w-7xl space-y-6 text-[#111827]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-[#6B7280]">Documento #{Number.isFinite(documentoId) ? documentoId : "-"}</div>
          <h1 className="text-2xl font-semibold truncate">{doc?.documento?.tituloDocumento || "Documento"}</h1>
          <div className="mt-1 text-sm text-[#6B7280]">
            {doc?.documento?.categoriaDocumento || "-"} • Status: {doc?.documento?.statusDocumento || "-"} • Atualizado:{" "}
            {fmtDateTime(doc?.documento?.atualizadoEm)}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
            onClick={carregarDocumento}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      {erro ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-1 space-y-4">
          <div>
            <div className="text-sm font-semibold">Versões</div>
            <div className="mt-2 space-y-2">
              {versoes.length ? (
                versoes.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm text-[#111827] hover:bg-[#F9FAFB] ${
                      versaoId === v.id ? "border-[#2563EB]" : "border-[#D1D5DB]"
                    }`}
                    onClick={() => setVersaoId(v.id)}
                    disabled={loading}
                  >
                    <div className="font-medium">
                      v{v.numeroVersao} • {v.statusVersao}
                    </div>
                    <div className="mt-1 text-xs text-[#6B7280] truncate">{v.nomeArquivoOriginal}</div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-[#6B7280]">Nenhuma versão enviada.</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[#E5E7EB] p-3">
            <div className="text-sm font-semibold">Nova versão (PDF)</div>
            <input
              type="file"
              accept="application/pdf"
              className="mt-2 block w-full text-sm"
              onChange={(e) => setUploadFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
              disabled={loading}
            />
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-50"
              onClick={uploadNovaVersao}
              disabled={loading || !uploadFile}
            >
              Enviar versão
            </button>
            <div className="mt-2 text-xs text-[#6B7280]">Nesta fase, somente PDF.</div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm lg:col-span-2 space-y-6">
          {!versao ? (
            <div className="text-sm text-[#6B7280]">{loading ? "Carregando..." : "Selecione uma versão."}</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    Versão v{versao.versao.numeroVersao} • {versao.versao.statusVersao}
                  </div>
                  <div className="mt-1 text-xs text-[#6B7280]">Hash original: {versao.versao.hashSha256Original}</div>
                  <div className="mt-1 text-xs text-[#6B7280]">
                    Hash PDF carimbado: {versao.versao.hashSha256PdfCarimbado ? versao.versao.hashSha256PdfCarimbado : "-"}
                  </div>
                  <div className="mt-2 text-xs text-[#6B7280]">
                    Verificação:{" "}
                    {verificacaoUrl ? (
                      <a className="text-[#2563EB] hover:underline" href={verificacaoUrl} target="_blank" rel="noreferrer">
                        {verificacaoUrl}
                      </a>
                    ) : (
                      "-"
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <a
                    className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                    href={`/api/v1/documentos/versoes/${versao.versao.id}/download?tipo=ORIGINAL`}
                  >
                    Baixar original
                  </a>
                  <a
                    className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]"
                    href={`/api/v1/documentos/versoes/${versao.versao.id}/download?tipo=PDF_FINAL`}
                  >
                    Baixar PDF final
                  </a>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-semibold">Ações</div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="rounded-lg bg-[#2563EB] px-3 py-2 text-sm text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                      onClick={enviarParaAssinatura}
                      disabled={loading}
                    >
                      Enviar p/ assinatura
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
                      onClick={gerarPdfFinal}
                      disabled={loading}
                    >
                      Gerar PDF final
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]" onClick={() => decidir("ASSINAR")} disabled={loading}>
                      Assinar
                    </button>
                    <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]" onClick={() => decidir("APROVAR")} disabled={loading}>
                      Aprovar
                    </button>
                    <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]" onClick={() => decidir("CIENTE")} disabled={loading}>
                      Ciente
                    </button>
                    <button type="button" className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB]" onClick={() => decidir("REJEITAR")} disabled={loading}>
                      Rejeitar
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-semibold">Fluxo</div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
                      onClick={() => {
                        if (!userId) return alert("Usuário atual não identificado.");
                        setFluxoQuick({
                          itens: [
                            {
                              ordemAssinatura: 1,
                              papelSignatario: "RESPONSAVEL",
                              tipoSignatario: "USUARIO",
                              idUsuarioSignatario: userId,
                              permissaoSignatario: null,
                              assinaturaObrigatoria: true,
                              parecerObrigatorio: false,
                            },
                          ],
                        });
                      }}
                      disabled={loading}
                    >
                      Somente eu
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] hover:bg-[#F9FAFB] disabled:opacity-50"
                      onClick={() => {
                        const permissao = (prompt("Código de permissão (ex: documentos.assinar):") || "").trim();
                        if (!permissao) return;
                        const papel = (prompt("Papel do signatário (ex: DIRETORIA, FINANCEIRO):") || "").trim() || "APROVADOR";
                        setFluxoQuick({
                          itens: [
                            {
                              ordemAssinatura: 1,
                              papelSignatario: papel,
                              tipoSignatario: "PERMISSAO",
                              idUsuarioSignatario: null,
                              permissaoSignatario: permissao,
                              assinaturaObrigatoria: true,
                              parecerObrigatorio: false,
                            },
                          ],
                        });
                      }}
                      disabled={loading}
                    >
                      Por permissão
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-[#6B7280]">Etapas: {(versao.fluxo || []).length}</div>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm font-semibold">Fluxo atual</div>
                <div className="p-3 space-y-2">
                  {(versao.fluxo || []).length ? (
                    versao.fluxo.map((f) => (
                      <div key={f.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">
                            {f.ordemAssinatura}. {f.papelSignatario}
                          </div>
                          <div className="text-xs text-[#6B7280]">{f.statusFluxo}</div>
                        </div>
                        <div className="mt-1 text-xs text-[#6B7280]">
                          {f.tipoSignatario === "USUARIO" ? `Usuário #${f.idUsuarioSignatario}` : `Permissão ${f.permissaoSignatario}`}
                        </div>
                        <div className="mt-1 text-xs text-[#6B7280]">
                          Parecer: {f.parecerObrigatorio ? "obrigatório" : "opcional"} • Vencimento: {fmtDateTime(f.vencimentoEm)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#6B7280]">Sem fluxo configurado.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm font-semibold">Assinaturas</div>
                <div className="p-3 space-y-2">
                  {(versao.assinaturas || []).length ? (
                    versao.assinaturas.map((a) => (
                      <div key={a.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">
                            {a.nomeExibicaoSignatario} • {a.papelSignatario} • {a.tipoDecisao}
                          </div>
                          <div className="text-xs text-[#6B7280]">{fmtDateTime(a.criadoEm)}</div>
                        </div>
                        <div className="mt-1 text-xs text-[#6B7280]">Código: {a.codigoVerificacao}</div>
                        {a.parecer ? <div className="mt-2 whitespace-pre-wrap text-sm text-[#111827]">{a.parecer}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#6B7280]">Nenhuma assinatura ainda.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="border-b border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm font-semibold">Histórico</div>
                <div className="p-3 space-y-2">
                  {(versao.historico || []).length ? (
                    versao.historico.map((h) => (
                      <div key={h.id} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">{h.tipoEvento}</div>
                          <div className="text-xs text-[#6B7280]">{fmtDateTime(h.criadoEm)}</div>
                        </div>
                        <div className="mt-1 text-sm text-[#111827]">{h.descricaoEvento}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#6B7280]">Sem histórico.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

