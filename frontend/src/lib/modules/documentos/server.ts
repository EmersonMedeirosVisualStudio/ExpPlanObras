import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type {
  DocumentoAcaoDTO,
  DocumentoCriarDTO,
  DocumentoDetalheDTO,
  DocumentoFluxoUpsertDTO,
  DocumentoRegistroDTO,
  DocumentoVerificacaoDTO,
  DocumentoVersaoDetalheDTO,
  DocumentoVersaoDTO,
  DocumentoVersaoStatus,
} from './types';
import { buildCodigoVerificacao, randomToken, sha256Hex } from './hash';
import { stampPdf } from './pdf/stamp';

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function toIso(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseJsonMaybe(v: any): any {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

async function userHasPermission(args: { tenantId: number; userId: number; permissionCode: string }) {
  const [[row]]: any = await db.query(
    `
    SELECT 1 AS ok
    FROM usuario_perfis up
    INNER JOIN perfil_permissoes pp ON pp.id_perfil = up.id_perfil
    WHERE up.id_usuario = ?
      AND up.ativo = 1
      AND pp.codigo_permissao = ?
    LIMIT 1
    `,
    [args.userId, args.permissionCode]
  );
  return !!row?.ok;
}

async function validateUserPin(args: { tenantId: number; userId: number; pin: string }) {
  const pin = String(args.pin || '').trim();
  if (pin.length < 4) throw new ApiError(422, 'PIN inválido.');
  const [[row]]: any = await db.query(
    `
    SELECT pin_hash
    FROM usuarios_assinatura_habilitacoes
    WHERE tenant_id = ? AND id_usuario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
    LIMIT 1
    `,
    [args.tenantId, args.userId]
  );
  if (!row?.pin_hash) throw new ApiError(422, 'Usuário sem PIN habilitado.');
  const ok = await bcrypt.compare(pin, String(row.pin_hash));
  if (!ok) throw new ApiError(422, 'PIN inválido.');
}

async function getUserDisplayName(tenantId: number, userId: number) {
  const [[row]]: any = await db.query(
    `
    SELECT COALESCE(f.nome_completo, CONCAT('Usuário #', u.id_usuario)) AS nome
    FROM usuarios u
    LEFT JOIN funcionarios f ON f.id_funcionario = u.id_funcionario
    WHERE u.tenant_id = ? AND u.id_usuario = ?
    LIMIT 1
    `,
    [tenantId, userId]
  );
  return row?.nome ? String(row.nome) : `Usuário #${userId}`;
}

async function addHistorico(args: { tenantId: number; documentoId: number; versaoId: number | null; tipo: string; descricao: string; userId: number | null; metadata?: any }) {
  await db.execute(
    `
    INSERT INTO documentos_historico
      (tenant_id, id_documento_registro, id_documento_versao, tipo_evento, descricao_evento, id_usuario_evento, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      args.tenantId,
      args.documentoId,
      args.versaoId,
      args.tipo,
      args.descricao,
      args.userId,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ]
  );
}

export async function listarDocumentos(tenantId: number, args: { limit?: number | null } = {}): Promise<DocumentoRegistroDTO[]> {
  const limit = Math.min(200, Math.max(1, Number(args.limit || 50)));
  const [rows]: any = await db.query(
    `
    SELECT
      id_documento_registro AS id,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      categoria_documento AS categoriaDocumento,
      titulo_documento AS tituloDocumento,
      descricao_documento AS descricaoDocumento,
      status_documento AS statusDocumento,
      id_versao_atual AS idVersaoAtual,
      criado_em AS criadoEm,
      atualizado_em AS atualizadoEm
    FROM documentos_registros
    WHERE tenant_id = ?
    ORDER BY id_documento_registro DESC
    LIMIT ?
    `,
    [tenantId, limit]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    entidadeTipo: r.entidadeTipo ? String(r.entidadeTipo) : null,
    entidadeId: r.entidadeId !== null ? Number(r.entidadeId) : null,
    categoriaDocumento: String(r.categoriaDocumento),
    tituloDocumento: String(r.tituloDocumento),
    descricaoDocumento: r.descricaoDocumento ? String(r.descricaoDocumento) : null,
    statusDocumento: String(r.statusDocumento) as any,
    idVersaoAtual: r.idVersaoAtual !== null ? Number(r.idVersaoAtual) : null,
    criadoEm: toIso(r.criadoEm) || nowIso(),
    atualizadoEm: toIso(r.atualizadoEm) || nowIso(),
  }));
}

export async function criarDocumento(tenantId: number, userId: number, body: DocumentoCriarDTO) {
  const categoria = String(body.categoriaDocumento || '').trim().toUpperCase();
  const titulo = String(body.tituloDocumento || '').trim();
  if (!categoria) throw new ApiError(422, 'categoriaDocumento obrigatório');
  if (!titulo) throw new ApiError(422, 'tituloDocumento obrigatório');

  const entidadeTipo = body.entidadeTipo ? String(body.entidadeTipo).trim().toUpperCase() : null;
  const entidadeId = body.entidadeId !== undefined && body.entidadeId !== null ? Number(body.entidadeId) : null;

  const [res]: any = await db.execute(
    `
    INSERT INTO documentos_registros
      (tenant_id, entidade_tipo, entidade_id, categoria_documento, titulo_documento, descricao_documento, status_documento,
       id_versao_atual, exige_fluxo_assinatura, bloqueado_para_edicao, id_usuario_criador)
    VALUES (?, ?, ?, ?, ?, ?, 'RASCUNHO', NULL, 1, 0, ?)
    `,
    [tenantId, entidadeTipo, entidadeId, categoria, titulo.slice(0, 180), body.descricaoDocumento ?? null, userId]
  );
  const id = Number(res.insertId);
  await addHistorico({ tenantId, documentoId: id, versaoId: null, tipo: 'CRIADO', descricao: 'Documento criado.', userId });
  return { id };
}

export async function obterDocumentoDetalhe(tenantId: number, documentoId: number): Promise<DocumentoDetalheDTO> {
  const [[d]]: any = await db.query(
    `
    SELECT
      id_documento_registro AS id,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      categoria_documento AS categoriaDocumento,
      titulo_documento AS tituloDocumento,
      descricao_documento AS descricaoDocumento,
      status_documento AS statusDocumento,
      id_versao_atual AS idVersaoAtual,
      criado_em AS criadoEm,
      atualizado_em AS atualizadoEm
    FROM documentos_registros
    WHERE tenant_id = ? AND id_documento_registro = ?
    LIMIT 1
    `,
    [tenantId, documentoId]
  );
  if (!d) throw new ApiError(404, 'Documento não encontrado.');

  const [versoes]: any = await db.query(
    `
    SELECT
      id_documento_versao AS id,
      id_documento_registro AS idDocumentoRegistro,
      numero_versao AS numeroVersao,
      nome_arquivo_original AS nomeArquivoOriginal,
      mime_type AS mimeType,
      tamanho_bytes AS tamanhoBytes,
      hash_sha256_original AS hashSha256Original,
      hash_sha256_pdf_carimbado AS hashSha256PdfCarimbado,
      status_versao AS statusVersao,
      finalizada_em AS finalizadaEm,
      criado_em AS criadoEm
    FROM documentos_versoes
    WHERE tenant_id = ? AND id_documento_registro = ?
    ORDER BY numero_versao DESC
    `,
    [tenantId, documentoId]
  );

  return {
    documento: {
      id: Number(d.id),
      entidadeTipo: d.entidadeTipo ? String(d.entidadeTipo) : null,
      entidadeId: d.entidadeId !== null ? Number(d.entidadeId) : null,
      categoriaDocumento: String(d.categoriaDocumento),
      tituloDocumento: String(d.tituloDocumento),
      descricaoDocumento: d.descricaoDocumento ? String(d.descricaoDocumento) : null,
      statusDocumento: String(d.statusDocumento) as any,
      idVersaoAtual: d.idVersaoAtual !== null ? Number(d.idVersaoAtual) : null,
      criadoEm: toIso(d.criadoEm) || nowIso(),
      atualizadoEm: toIso(d.atualizadoEm) || nowIso(),
    },
    versoes: (versoes as any[]).map((v) => ({
      id: Number(v.id),
      idDocumentoRegistro: Number(v.idDocumentoRegistro),
      numeroVersao: Number(v.numeroVersao),
      nomeArquivoOriginal: String(v.nomeArquivoOriginal),
      mimeType: String(v.mimeType),
      tamanhoBytes: Number(v.tamanhoBytes),
      hashSha256Original: String(v.hashSha256Original),
      hashSha256PdfCarimbado: v.hashSha256PdfCarimbado ? String(v.hashSha256PdfCarimbado) : null,
      statusVersao: String(v.statusVersao) as any,
      finalizadaEm: toIso(v.finalizadaEm),
      criadoEm: toIso(v.criadoEm) || nowIso(),
    })) satisfies DocumentoVersaoDTO[],
  };
}

export async function criarNovaVersaoDocumento(args: { tenantId: number; documentoId: number; userId: number; nomeArquivoOriginal: string; mimeType: string; buffer: Buffer }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[d]]: any = await conn.query(
      `
      SELECT id_documento_registro AS id, titulo_documento AS titulo, status_documento AS status, id_versao_atual AS idVersaoAtual
      FROM documentos_registros
      WHERE tenant_id = ? AND id_documento_registro = ?
      LIMIT 1
      `,
      [args.tenantId, args.documentoId]
    );
    if (!d) throw new ApiError(404, 'Documento não encontrado.');
    if (String(d.status) === 'ASSINADO') throw new ApiError(422, 'Documento assinado não pode ser alterado. Crie um novo documento.');

    const mime = String(args.mimeType || '').toLowerCase();
    if (mime !== 'application/pdf') throw new ApiError(422, 'Nesta etapa, apenas PDF é suportado.');

    const [[vRow]]: any = await conn.query(
      `SELECT COALESCE(MAX(numero_versao), 0) AS n FROM documentos_versoes WHERE tenant_id = ? AND id_documento_registro = ?`,
      [args.tenantId, args.documentoId]
    );
    const next = Number(vRow?.n || 0) + 1;

    const hashOriginal = sha256Hex(args.buffer);
    const storagePathOriginal = `db://documentos/${args.documentoId}/v${next}/original.pdf`;

    const [res]: any = await conn.execute(
      `
      INSERT INTO documentos_versoes
        (tenant_id, id_documento_registro, numero_versao, nome_arquivo_original, mime_type, storage_path_original,
         tamanho_bytes, hash_sha256_original, status_versao, criado_em, conteudo_blob_original)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVA', NOW(), ?)
      `,
      [
        args.tenantId,
        args.documentoId,
        next,
        String(args.nomeArquivoOriginal || `documento-v${next}.pdf`).slice(0, 255),
        'application/pdf',
        storagePathOriginal,
        args.buffer.length,
        hashOriginal,
        args.buffer,
      ]
    );
    const versaoId = Number(res.insertId);

    await conn.execute(
      `
      UPDATE documentos_registros
      SET id_versao_atual = ?, status_documento = 'ATIVO', atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_documento_registro = ?
      `,
      [versaoId, args.tenantId, args.documentoId]
    );

    const token = randomToken(24);
    await conn.execute(
      `
      INSERT INTO documentos_tokens_verificacao
        (tenant_id, id_documento_versao, token_verificacao, publico, ativo)
      VALUES (?, ?, ?, 0, 1)
      `,
      [args.tenantId, versaoId, token]
    );

    await addHistorico({ tenantId: args.tenantId, documentoId: args.documentoId, versaoId, tipo: 'NOVA_VERSAO', descricao: `Nova versão v${next}.`, userId: args.userId });

    await conn.commit();
    return { id: versaoId, token };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function upsertFluxoAssinatura(args: { tenantId: number; versaoId: number; userId: number; body: DocumentoFluxoUpsertDTO }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[v]]: any = await conn.query(
      `
      SELECT v.id_documento_registro AS documentoId, v.status_versao AS statusVersao
      FROM documentos_versoes v
      WHERE v.tenant_id = ? AND v.id_documento_versao = ?
      LIMIT 1
      `,
      [args.tenantId, args.versaoId]
    );
    if (!v) throw new ApiError(404, 'Versão não encontrada.');
    if (String(v.statusVersao) !== 'ATIVA') throw new ApiError(422, 'Fluxo só pode ser alterado em versão ATIVA.');

    await conn.execute(`DELETE FROM documentos_fluxos_assinatura WHERE tenant_id = ? AND id_documento_versao = ?`, [args.tenantId, args.versaoId]);

    const itens = args.body?.itens || [];
    if (!itens.length) throw new ApiError(422, 'itens obrigatório');

    const ordenados = itens.slice().sort((a, b) => Number(a.ordemAssinatura) - Number(b.ordemAssinatura));
    for (const it of ordenados) {
      if (!it.papelSignatario) throw new ApiError(422, 'papelSignatario obrigatório');
      if (it.tipoSignatario === 'USUARIO' && !it.idUsuarioSignatario) throw new ApiError(422, 'idUsuarioSignatario obrigatório');
      if (it.tipoSignatario === 'PERMISSAO' && !it.permissaoSignatario) throw new ApiError(422, 'permissaoSignatario obrigatório');
      await conn.execute(
        `
        INSERT INTO documentos_fluxos_assinatura
          (tenant_id, id_documento_versao, ordem_assinatura, papel_signatario, tipo_signatario, id_usuario_signatario, permissao_signatario,
           assinatura_obrigatoria, parecer_obrigatorio, status_fluxo, vencimento_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE', ?)
        `,
        [
          args.tenantId,
          args.versaoId,
          Number(it.ordemAssinatura),
          String(it.papelSignatario).slice(0, 40),
          String(it.tipoSignatario),
          it.idUsuarioSignatario ?? null,
          it.permissaoSignatario ?? null,
          it.assinaturaObrigatoria ? 1 : 0,
          it.parecerObrigatorio ? 1 : 0,
          it.vencimentoEm ? new Date(it.vencimentoEm) : null,
        ]
      );
    }

    await addHistorico({ tenantId: args.tenantId, documentoId: Number(v.documentoId), versaoId: args.versaoId, tipo: 'FLUXO_ATUALIZADO', descricao: 'Fluxo de assinatura atualizado.', userId: args.userId });

    await conn.commit();
    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function ensureFirstDisponivel(conn: any, tenantId: number, versaoId: number) {
  const [[first]]: any = await conn.query(
    `
    SELECT id_documento_fluxo_assinatura AS id
    FROM documentos_fluxos_assinatura
    WHERE tenant_id = ? AND id_documento_versao = ?
    ORDER BY ordem_assinatura ASC
    LIMIT 1
    `,
    [tenantId, versaoId]
  );
  if (!first?.id) throw new ApiError(422, 'Versão sem fluxo de assinatura.');

  await conn.execute(
    `
    UPDATE documentos_fluxos_assinatura
    SET status_fluxo = CASE WHEN id_documento_fluxo_assinatura = ? THEN 'DISPONIVEL' ELSE 'PENDENTE' END,
        notificado_em = CASE WHEN id_documento_fluxo_assinatura = ? THEN COALESCE(notificado_em, NOW()) ELSE notificado_em END
    WHERE tenant_id = ? AND id_documento_versao = ?
    `,
    [Number(first.id), Number(first.id), tenantId, versaoId]
  );
}

export async function enviarDocumentoParaAssinatura(args: { tenantId: number; versaoId: number; userId: number }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]]: any = await conn.query(
      `
      SELECT v.id_documento_registro AS documentoId, d.titulo_documento AS titulo, v.status_versao AS statusVersao
      FROM documentos_versoes v
      INNER JOIN documentos_registros d ON d.id_documento_registro = v.id_documento_registro
      WHERE v.tenant_id = ? AND v.id_documento_versao = ?
      LIMIT 1
      `,
      [args.tenantId, args.versaoId]
    );
    if (!row) throw new ApiError(404, 'Versão não encontrada.');
    if (String(row.statusVersao) !== 'ATIVA') throw new ApiError(422, 'Versão não pode ser enviada para assinatura neste status.');

    await ensureFirstDisponivel(conn, args.tenantId, args.versaoId);

    await conn.execute(
      `
      UPDATE documentos_versoes
      SET status_versao = 'EM_ASSINATURA'
      WHERE tenant_id = ? AND id_documento_versao = ?
      `,
      [args.tenantId, args.versaoId]
    );
    await conn.execute(
      `
      UPDATE documentos_registros
      SET status_documento = 'EM_ASSINATURA', atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_documento_registro = ?
      `,
      [args.tenantId, Number(row.documentoId)]
    );

    await addHistorico({ tenantId: args.tenantId, documentoId: Number(row.documentoId), versaoId: args.versaoId, tipo: 'ENVIADO_ASSINATURA', descricao: 'Documento enviado para assinatura.', userId: args.userId });

    await conn.commit();
    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getVerificacaoToken(tenantId: number, versaoId: number) {
  const [[row]]: any = await db.query(
    `
    SELECT token_verificacao AS token
    FROM documentos_tokens_verificacao
    WHERE tenant_id = ? AND id_documento_versao = ? AND ativo = 1
    ORDER BY id_documento_token_verificacao DESC
    LIMIT 1
    `,
    [tenantId, versaoId]
  );
  return row?.token ? String(row.token) : null;
}

async function getVerificacaoUrl(tenantId: number, versaoId: number) {
  const token = await getVerificacaoToken(tenantId, versaoId);
  return token ? `/verificacao-documento/${token}` : '/dashboard/documentos';
}

async function loadVersaoWithBlob(conn: any, tenantId: number, versaoId: number) {
  const [[v]]: any = await conn.query(
    `
    SELECT
      v.id_documento_versao AS id,
      v.id_documento_registro AS documentoId,
      v.numero_versao AS numeroVersao,
      v.nome_arquivo_original AS nomeArquivoOriginal,
      v.mime_type AS mimeType,
      v.tamanho_bytes AS tamanhoBytes,
      v.hash_sha256_original AS hashOriginal,
      v.hash_sha256_pdf_carimbado AS hashPdfCarimbado,
      v.status_versao AS statusVersao,
      v.conteudo_blob_original AS blobOriginal,
      v.conteudo_blob_pdf_carimbado AS blobPdfCarimbado
    FROM documentos_versoes v
    WHERE v.tenant_id = ? AND v.id_documento_versao = ?
    LIMIT 1
    `,
    [tenantId, versaoId]
  );
  if (!v) throw new ApiError(404, 'Versão não encontrada.');
  return v;
}

async function loadAssinaturasResumo(tenantId: number, versaoId: number) {
  const [rows]: any = await db.query(
    `
    SELECT
      nome_exibicao_signatario AS nome,
      papel_signatario AS papel,
      tipo_decisao AS decisao,
      codigo_verificacao AS codigo,
      criado_em AS criadoEm
    FROM documentos_assinaturas
    WHERE tenant_id = ? AND id_documento_versao = ?
    ORDER BY id_documento_assinatura ASC
    `,
    [tenantId, versaoId]
  );
  return (rows as any[]).map((r) => ({
    nome: String(r.nome),
    papel: String(r.papel),
    decisao: String(r.decisao),
    codigo: String(r.codigo),
    dataHora: toIso(r.criadoEm) || nowIso(),
  }));
}

async function resolveFluxoDisponivel(conn: any, tenantId: number, versaoId: number, userId: number) {
  const [rows]: any = await conn.query(
    `
    SELECT
      id_documento_fluxo_assinatura AS id,
      ordem_assinatura AS ordem,
      papel_signatario AS papel,
      tipo_signatario AS tipoSignatario,
      id_usuario_signatario AS idUsuarioSignatario,
      permissao_signatario AS permissaoSignatario,
      assinatura_obrigatoria AS assinaturaObrigatoria,
      parecer_obrigatorio AS parecerObrigatorio
    FROM documentos_fluxos_assinatura
    WHERE tenant_id = ?
      AND id_documento_versao = ?
      AND status_fluxo = 'DISPONIVEL'
    ORDER BY ordem_assinatura ASC
    LIMIT 1
    `,
    [tenantId, versaoId]
  );
  if (!rows.length) throw new ApiError(422, 'Nenhuma etapa disponível para assinatura.');
  const f = rows[0];

  const tipo = String(f.tipoSignatario);
  if (tipo === 'USUARIO') {
    if (Number(f.idUsuarioSignatario) !== Number(userId)) throw new ApiError(403, 'Você não é o signatário desta etapa.');
  } else {
    const perm = f.permissaoSignatario ? String(f.permissaoSignatario) : '';
    if (!perm) throw new ApiError(422, 'Fluxo inválido (permissão ausente).');
    const ok = await userHasPermission({ tenantId, userId, permissionCode: perm });
    if (!ok) throw new ApiError(403, 'Você não possui permissão para assinar nesta etapa.');
  }
  return f;
}

async function advanceFluxo(conn: any, tenantId: number, versaoId: number, ordemAtual: number) {
  const [[next]]: any = await conn.query(
    `
    SELECT id_documento_fluxo_assinatura AS id
    FROM documentos_fluxos_assinatura
    WHERE tenant_id = ? AND id_documento_versao = ? AND status_fluxo = 'PENDENTE' AND ordem_assinatura > ?
    ORDER BY ordem_assinatura ASC
    LIMIT 1
    `,
    [tenantId, versaoId, ordemAtual]
  );
  if (!next?.id) return null;
  await conn.execute(
    `
    UPDATE documentos_fluxos_assinatura
    SET status_fluxo = 'DISPONIVEL', notificado_em = COALESCE(notificado_em, NOW())
    WHERE tenant_id = ? AND id_documento_fluxo_assinatura = ?
    `,
    [tenantId, Number(next.id)]
  );
  return Number(next.id);
}

export async function executarAcaoDocumentoVersao(args: { tenantId: number; versaoId: number; documentoId: number; userId: number; tituloDocumento: string; body: DocumentoAcaoDTO }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const v = await loadVersaoWithBlob(conn, args.tenantId, args.versaoId);
    if (Number(v.documentoId) !== Number(args.documentoId)) throw new ApiError(422, 'Documento/versão inválidos.');

    const acao = String((args.body as any).acao || '').toUpperCase();
    if (acao === 'ENVIAR_ASSINATURA') {
      await conn.commit();
      return enviarDocumentoParaAssinatura({ tenantId: args.tenantId, versaoId: args.versaoId, userId: args.userId });
    }

    if (acao === 'GERAR_PDF_FINAL') {
      const tokenUrl = await getVerificacaoUrl(args.tenantId, args.versaoId);
      const codigo = buildCodigoVerificacao();
      const resumo = await loadAssinaturasResumo(args.tenantId, args.versaoId);
      const base = v.blobPdfCarimbado ? new Uint8Array(v.blobPdfCarimbado as Buffer) : new Uint8Array(v.blobOriginal as Buffer);
      const stamped = await stampPdf({
        pdfBytes: base,
        titulo: args.tituloDocumento,
        codigoVerificacao: codigo,
        verificacaoUrl: tokenUrl,
        hashOriginal: String(v.hashOriginal),
        assinaturasResumo: resumo,
      });
      const hashStamped = sha256Hex(stamped);
      await conn.execute(
        `
        UPDATE documentos_versoes
        SET conteudo_blob_pdf_carimbado = ?, hash_sha256_pdf_carimbado = ?, storage_path_pdf_carimbado = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_documento_versao = ?
        `,
        [stamped, hashStamped, `db://documentos/${args.documentoId}/v${Number(v.numeroVersao)}/final.pdf`, args.tenantId, args.versaoId]
      );
      await addHistorico({ tenantId: args.tenantId, documentoId: args.documentoId, versaoId: args.versaoId, tipo: 'GERADO_PDF_FINAL', descricao: 'PDF final carimbado gerado.', userId: args.userId });
      await conn.commit();
      return { status: 'ok' };
    }

    if (!['ASSINAR', 'APROVAR', 'CIENTE', 'REJEITAR'].includes(acao)) throw new ApiError(422, 'Ação inválida.');
    if (String(v.statusVersao) !== 'EM_ASSINATURA' && String(v.statusVersao) !== 'ATIVA') throw new ApiError(422, 'Versão não aceita assinatura neste status.');

    const parecer = (args.body as any).parecer ? String((args.body as any).parecer).trim() : '';
    const assinatura = (args.body as any).assinatura;
    if (!assinatura?.pin) throw new ApiError(422, 'PIN obrigatório.');
    await validateUserPin({ tenantId: args.tenantId, userId: args.userId, pin: String(assinatura.pin) });

    const fluxo = await resolveFluxoDisponivel(conn, args.tenantId, args.versaoId, args.userId);
    if (Number(fluxo.parecerObrigatorio) && !parecer) throw new ApiError(422, 'Parecer obrigatório.');

    const hashAntes = v.blobPdfCarimbado ? sha256Hex(new Uint8Array(v.blobPdfCarimbado as Buffer)) : String(v.hashOriginal);

    const [assRes]: any = await conn.query(
      `
      INSERT INTO assinaturas_registros
        (tenant_id, entidade_tipo, entidade_id, id_usuario_captura, tipo_assinatura, ip_origem, user_agent, hash_documento, observacao, metadata_json)
      VALUES (?, 'DOCUMENTO_VERSAO', ?, ?, 'PIN', ?, ?, ?, ?, ?)
      `,
      [
        args.tenantId,
        args.versaoId,
        args.userId,
        null,
        null,
        hashAntes,
        `Documento ${acao}`,
        JSON.stringify({ documentoId: args.documentoId, versaoId: args.versaoId, fluxoId: Number(fluxo.id), acao }),
      ]
    );
    const idAssinaturaRegistro = Number(assRes.insertId);

    const nomeExibicao = await getUserDisplayName(args.tenantId, args.userId);
    const codigoVerificacao = buildCodigoVerificacao();
    const qrToken = randomToken(24);

    const [docAss]: any = await conn.query(
      `
      INSERT INTO documentos_assinaturas
        (tenant_id, id_documento_versao, id_documento_fluxo_assinatura, id_assinatura_registro, tipo_decisao,
         nome_exibicao_signatario, papel_signatario, parecer, hash_documento_antes, codigo_verificacao, qr_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        args.tenantId,
        args.versaoId,
        Number(fluxo.id),
        idAssinaturaRegistro,
        acao,
        nomeExibicao.slice(0, 180),
        String(fluxo.papel).slice(0, 40),
        parecer || null,
        hashAntes,
        codigoVerificacao,
        qrToken,
      ]
    );
    const idDocumentoAssinatura = Number(docAss.insertId);

    await conn.execute(
      `
      UPDATE documentos_fluxos_assinatura
      SET status_fluxo = ?, decidido_em = NOW()
      WHERE tenant_id = ? AND id_documento_fluxo_assinatura = ?
      `,
      [acao === 'REJEITAR' ? 'REJEITADO' : 'ASSINADO', args.tenantId, Number(fluxo.id)]
    );

    const tokenUrl = await getVerificacaoUrl(args.tenantId, args.versaoId);
    const resumo = await loadAssinaturasResumo(args.tenantId, args.versaoId);
    const base = v.blobPdfCarimbado ? new Uint8Array(v.blobPdfCarimbado as Buffer) : new Uint8Array(v.blobOriginal as Buffer);
    const stamped = await stampPdf({
      pdfBytes: base,
      titulo: args.tituloDocumento,
      codigoVerificacao,
      verificacaoUrl: tokenUrl,
      hashOriginal: String(v.hashOriginal),
      assinaturasResumo: resumo,
    });
    const hashDepois = sha256Hex(stamped);

    await conn.execute(
      `
      UPDATE documentos_versoes
      SET conteudo_blob_pdf_carimbado = ?, hash_sha256_pdf_carimbado = ?, storage_path_pdf_carimbado = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_documento_versao = ?
      `,
      [stamped, hashDepois, `db://documentos/${args.documentoId}/v${Number(v.numeroVersao)}/carimbado.pdf`, args.tenantId, args.versaoId]
    );
    await conn.execute(
      `
      UPDATE documentos_assinaturas
      SET hash_documento_depois = ?
      WHERE tenant_id = ? AND id_documento_assinatura = ?
      `,
      [hashDepois, args.tenantId, idDocumentoAssinatura]
    );

    if (acao === 'REJEITAR') {
      await conn.execute(
        `
        UPDATE documentos_fluxos_assinatura
        SET status_fluxo = 'IGNORADO'
        WHERE tenant_id = ? AND id_documento_versao = ? AND status_fluxo IN ('PENDENTE','DISPONIVEL')
        `,
        [args.tenantId, args.versaoId]
      );
      await conn.execute(
        `
        UPDATE documentos_versoes
        SET status_versao = 'INVALIDADA', finalizada_em = NOW()
        WHERE tenant_id = ? AND id_documento_versao = ?
        `,
        [args.tenantId, args.versaoId]
      );
      await conn.execute(
        `
        UPDATE documentos_registros
        SET status_documento = 'INVALIDADO', bloqueado_para_edicao = 1
        WHERE tenant_id = ? AND id_documento_registro = ?
        `,
        [args.tenantId, args.documentoId]
      );
      await addHistorico({ tenantId: args.tenantId, documentoId: args.documentoId, versaoId: args.versaoId, tipo: 'REJEITADO', descricao: 'Documento rejeitado.', userId: args.userId });
      await conn.commit();
      return { status: 'ok' };
    }

    const nextId = await advanceFluxo(conn, args.tenantId, args.versaoId, Number(fluxo.ordem));
    if (!nextId) {
      await conn.execute(
        `
        UPDATE documentos_versoes
        SET status_versao = 'ASSINADA', finalizada_em = NOW()
        WHERE tenant_id = ? AND id_documento_versao = ?
        `,
        [args.tenantId, args.versaoId]
      );
      await conn.execute(
        `
        UPDATE documentos_registros
        SET status_documento = 'ASSINADO', bloqueado_para_edicao = 1
        WHERE tenant_id = ? AND id_documento_registro = ?
        `,
        [args.tenantId, args.documentoId]
      );
      await addHistorico({ tenantId: args.tenantId, documentoId: args.documentoId, versaoId: args.versaoId, tipo: 'ASSINADO', descricao: 'Documento assinado.', userId: args.userId });
    }

    await conn.commit();
    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function obterVersaoDetalhe(tenantId: number, versaoId: number): Promise<DocumentoVersaoDetalheDTO> {
  const [[v]]: any = await db.query(
    `
    SELECT
      v.id_documento_versao AS id,
      v.id_documento_registro AS documentoId,
      v.numero_versao AS numeroVersao,
      v.nome_arquivo_original AS nomeArquivoOriginal,
      v.mime_type AS mimeType,
      v.tamanho_bytes AS tamanhoBytes,
      v.hash_sha256_original AS hashSha256Original,
      v.hash_sha256_pdf_carimbado AS hashSha256PdfCarimbado,
      v.status_versao AS statusVersao,
      v.finalizada_em AS finalizadaEm,
      v.criado_em AS criadoEm
    FROM documentos_versoes v
    WHERE v.tenant_id = ? AND v.id_documento_versao = ?
    LIMIT 1
    `,
    [tenantId, versaoId]
  );
  if (!v) throw new ApiError(404, 'Versão não encontrada.');

  const [[d]]: any = await db.query(
    `
    SELECT
      id_documento_registro AS id,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      categoria_documento AS categoriaDocumento,
      titulo_documento AS tituloDocumento,
      descricao_documento AS descricaoDocumento,
      status_documento AS statusDocumento,
      id_versao_atual AS idVersaoAtual,
      criado_em AS criadoEm,
      atualizado_em AS atualizadoEm
    FROM documentos_registros
    WHERE tenant_id = ? AND id_documento_registro = ?
    LIMIT 1
    `,
    [tenantId, Number(v.documentoId)]
  );
  if (!d) throw new ApiError(404, 'Documento não encontrado.');

  const [fluxoRows]: any = await db.query(
    `
    SELECT
      id_documento_fluxo_assinatura AS id,
      ordem_assinatura AS ordemAssinatura,
      papel_signatario AS papelSignatario,
      tipo_signatario AS tipoSignatario,
      id_usuario_signatario AS idUsuarioSignatario,
      permissao_signatario AS permissaoSignatario,
      assinatura_obrigatoria AS assinaturaObrigatoria,
      parecer_obrigatorio AS parecerObrigatorio,
      status_fluxo AS statusFluxo,
      vencimento_em AS vencimentoEm,
      decidido_em AS decididoEm
    FROM documentos_fluxos_assinatura
    WHERE tenant_id = ? AND id_documento_versao = ?
    ORDER BY ordem_assinatura ASC
    `,
    [tenantId, versaoId]
  );

  const [assRows]: any = await db.query(
    `
    SELECT
      id_documento_assinatura AS id,
      tipo_decisao AS tipoDecisao,
      nome_exibicao_signatario AS nomeExibicaoSignatario,
      papel_signatario AS papelSignatario,
      parecer,
      codigo_verificacao AS codigoVerificacao,
      criado_em AS criadoEm
    FROM documentos_assinaturas
    WHERE tenant_id = ? AND id_documento_versao = ?
    ORDER BY id_documento_assinatura ASC
    `,
    [tenantId, versaoId]
  );

  const [histRows]: any = await db.query(
    `
    SELECT
      id_documento_historico AS id,
      tipo_evento AS tipoEvento,
      descricao_evento AS descricaoEvento,
      criado_em AS criadoEm
    FROM documentos_historico
    WHERE tenant_id = ? AND id_documento_registro = ?
    ORDER BY id_documento_historico ASC
    LIMIT 200
    `,
    [tenantId, Number(v.documentoId)]
  );

  const token = await getVerificacaoToken(tenantId, versaoId);

  return {
    versao: {
      id: Number(v.id),
      idDocumentoRegistro: Number(v.documentoId),
      numeroVersao: Number(v.numeroVersao),
      nomeArquivoOriginal: String(v.nomeArquivoOriginal),
      mimeType: String(v.mimeType),
      tamanhoBytes: Number(v.tamanhoBytes),
      hashSha256Original: String(v.hashSha256Original),
      hashSha256PdfCarimbado: v.hashSha256PdfCarimbado ? String(v.hashSha256PdfCarimbado) : null,
      statusVersao: String(v.statusVersao) as DocumentoVersaoStatus,
      finalizadaEm: toIso(v.finalizadaEm),
      criadoEm: toIso(v.criadoEm) || nowIso(),
    },
    documento: {
      id: Number(d.id),
      entidadeTipo: d.entidadeTipo ? String(d.entidadeTipo) : null,
      entidadeId: d.entidadeId !== null ? Number(d.entidadeId) : null,
      categoriaDocumento: String(d.categoriaDocumento),
      tituloDocumento: String(d.tituloDocumento),
      descricaoDocumento: d.descricaoDocumento ? String(d.descricaoDocumento) : null,
      statusDocumento: String(d.statusDocumento) as any,
      idVersaoAtual: d.idVersaoAtual !== null ? Number(d.idVersaoAtual) : null,
      criadoEm: toIso(d.criadoEm) || nowIso(),
      atualizadoEm: toIso(d.atualizadoEm) || nowIso(),
    },
    fluxo: (fluxoRows as any[]).map((r) => ({
      id: Number(r.id),
      ordemAssinatura: Number(r.ordemAssinatura),
      papelSignatario: String(r.papelSignatario),
      tipoSignatario: String(r.tipoSignatario) as any,
      idUsuarioSignatario: r.idUsuarioSignatario !== null ? Number(r.idUsuarioSignatario) : null,
      permissaoSignatario: r.permissaoSignatario ? String(r.permissaoSignatario) : null,
      assinaturaObrigatoria: Boolean(r.assinaturaObrigatoria),
      parecerObrigatorio: Boolean(r.parecerObrigatorio),
      statusFluxo: String(r.statusFluxo) as any,
      vencimentoEm: toIso(r.vencimentoEm),
      decididoEm: toIso(r.decididoEm),
    })),
    assinaturas: (assRows as any[]).map((r) => ({
      id: Number(r.id),
      tipoDecisao: String(r.tipoDecisao) as any,
      nomeExibicaoSignatario: String(r.nomeExibicaoSignatario),
      papelSignatario: String(r.papelSignatario),
      parecer: r.parecer ? String(r.parecer) : null,
      codigoVerificacao: String(r.codigoVerificacao),
      criadoEm: toIso(r.criadoEm) || nowIso(),
    })),
    historico: (histRows as any[]).map((r) => ({
      id: Number(r.id),
      tipoEvento: String(r.tipoEvento),
      descricaoEvento: String(r.descricaoEvento),
      criadoEm: toIso(r.criadoEm) || nowIso(),
    })),
    verificacaoToken: token,
  };
}

export async function baixarDocumentoVersao(args: { tenantId: number; versaoId: number; tipo: 'ORIGINAL' | 'PDF_FINAL' }) {
  const [[v]]: any = await db.query(
    `
    SELECT
      nome_arquivo_original AS nome,
      mime_type AS mimeType,
      conteudo_blob_original AS blobOriginal,
      conteudo_blob_pdf_carimbado AS blobCarimbado
    FROM documentos_versoes
    WHERE tenant_id = ? AND id_documento_versao = ?
    LIMIT 1
    `,
    [args.tenantId, args.versaoId]
  );
  if (!v) throw new ApiError(404, 'Versão não encontrada.');
  const blob = args.tipo === 'PDF_FINAL' ? v.blobCarimbado : v.blobOriginal;
  if (!blob) throw new ApiError(404, 'Arquivo indisponível.');
  const nome = args.tipo === 'PDF_FINAL' ? `documento-final-${String(v.nome || 'documento')}` : String(v.nome || 'documento.pdf');
  const bytes = new Uint8Array(blob as Buffer);
  return { nome, mimeType: String(v.mimeType || 'application/pdf'), bytes };
}

export async function verificarDocumentoPorVersao(args: { tenantId: number; versaoId: number }): Promise<DocumentoVerificacaoDTO> {
  const detalhe = await obterVersaoDetalhe(args.tenantId, args.versaoId);
  const [[v]]: any = await db.query(
    `
    SELECT conteudo_blob_pdf_carimbado AS blobCarimbado, hash_sha256_pdf_carimbado AS hashEsperado, hash_sha256_original AS hashOriginal, conteudo_blob_original AS blobOriginal
    FROM documentos_versoes
    WHERE tenant_id = ? AND id_documento_versao = ?
    LIMIT 1
    `,
    [args.tenantId, args.versaoId]
  );
  if (!v) throw new ApiError(404, 'Versão não encontrada.');

  const blob = v.blobCarimbado || v.blobOriginal;
  const expected = v.hashEsperado ? String(v.hashEsperado) : String(v.hashOriginal);
  const conferido = blob ? sha256Hex(new Uint8Array(blob as Buffer)) : null;
  const valido = !!conferido && conferido === expected;

  return {
    valido,
    tituloDocumento: detalhe.documento.tituloDocumento,
    numeroVersao: detalhe.versao.numeroVersao,
    hashConferido: conferido,
    hashEsperado: expected,
    assinado: detalhe.documento.statusDocumento === 'ASSINADO' || detalhe.versao.statusVersao === 'ASSINADA',
    signatarios: detalhe.assinaturas.map((a) => ({
      nome: a.nomeExibicaoSignatario,
      papel: a.papelSignatario,
      dataHora: a.criadoEm,
      decisao: a.tipoDecisao,
      codigo: a.codigoVerificacao,
    })),
  };
}

export async function verificarDocumentoPorToken(args: { token: string }): Promise<DocumentoVerificacaoDTO> {
  const token = String(args.token || '').trim();
  if (!token) throw new ApiError(422, 'Token inválido.');
  const [[row]]: any = await db.query(
    `
    SELECT tenant_id AS tenantId, id_documento_versao AS versaoId
    FROM documentos_tokens_verificacao
    WHERE token_verificacao = ? AND ativo = 1
    LIMIT 1
    `,
    [token]
  );
  if (!row) throw new ApiError(404, 'Token não encontrado.');
  return verificarDocumentoPorVersao({ tenantId: Number(row.tenantId), versaoId: Number(row.versaoId) });
}

