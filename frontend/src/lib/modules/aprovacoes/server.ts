import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import { getApprovalHandler } from './registry';
import type {
  AprovacaoDecisaoDTO,
  AprovacaoHistoricoDTO,
  AprovacaoModeloDTO,
  AprovacaoModeloEtapaDTO,
  AprovacaoModeloSaveDTO,
  AprovacaoSolicitacaoDTO,
  AprovacaoSolicitacaoDetalheDTO,
  AprovacaoSolicitacaoEtapaDTO,
  AssinaturaInputDTO,
  MinhaAprovacaoPendenteDTO,
} from './types';
import type { ApprovalEntityScope } from './types-internal';
import { resolveAprovadores } from './resolve-aprovadores';
import { shouldIncludeEtapaByValor } from './alcada';
import { assignNotificationRecipient, upsertNotificationEvent } from '@/lib/notifications/service';
import type { AlertSignal } from '@/lib/alerts/types';
import { publishMenuRefreshForUser } from '@/lib/realtime/publish';

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

async function addHistorico(conn: any, args: { tenantId: number; solicitacaoId: number; statusAnterior: string | null; statusNovo: string; descricao: string; userId: number | null; metadata?: any }) {
  await conn.execute(
    `
    INSERT INTO aprovacoes_historico
      (tenant_id, id_aprovacao_solicitacao, status_anterior, status_novo, descricao_evento, id_usuario_evento, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      args.tenantId,
      args.solicitacaoId,
      args.statusAnterior,
      args.statusNovo,
      args.descricao,
      args.userId,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ]
  );
}

async function notifyUser(args: { tenantId: number; userId: number; signal: AlertSignal }) {
  const eventId = await upsertNotificationEvent({ tenantId: args.tenantId, userId: args.userId, signal: args.signal });
  await assignNotificationRecipient({ tenantId: args.tenantId, eventId, userId: args.userId });
}

async function loadModeloAtivoByEntidade(conn: any, args: { tenantId: number; entidadeTipo: string }) {
  const [[row]]: any = await conn.query(
    `
    SELECT id_aprovacao_modelo AS id
    FROM aprovacoes_modelos
    WHERE tenant_id = ? AND entidade_tipo = ? AND ativo = 1
    ORDER BY id_aprovacao_modelo DESC
    LIMIT 1
    `,
    [args.tenantId, args.entidadeTipo]
  );
  return row?.id ? Number(row.id) : null;
}

export async function listarModelos(tenantId: number): Promise<AprovacaoModeloDTO[]> {
  const [rows]: any = await db.query(
    `
    SELECT
      id_aprovacao_modelo AS id,
      nome_modelo AS nome,
      entidade_tipo AS entidadeTipo,
      descricao_modelo AS descricaoModelo,
      ativo,
      exige_assinatura_aprovador AS exigeAssinaturaAprovador,
      permite_devolucao AS permiteDevolucao,
      permite_reenvio AS permiteReenvio,
      aplica_alcada_valor AS aplicaAlcadaValor
    FROM aprovacoes_modelos
    WHERE tenant_id = ?
    ORDER BY ativo DESC, nome_modelo ASC
    `,
    [tenantId]
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    nome: String(r.nome),
    entidadeTipo: String(r.entidadeTipo),
    descricaoModelo: r.descricaoModelo ? String(r.descricaoModelo) : null,
    ativo: Boolean(r.ativo),
    exigeAssinaturaAprovador: Boolean(r.exigeAssinaturaAprovador),
    permiteDevolucao: Boolean(r.permiteDevolucao),
    permiteReenvio: Boolean(r.permiteReenvio),
    aplicaAlcadaValor: Boolean(r.aplicaAlcadaValor),
  }));
}

export async function obterModeloDetalhe(tenantId: number, idModelo: number): Promise<{ modelo: AprovacaoModeloDTO; etapas: AprovacaoModeloEtapaDTO[] }> {
  const [[m]]: any = await db.query(
    `
    SELECT
      id_aprovacao_modelo AS id,
      nome_modelo AS nome,
      entidade_tipo AS entidadeTipo,
      descricao_modelo AS descricaoModelo,
      ativo,
      exige_assinatura_aprovador AS exigeAssinaturaAprovador,
      permite_devolucao AS permiteDevolucao,
      permite_reenvio AS permiteReenvio,
      aplica_alcada_valor AS aplicaAlcadaValor
    FROM aprovacoes_modelos
    WHERE tenant_id = ? AND id_aprovacao_modelo = ?
    LIMIT 1
    `,
    [tenantId, idModelo]
  );
  if (!m) throw new ApiError(404, 'Modelo não encontrado.');

  const [rows]: any = await db.query(
    `
    SELECT
      id_aprovacao_modelo_etapa AS id,
      ordem_etapa AS ordem,
      nome_etapa AS nome,
      tipo_aprovador AS tipoAprovador,
      id_usuario_aprovador AS idUsuarioAprovador,
      permissao_aprovador AS permissaoAprovador,
      exige_todos AS exigeTodos,
      quantidade_minima_aprovacoes AS quantidadeMinimaAprovacoes,
      prazo_horas AS prazoHoras,
      valor_minimo AS valorMinimo,
      valor_maximo AS valorMaximo,
      parecer_obrigatorio_aprovar AS parecerObrigatorioAprovar,
      parecer_obrigatorio_rejeitar AS parecerObrigatorioRejeitar,
      ativo
    FROM aprovacoes_modelos_etapas
    WHERE id_aprovacao_modelo = ?
    ORDER BY ordem_etapa ASC
    `,
    [idModelo]
  );

  return {
    modelo: {
      id: Number(m.id),
      nome: String(m.nome),
      entidadeTipo: String(m.entidadeTipo),
      descricaoModelo: m.descricaoModelo ? String(m.descricaoModelo) : null,
      ativo: Boolean(m.ativo),
      exigeAssinaturaAprovador: Boolean(m.exigeAssinaturaAprovador),
      permiteDevolucao: Boolean(m.permiteDevolucao),
      permiteReenvio: Boolean(m.permiteReenvio),
      aplicaAlcadaValor: Boolean(m.aplicaAlcadaValor),
    },
    etapas: (rows as any[]).map((r) => ({
      id: Number(r.id),
      ordem: Number(r.ordem),
      nome: String(r.nome),
      tipoAprovador: String(r.tipoAprovador) as any,
      idUsuarioAprovador: r.idUsuarioAprovador !== null ? Number(r.idUsuarioAprovador) : null,
      permissaoAprovador: r.permissaoAprovador ? String(r.permissaoAprovador) : null,
      exigeTodos: Boolean(r.exigeTodos),
      quantidadeMinimaAprovacoes: r.quantidadeMinimaAprovacoes !== null ? Number(r.quantidadeMinimaAprovacoes) : null,
      prazoHoras: r.prazoHoras !== null ? Number(r.prazoHoras) : null,
      valorMinimo: r.valorMinimo !== null ? Number(r.valorMinimo) : null,
      valorMaximo: r.valorMaximo !== null ? Number(r.valorMaximo) : null,
      parecerObrigatorioAprovar: Boolean(r.parecerObrigatorioAprovar),
      parecerObrigatorioRejeitar: Boolean(r.parecerObrigatorioRejeitar),
      ativo: Boolean(r.ativo),
    })),
  };
}

export async function criarModelo(tenantId: number, body: AprovacaoModeloSaveDTO) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [res]: any = await conn.execute(
      `
      INSERT INTO aprovacoes_modelos
        (tenant_id, nome_modelo, entidade_tipo, descricao_modelo, ativo, exige_assinatura_aprovador, permite_devolucao, permite_reenvio, aplica_alcada_valor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tenantId,
        body.nome,
        body.entidadeTipo,
        body.descricaoModelo ?? null,
        body.ativo ? 1 : 0,
        body.exigeAssinaturaAprovador ? 1 : 0,
        body.permiteDevolucao ? 1 : 0,
        body.permiteReenvio ? 1 : 0,
        body.aplicaAlcadaValor ? 1 : 0,
      ]
    );
    const idModelo = Number(res.insertId);

    for (const e of body.etapas || []) {
      await conn.execute(
        `
        INSERT INTO aprovacoes_modelos_etapas
          (id_aprovacao_modelo, ordem_etapa, nome_etapa, tipo_aprovador, id_usuario_aprovador, permissao_aprovador,
           exige_todos, quantidade_minima_aprovacoes, prazo_horas, valor_minimo, valor_maximo, parecer_obrigatorio_aprovar, parecer_obrigatorio_rejeitar, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          idModelo,
          e.ordem,
          e.nome,
          e.tipoAprovador,
          e.idUsuarioAprovador,
          e.permissaoAprovador,
          e.exigeTodos ? 1 : 0,
          e.quantidadeMinimaAprovacoes,
          e.prazoHoras,
          e.valorMinimo,
          e.valorMaximo,
          e.parecerObrigatorioAprovar ? 1 : 0,
          e.parecerObrigatorioRejeitar ? 1 : 0,
          e.ativo ? 1 : 0,
        ]
      );
    }

    await conn.commit();
    return { id: idModelo };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function atualizarModelo(tenantId: number, idModelo: number, body: AprovacaoModeloSaveDTO) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[m]]: any = await conn.query(
      `SELECT id_aprovacao_modelo AS id FROM aprovacoes_modelos WHERE tenant_id = ? AND id_aprovacao_modelo = ? LIMIT 1`,
      [tenantId, idModelo]
    );
    if (!m) throw new ApiError(404, 'Modelo não encontrado.');

    await conn.execute(
      `
      UPDATE aprovacoes_modelos
      SET nome_modelo = ?,
          entidade_tipo = ?,
          descricao_modelo = ?,
          ativo = ?,
          exige_assinatura_aprovador = ?,
          permite_devolucao = ?,
          permite_reenvio = ?,
          aplica_alcada_valor = ?,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_aprovacao_modelo = ?
      `,
      [
        body.nome,
        body.entidadeTipo,
        body.descricaoModelo ?? null,
        body.ativo ? 1 : 0,
        body.exigeAssinaturaAprovador ? 1 : 0,
        body.permiteDevolucao ? 1 : 0,
        body.permiteReenvio ? 1 : 0,
        body.aplicaAlcadaValor ? 1 : 0,
        tenantId,
        idModelo,
      ]
    );

    await conn.execute(`DELETE FROM aprovacoes_modelos_etapas WHERE id_aprovacao_modelo = ?`, [idModelo]);

    for (const e of body.etapas || []) {
      await conn.execute(
        `
        INSERT INTO aprovacoes_modelos_etapas
          (id_aprovacao_modelo, ordem_etapa, nome_etapa, tipo_aprovador, id_usuario_aprovador, permissao_aprovador,
           exige_todos, quantidade_minima_aprovacoes, prazo_horas, valor_minimo, valor_maximo, parecer_obrigatorio_aprovar, parecer_obrigatorio_rejeitar, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          idModelo,
          e.ordem,
          e.nome,
          e.tipoAprovador,
          e.idUsuarioAprovador,
          e.permissaoAprovador,
          e.exigeTodos ? 1 : 0,
          e.quantidadeMinimaAprovacoes,
          e.prazoHoras,
          e.valorMinimo,
          e.valorMaximo,
          e.parecerObrigatorioAprovar ? 1 : 0,
          e.parecerObrigatorioRejeitar ? 1 : 0,
          e.ativo ? 1 : 0,
        ]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function criarSolicitacaoAprovacao(args: { tenantId: number; entidadeTipo: string; entidadeId: number; userId: number; idModelo?: number | null }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const handler = getApprovalHandler(args.entidadeTipo);
    if (!handler) throw new ApiError(422, `Entidade não suportada para aprovação: ${args.entidadeTipo}`);
    await handler.validarPodeSolicitar(args.tenantId, args.entidadeId, args.userId);

    const idModelo = args.idModelo ?? (await loadModeloAtivoByEntidade(conn, { tenantId: args.tenantId, entidadeTipo: args.entidadeTipo }));
    if (!idModelo) throw new ApiError(422, 'Nenhum modelo de aprovação ativo configurado para esta entidade.');

    const titulo = await handler.obterTitulo(args.tenantId, args.entidadeId);
    const descricao = handler.obterDescricao ? await handler.obterDescricao(args.tenantId, args.entidadeId) : null;
    const valorReferencia = handler.obterValorReferencia ? await handler.obterValorReferencia(args.tenantId, args.entidadeId) : null;
    const snapshot = await handler.obterSnapshot(args.tenantId, args.entidadeId);
    const scope = handler.obterScope ? await handler.obterScope(args.tenantId, args.entidadeId) : null;

    await conn.execute(
      `
      INSERT INTO aprovacoes_solicitacoes
        (tenant_id, id_aprovacao_modelo, entidade_tipo, entidade_id, titulo_solicitacao, descricao_solicitacao, status_solicitacao,
         valor_referencia, id_usuario_solicitante, snapshot_json, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, 'RASCUNHO', ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        titulo_solicitacao = VALUES(titulo_solicitacao),
        descricao_solicitacao = VALUES(descricao_solicitacao),
        valor_referencia = VALUES(valor_referencia),
        snapshot_json = VALUES(snapshot_json),
        metadata_json = VALUES(metadata_json),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [
        args.tenantId,
        idModelo,
        args.entidadeTipo,
        args.entidadeId,
        titulo.slice(0, 180),
        descricao,
        valorReferencia,
        args.userId,
        JSON.stringify(snapshot || {}),
        scope ? JSON.stringify({ scope }) : null,
      ]
    );

    const [[row]]: any = await conn.query(
      `
      SELECT id_aprovacao_solicitacao AS id
      FROM aprovacoes_solicitacoes
      WHERE tenant_id = ? AND entidade_tipo = ? AND entidade_id = ?
      LIMIT 1
      `,
      [args.tenantId, args.entidadeTipo, args.entidadeId]
    );
    const solicitacaoId = Number(row?.id);
    if (!solicitacaoId) throw new ApiError(500, 'Falha ao criar solicitação.');

    await addHistorico(conn, {
      tenantId: args.tenantId,
      solicitacaoId,
      statusAnterior: null,
      statusNovo: 'RASCUNHO',
      descricao: 'Solicitação criada/atualizada.',
      userId: args.userId,
    });

    await conn.commit();
    return { id: solicitacaoId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function createSignatureForUserDecision(args: {
  conn: any;
  tenantId: number;
  userId: number;
  assinatura: AssinaturaInputDTO;
  decisaoId: number;
  reqIp?: string | null;
  userAgent?: string | null;
}) {
  const tipo = String((args.assinatura as any)?.tipo || '').toUpperCase();
  if (tipo !== 'PIN') throw new ApiError(422, 'Tipo de assinatura não suportado para aprovação. Use PIN.');
  const pin = String((args.assinatura as any)?.pin || '');
  if (!pin || pin.length < 4) throw new ApiError(422, 'PIN inválido.');

  const [[pinRow]]: any = await args.conn.query(
    `
    SELECT pin_hash
    FROM usuarios_assinatura_habilitacoes
    WHERE tenant_id = ? AND id_usuario = ? AND tipo_assinatura = 'PIN' AND ativo = 1
    LIMIT 1
    `,
    [args.tenantId, args.userId]
  );
  if (!pinRow?.pin_hash) throw new ApiError(422, 'Usuário sem PIN habilitado.');
  const okPin = await bcrypt.compare(pin, String(pinRow.pin_hash));
  if (!okPin) throw new ApiError(422, 'PIN inválido.');

  const [res]: any = await args.conn.query(
    `
    INSERT INTO assinaturas_registros
      (tenant_id, entidade_tipo, entidade_id, id_usuario_captura, tipo_assinatura, ip_origem, user_agent, observacao, metadata_json)
    VALUES
      (?, 'APROVACAO_DECISAO', ?, ?, 'PIN', ?, ?, ?, ?)
    `,
    [
      args.tenantId,
      args.decisaoId,
      args.userId,
      args.reqIp ?? null,
      args.userAgent ?? null,
      'Assinatura do aprovador (PIN).',
      JSON.stringify({ idUsuarioSignatario: args.userId }),
    ]
  );
  return Number(res.insertId);
}

export async function enviarSolicitacaoAprovacao(args: { tenantId: number; solicitacaoId: number; userId: number }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[sol]]: any = await conn.query(
      `
      SELECT
        id_aprovacao_solicitacao AS id,
        id_aprovacao_modelo AS idModelo,
        entidade_tipo AS entidadeTipo,
        entidade_id AS entidadeId,
        status_solicitacao AS status,
        valor_referencia AS valorReferencia,
        id_usuario_solicitante AS idUsuarioSolicitante,
        metadata_json AS metadataJson
      FROM aprovacoes_solicitacoes
      WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
      LIMIT 1
      `,
      [args.tenantId, args.solicitacaoId]
    );
    if (!sol) throw new ApiError(404, 'Solicitação não encontrada.');
    if (Number(sol.idUsuarioSolicitante) !== Number(args.userId)) throw new ApiError(403, 'Apenas o solicitante pode enviar.');

    const statusAtual = String(sol.status || '');
    if (!['RASCUNHO', 'DEVOLVIDA'].includes(statusAtual)) throw new ApiError(422, 'Solicitação não pode ser enviada neste status.');

    const handler = getApprovalHandler(String(sol.entidadeTipo));
    if (!handler) throw new ApiError(422, `Entidade não suportada para aprovação: ${String(sol.entidadeTipo)}`);
    await handler.validarPodeSolicitar(args.tenantId, Number(sol.entidadeId), args.userId);

    const meta = parseJsonMaybe(sol.metadataJson) || {};
    const scope: ApprovalEntityScope | null = meta?.scope ? (meta.scope as any) : null;
    const valorReferencia = sol.valorReferencia !== null ? Number(sol.valorReferencia) : null;

    const [[modelo]]: any = await conn.query(
      `
      SELECT
        exige_assinatura_aprovador AS exigeAssinaturaAprovador,
        permite_devolucao AS permiteDevolucao,
        permite_reenvio AS permiteReenvio,
        aplica_alcada_valor AS aplicaAlcadaValor
      FROM aprovacoes_modelos
      WHERE tenant_id = ? AND id_aprovacao_modelo = ?
      LIMIT 1
      `,
      [args.tenantId, Number(sol.idModelo)]
    );
    if (!modelo) throw new ApiError(422, 'Modelo de aprovação não encontrado.');

    await conn.execute(`DELETE FROM aprovacoes_solicitacoes_etapas_aprovadores WHERE tenant_id = ? AND id_aprovacao_solicitacao_etapa IN (SELECT id_aprovacao_solicitacao_etapa FROM aprovacoes_solicitacoes_etapas WHERE id_aprovacao_solicitacao = ?)`, [
      args.tenantId,
      args.solicitacaoId,
    ]);
    await conn.execute(`DELETE FROM aprovacoes_solicitacoes_etapas WHERE id_aprovacao_solicitacao = ?`, [args.solicitacaoId]);

    const [etapasModelo]: any = await conn.query(
      `
      SELECT
        id_aprovacao_modelo_etapa AS id,
        ordem_etapa AS ordem,
        nome_etapa AS nome,
        tipo_aprovador AS tipoAprovador,
        id_usuario_aprovador AS idUsuarioAprovador,
        permissao_aprovador AS permissaoAprovador,
        exige_todos AS exigeTodos,
        quantidade_minima_aprovacoes AS quantidadeMinimaAprovacoes,
        prazo_horas AS prazoHoras,
        valor_minimo AS valorMinimo,
        valor_maximo AS valorMaximo,
        ativo
      FROM aprovacoes_modelos_etapas
      WHERE id_aprovacao_modelo = ? AND ativo = 1
      ORDER BY ordem_etapa ASC
      `,
      [Number(sol.idModelo)]
    );
    if (!etapasModelo.length) throw new ApiError(422, 'Modelo não possui etapas ativas.');

    let firstEtapaId: number | null = null;
    let firstEtapaVencimento: string | null = null;
    let firstResponsavel: number | null = null;

    for (const em of etapasModelo as any[]) {
      const include = shouldIncludeEtapaByValor({
        aplicaAlcadaValor: Boolean(modelo.aplicaAlcadaValor),
        valorReferencia,
        valorMinimo: em.valorMinimo !== null ? Number(em.valorMinimo) : null,
        valorMaximo: em.valorMaximo !== null ? Number(em.valorMaximo) : null,
      });
      if (!include) continue;

      const prazoHoras = em.prazoHoras !== null ? Number(em.prazoHoras) : null;
      const vencimentoEm =
        prazoHoras && prazoHoras > 0 ? new Date(Date.now() + prazoHoras * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ') : null;

      const [resEtapa]: any = await conn.execute(
        `
        INSERT INTO aprovacoes_solicitacoes_etapas
          (id_aprovacao_solicitacao, id_aprovacao_modelo_etapa, ordem_etapa, nome_etapa, status_etapa, tipo_aprovador,
           prazo_horas, vencimento_em, exige_todos, quantidade_minima_aprovacoes, aprovacoes_realizadas)
        VALUES (?, ?, ?, ?, 'PENDENTE', ?, ?, ?, ?, ?, 0)
        `,
        [
          args.solicitacaoId,
          Number(em.id),
          Number(em.ordem),
          String(em.nome),
          String(em.tipoAprovador),
          prazoHoras,
          vencimentoEm,
          Boolean(em.exigeTodos) ? 1 : 0,
          em.quantidadeMinimaAprovacoes !== null ? Number(em.quantidadeMinimaAprovacoes) : null,
        ]
      );
      const etapaId = Number(resEtapa.insertId);

      const aprovadores = await resolveAprovadores({
        tenantId: args.tenantId,
        tipoAprovador: String(em.tipoAprovador) as any,
        idUsuarioAprovador: em.idUsuarioAprovador !== null ? Number(em.idUsuarioAprovador) : null,
        permissaoAprovador: em.permissaoAprovador ? String(em.permissaoAprovador) : null,
        solicitanteUserId: args.userId,
        scope,
      });
      const unique = Array.from(new Set(aprovadores)).filter((n) => n !== args.userId);
      if (!unique.length) throw new ApiError(422, `Etapa sem aprovadores elegíveis: ${String(em.nome)}`);

      for (const uid of unique) {
        await conn.execute(
          `
          INSERT INTO aprovacoes_solicitacoes_etapas_aprovadores
            (id_aprovacao_solicitacao_etapa, tenant_id, id_usuario_aprovador, status_aprovador)
          VALUES (?, ?, ?, 'PENDENTE')
          `,
          [etapaId, args.tenantId, uid]
        );
      }

      if (!firstEtapaId) {
        firstEtapaId = etapaId;
        firstEtapaVencimento = vencimentoEm ? toIso(vencimentoEm) : null;
        firstResponsavel = unique[0] ?? null;
      }
    }

    if (!firstEtapaId) throw new ApiError(422, 'Nenhuma etapa aplicável após regras de alçada.');

    await conn.execute(
      `
      UPDATE aprovacoes_solicitacoes
      SET status_solicitacao = 'EM_ANALISE',
          id_usuario_responsavel_atual = ?,
          enviada_em = COALESCE(enviada_em, ?),
          vencimento_atual_em = ?,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
      `,
      [firstResponsavel, nowIso(), firstEtapaVencimento ? new Date(firstEtapaVencimento) : null, args.tenantId, args.solicitacaoId]
    );

    await conn.execute(
      `
      UPDATE aprovacoes_solicitacoes_etapas
      SET status_etapa = 'EM_ANALISE'
      WHERE id_aprovacao_solicitacao_etapa = ?
      `,
      [firstEtapaId]
    );

    await addHistorico(conn, {
      tenantId: args.tenantId,
      solicitacaoId: args.solicitacaoId,
      statusAnterior: statusAtual,
      statusNovo: 'EM_ANALISE',
      descricao: 'Solicitação enviada para aprovação.',
      userId: args.userId,
      metadata: {
        exigeAssinaturaAprovador: Boolean(modelo.exigeAssinaturaAprovador),
        permiteDevolucao: Boolean(modelo.permiteDevolucao),
        permiteReenvio: Boolean(modelo.permiteReenvio),
      },
    });

    const [aprovRows]: any = await conn.query(
      `
      SELECT DISTINCT a.id_usuario_aprovador AS id
      FROM aprovacoes_solicitacoes_etapas_aprovadores a
      INNER JOIN aprovacoes_solicitacoes_etapas e ON e.id_aprovacao_solicitacao_etapa = a.id_aprovacao_solicitacao_etapa
      WHERE a.tenant_id = ? AND e.id_aprovacao_solicitacao = ?
      `,
      [args.tenantId, args.solicitacaoId]
    );

    const [[sol2]]: any = await conn.query(
      `SELECT titulo_solicitacao AS titulo FROM aprovacoes_solicitacoes WHERE tenant_id = ? AND id_aprovacao_solicitacao = ? LIMIT 1`,
      [args.tenantId, args.solicitacaoId]
    );
    const tituloSol = sol2?.titulo ? String(sol2.titulo) : 'Solicitação';
    const rota = handler.rotaDetalhe ? handler.rotaDetalhe(Number(sol.entidadeId)) : '/dashboard/aprovacoes';

    await conn.commit();

    for (const r of aprovRows as any[]) {
      const uid = Number(r.id);
      if (!uid) continue;
      await notifyUser({
        tenantId: args.tenantId,
        userId: uid,
        signal: {
          module: 'ADMIN',
          key: 'APROVACAO_PENDENTE',
          dedupeKey: `aprovacao.pendente.${args.solicitacaoId}.u${uid}`,
          severity: 'WARNING',
          titulo: 'Aprovação pendente',
          mensagem: tituloSol,
          rota,
          entidadeTipo: 'APROVACAO_SOLICITACAO',
          entidadeId: args.solicitacaoId,
          referenciaData: nowIso(),
          expiresAt: null,
          metadata: { solicitacaoId: args.solicitacaoId },
        },
      });
    }

    if (firstResponsavel) await publishMenuRefreshForUser(args.tenantId, firstResponsavel);

    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function loadSolicitacaoBase(conn: any, args: { tenantId: number; solicitacaoId: number }) {
  const [[sol]]: any = await conn.query(
    `
    SELECT
      s.id_aprovacao_solicitacao AS id,
      s.id_aprovacao_modelo AS idModelo,
      s.entidade_tipo AS entidadeTipo,
      s.entidade_id AS entidadeId,
      s.titulo_solicitacao AS titulo,
      s.status_solicitacao AS status,
      s.valor_referencia AS valorReferencia,
      s.id_usuario_solicitante AS idUsuarioSolicitante,
      s.metadata_json AS metadataJson
    FROM aprovacoes_solicitacoes s
    WHERE s.tenant_id = ? AND s.id_aprovacao_solicitacao = ?
    LIMIT 1
    `,
    [args.tenantId, args.solicitacaoId]
  );
  if (!sol) throw new ApiError(404, 'Solicitação não encontrada.');
  return sol;
}

async function loadCurrentEtapa(conn: any, args: { solicitacaoId: number }) {
  const [[row]]: any = await conn.query(
    `
    SELECT
      id_aprovacao_solicitacao_etapa AS id,
      id_aprovacao_modelo_etapa AS idModeloEtapa,
      ordem_etapa AS ordem,
      nome_etapa AS nome,
      status_etapa AS status,
      tipo_aprovador AS tipoAprovador,
      exige_todos AS exigeTodos,
      quantidade_minima_aprovacoes AS quantidadeMinimaAprovacoes,
      aprovacoes_realizadas AS aprovacoesRealizadas
    FROM aprovacoes_solicitacoes_etapas
    WHERE id_aprovacao_solicitacao = ?
      AND status_etapa IN ('PENDENTE','EM_ANALISE')
    ORDER BY ordem_etapa ASC
    LIMIT 1
    `,
    [args.solicitacaoId]
  );
  return row ?? null;
}

async function etapaApproveThresholdMet(conn: any, args: { etapaId: number; exigeTodos: boolean; quantidadeMinimaAprovacoes: number | null }) {
  const [rows]: any = await conn.query(
    `
    SELECT status_aprovador AS status, COUNT(*) AS total
    FROM aprovacoes_solicitacoes_etapas_aprovadores
    WHERE id_aprovacao_solicitacao_etapa = ?
    GROUP BY status_aprovador
    `,
    [args.etapaId]
  );
  const totals = new Map<string, number>();
  for (const r of rows as any[]) totals.set(String(r.status), Number(r.total || 0));
  const totalAprovadores = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  const aprovou = totals.get('APROVOU') || 0;

  if (args.exigeTodos) return totalAprovadores > 0 && aprovou >= totalAprovadores;
  if (args.quantidadeMinimaAprovacoes !== null) return aprovou >= Number(args.quantidadeMinimaAprovacoes);
  return aprovou >= 1;
}

export async function decidirSolicitacaoAprovacao(args: {
  tenantId: number;
  solicitacaoId: number;
  userId: number;
  acao: 'APROVAR' | 'REJEITAR' | 'DEVOLVER';
  parecer?: string | null;
  assinatura?: AssinaturaInputDTO | null;
  reqIp?: string | null;
  userAgent?: string | null;
}) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const sol = await loadSolicitacaoBase(conn, { tenantId: args.tenantId, solicitacaoId: args.solicitacaoId });
    const statusSol = String(sol.status || '');
    if (!['PENDENTE', 'EM_ANALISE'].includes(statusSol)) throw new ApiError(422, 'Solicitação não pode receber decisão neste status.');

    const handler = getApprovalHandler(String(sol.entidadeTipo));
    if (!handler) throw new ApiError(422, `Entidade não suportada para aprovação: ${String(sol.entidadeTipo)}`);

    const [[modelo]]: any = await conn.query(
      `
      SELECT
        exige_assinatura_aprovador AS exigeAssinaturaAprovador,
        permite_devolucao AS permiteDevolucao
      FROM aprovacoes_modelos
      WHERE tenant_id = ? AND id_aprovacao_modelo = ?
      LIMIT 1
      `,
      [args.tenantId, Number(sol.idModelo)]
    );
    if (!modelo) throw new ApiError(422, 'Modelo de aprovação não encontrado.');

    const etapa = await loadCurrentEtapa(conn, { solicitacaoId: args.solicitacaoId });
    if (!etapa) throw new ApiError(422, 'Solicitação sem etapa ativa.');

    const [[ap]]: any = await conn.query(
      `
      SELECT id_aprovacao_etapa_aprovador AS id, status_aprovador AS status
      FROM aprovacoes_solicitacoes_etapas_aprovadores
      WHERE tenant_id = ? AND id_aprovacao_solicitacao_etapa = ? AND id_usuario_aprovador = ?
      LIMIT 1
      `,
      [args.tenantId, Number(etapa.id), args.userId]
    );
    if (!ap) throw new ApiError(403, 'Você não é aprovador desta etapa.');
    if (String(ap.status) !== 'PENDENTE') throw new ApiError(422, 'Você já decidiu esta etapa.');

    const [[etapaModelo]]: any = await conn.query(
      `
      SELECT
        parecer_obrigatorio_aprovar AS parecerObrigatorioAprovar,
        parecer_obrigatorio_rejeitar AS parecerObrigatorioRejeitar
      FROM aprovacoes_modelos_etapas
      WHERE id_aprovacao_modelo_etapa = ?
      LIMIT 1
      `,
      [Number(etapa.idModeloEtapa)]
    );

    const parecer = args.parecer ? String(args.parecer).trim() : '';
    if (args.acao === 'APROVAR' && Boolean(etapaModelo?.parecerObrigatorioAprovar) && !parecer) throw new ApiError(422, 'Parecer obrigatório para aprovar.');
    if ((args.acao === 'REJEITAR' || args.acao === 'DEVOLVER') && Boolean(etapaModelo?.parecerObrigatorioRejeitar) && !parecer)
      throw new ApiError(422, 'Parecer obrigatório para rejeitar/devolver.');
    if (args.acao === 'DEVOLVER' && !Boolean(modelo.permiteDevolucao)) throw new ApiError(422, 'Modelo não permite devolução.');

    let idAssinaturaRegistro: number | null = null;
    if (Boolean(modelo.exigeAssinaturaAprovador)) {
      if (!args.assinatura) throw new ApiError(422, 'Assinatura obrigatória para decidir.');
    }

    const [resDec]: any = await conn.execute(
      `
      INSERT INTO aprovacoes_decisoes
        (tenant_id, id_aprovacao_solicitacao, id_aprovacao_solicitacao_etapa, id_usuario_decisor, decisao, parecer, id_assinatura_registro, ip_origem, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [
        args.tenantId,
        args.solicitacaoId,
        Number(etapa.id),
        args.userId,
        args.acao,
        parecer || null,
        args.reqIp ?? null,
        args.userAgent ?? null,
      ]
    );
    const decisaoId = Number(resDec.insertId);

    if (Boolean(modelo.exigeAssinaturaAprovador) && args.assinatura) {
      idAssinaturaRegistro = await createSignatureForUserDecision({
        conn,
        tenantId: args.tenantId,
        userId: args.userId,
        assinatura: args.assinatura,
        decisaoId,
        reqIp: args.reqIp,
        userAgent: args.userAgent,
      });
      await conn.execute(`UPDATE aprovacoes_decisoes SET id_assinatura_registro = ? WHERE tenant_id = ? AND id_aprovacao_decisao = ?`, [
        idAssinaturaRegistro,
        args.tenantId,
        decisaoId,
      ]);
    }

    await conn.execute(
      `
      UPDATE aprovacoes_solicitacoes_etapas_aprovadores
      SET status_aprovador = ?, decidido_em = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_aprovacao_etapa_aprovador = ?
      `,
      [args.acao === 'APROVAR' ? 'APROVOU' : args.acao === 'REJEITAR' ? 'REJEITOU' : 'DEVOLVEU', nowIso(), args.tenantId, Number(ap.id)]
    );

    if (args.acao === 'REJEITAR') {
      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes_etapas
        SET status_etapa = 'REJEITADA', rejeitada_em = ?, concluida_em = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id_aprovacao_solicitacao_etapa = ?
        `,
        [nowIso(), nowIso(), Number(etapa.id)]
      );

      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes_etapas_aprovadores
        SET status_aprovador = 'IGNORADO', atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_aprovacao_solicitacao_etapa = ? AND status_aprovador = 'PENDENTE'
        `,
        [args.tenantId, Number(etapa.id)]
      );

      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes_etapas
        SET status_etapa = 'PULADA', atualizado_em = CURRENT_TIMESTAMP
        WHERE id_aprovacao_solicitacao = ? AND status_etapa IN ('PENDENTE','EM_ANALISE') AND id_aprovacao_solicitacao_etapa <> ?
        `,
        [args.solicitacaoId, Number(etapa.id)]
      );

      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes
        SET status_solicitacao = 'REJEITADA', concluida_em = ?, id_usuario_responsavel_atual = NULL, vencimento_atual_em = NULL, atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
        `,
        [nowIso(), args.tenantId, args.solicitacaoId]
      );

      await addHistorico(conn, {
        tenantId: args.tenantId,
        solicitacaoId: args.solicitacaoId,
        statusAnterior: statusSol,
        statusNovo: 'REJEITADA',
        descricao: `Rejeitada na etapa: ${String(etapa.nome)}`,
        userId: args.userId,
      });

      if (handler.aplicarRejeicaoFinal) await handler.aplicarRejeicaoFinal(args.tenantId, Number(sol.entidadeId), args.solicitacaoId);

      await conn.commit();

      await notifyUser({
        tenantId: args.tenantId,
        userId: Number(sol.idUsuarioSolicitante),
        signal: {
          module: 'ADMIN',
          key: 'APROVACAO_REJEITADA',
          dedupeKey: `aprovacao.rejeitada.${args.solicitacaoId}`,
          severity: 'DANGER',
          titulo: 'Solicitação rejeitada',
          mensagem: String(sol.titulo || 'Solicitação'),
          rota: handler.rotaDetalhe ? handler.rotaDetalhe(Number(sol.entidadeId)) : '/dashboard/aprovacoes',
          entidadeTipo: 'APROVACAO_SOLICITACAO',
          entidadeId: args.solicitacaoId,
          referenciaData: nowIso(),
          expiresAt: null,
          metadata: { solicitacaoId: args.solicitacaoId, etapa: String(etapa.nome) },
        },
      });
      await publishMenuRefreshForUser(args.tenantId, Number(sol.idUsuarioSolicitante));
      return { status: 'ok' };
    }

    if (args.acao === 'DEVOLVER') {
      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes_etapas
        SET status_etapa = 'DEVOLVIDA', concluida_em = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id_aprovacao_solicitacao_etapa = ?
        `,
        [nowIso(), Number(etapa.id)]
      );

      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes_etapas_aprovadores
        SET status_aprovador = 'IGNORADO', atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_aprovacao_solicitacao_etapa = ? AND status_aprovador = 'PENDENTE'
        `,
        [args.tenantId, Number(etapa.id)]
      );

      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes_etapas
        SET status_etapa = 'PULADA', atualizado_em = CURRENT_TIMESTAMP
        WHERE id_aprovacao_solicitacao = ? AND status_etapa IN ('PENDENTE','EM_ANALISE') AND id_aprovacao_solicitacao_etapa <> ?
        `,
        [args.solicitacaoId, Number(etapa.id)]
      );

      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes
        SET status_solicitacao = 'DEVOLVIDA',
            id_usuario_responsavel_atual = ?,
            vencimento_atual_em = NULL,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
        `,
        [Number(sol.idUsuarioSolicitante), args.tenantId, args.solicitacaoId]
      );

      await addHistorico(conn, {
        tenantId: args.tenantId,
        solicitacaoId: args.solicitacaoId,
        statusAnterior: statusSol,
        statusNovo: 'DEVOLVIDA',
        descricao: `Devolvida na etapa: ${String(etapa.nome)}`,
        userId: args.userId,
      });

      await conn.commit();

      await notifyUser({
        tenantId: args.tenantId,
        userId: Number(sol.idUsuarioSolicitante),
        signal: {
          module: 'ADMIN',
          key: 'APROVACAO_DEVOLVIDA',
          dedupeKey: `aprovacao.devolvida.${args.solicitacaoId}`,
          severity: 'WARNING',
          titulo: 'Solicitação devolvida',
          mensagem: String(sol.titulo || 'Solicitação'),
          rota: handler.rotaDetalhe ? handler.rotaDetalhe(Number(sol.entidadeId)) : '/dashboard/aprovacoes',
          entidadeTipo: 'APROVACAO_SOLICITACAO',
          entidadeId: args.solicitacaoId,
          referenciaData: nowIso(),
          expiresAt: null,
          metadata: { solicitacaoId: args.solicitacaoId, etapa: String(etapa.nome) },
        },
      });
      await publishMenuRefreshForUser(args.tenantId, Number(sol.idUsuarioSolicitante));
      return { status: 'ok' };
    }

    const okEtapa = await etapaApproveThresholdMet(conn, {
      etapaId: Number(etapa.id),
      exigeTodos: Boolean(etapa.exigeTodos),
      quantidadeMinimaAprovacoes: etapa.quantidadeMinimaAprovacoes !== null ? Number(etapa.quantidadeMinimaAprovacoes) : null,
    });

    if (!okEtapa) {
      await conn.execute(
        `UPDATE aprovacoes_solicitacoes_etapas SET status_etapa = 'EM_ANALISE', atualizado_em = CURRENT_TIMESTAMP WHERE id_aprovacao_solicitacao_etapa = ?`,
        [Number(etapa.id)]
      );
      await conn.commit();
      return { status: 'ok' };
    }

    await conn.execute(
      `
      UPDATE aprovacoes_solicitacoes_etapas
      SET status_etapa = 'APROVADA', concluida_em = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id_aprovacao_solicitacao_etapa = ?
      `,
      [nowIso(), Number(etapa.id)]
    );

    const [[next]]: any = await conn.query(
      `
      SELECT id_aprovacao_solicitacao_etapa AS id, nome_etapa AS nome, vencimento_em AS vencimentoEm
      FROM aprovacoes_solicitacoes_etapas
      WHERE id_aprovacao_solicitacao = ?
        AND status_etapa = 'PENDENTE'
      ORDER BY ordem_etapa ASC
      LIMIT 1
      `,
      [args.solicitacaoId]
    );

    if (!next) {
      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes
        SET status_solicitacao = 'APROVADA', concluida_em = ?, id_usuario_responsavel_atual = NULL, vencimento_atual_em = NULL, atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
        `,
        [nowIso(), args.tenantId, args.solicitacaoId]
      );

      await addHistorico(conn, {
        tenantId: args.tenantId,
        solicitacaoId: args.solicitacaoId,
        statusAnterior: statusSol,
        statusNovo: 'APROVADA',
        descricao: `Aprovada na etapa final: ${String(etapa.nome)}`,
        userId: args.userId,
      });

      await handler.aplicarAprovacaoFinal(args.tenantId, Number(sol.entidadeId), args.solicitacaoId);
      await conn.commit();

      await notifyUser({
        tenantId: args.tenantId,
        userId: Number(sol.idUsuarioSolicitante),
        signal: {
          module: 'ADMIN',
          key: 'APROVACAO_APROVADA',
          dedupeKey: `aprovacao.aprovada.${args.solicitacaoId}`,
          severity: 'INFO',
          titulo: 'Solicitação aprovada',
          mensagem: String(sol.titulo || 'Solicitação'),
          rota: handler.rotaDetalhe ? handler.rotaDetalhe(Number(sol.entidadeId)) : '/dashboard/aprovacoes',
          entidadeTipo: 'APROVACAO_SOLICITACAO',
          entidadeId: args.solicitacaoId,
          referenciaData: nowIso(),
          expiresAt: null,
          metadata: { solicitacaoId: args.solicitacaoId },
        },
      });
      await publishMenuRefreshForUser(args.tenantId, Number(sol.idUsuarioSolicitante));
      return { status: 'ok' };
    }

    await conn.execute(
      `UPDATE aprovacoes_solicitacoes_etapas SET status_etapa = 'EM_ANALISE', atualizado_em = CURRENT_TIMESTAMP WHERE id_aprovacao_solicitacao_etapa = ?`,
      [Number(next.id)]
    );

    const [aprovNext]: any = await conn.query(
      `
      SELECT a.id_usuario_aprovador AS id
      FROM aprovacoes_solicitacoes_etapas_aprovadores a
      WHERE a.tenant_id = ? AND a.id_aprovacao_solicitacao_etapa = ? AND a.status_aprovador = 'PENDENTE'
      ORDER BY a.id_usuario_aprovador ASC
      `,
      [args.tenantId, Number(next.id)]
    );
    const nextResponsavel = (aprovNext as any[]).length ? Number((aprovNext as any[])[0].id) : null;

    await conn.execute(
      `
      UPDATE aprovacoes_solicitacoes
      SET status_solicitacao = 'EM_ANALISE',
          id_usuario_responsavel_atual = ?,
          vencimento_atual_em = ?,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
      `,
      [nextResponsavel, next.vencimentoEm ? new Date(next.vencimentoEm) : null, args.tenantId, args.solicitacaoId]
    );

    await addHistorico(conn, {
      tenantId: args.tenantId,
      solicitacaoId: args.solicitacaoId,
      statusAnterior: statusSol,
      statusNovo: 'EM_ANALISE',
      descricao: `Etapa aprovada: ${String(etapa.nome)} → próxima: ${String(next.nome)}`,
      userId: args.userId,
    });

    await conn.commit();

    const rota = handler.rotaDetalhe ? handler.rotaDetalhe(Number(sol.entidadeId)) : '/dashboard/aprovacoes';
    for (const r of aprovNext as any[]) {
      const uid = Number(r.id);
      if (!uid) continue;
      await notifyUser({
        tenantId: args.tenantId,
        userId: uid,
        signal: {
          module: 'ADMIN',
          key: 'APROVACAO_PENDENTE',
          dedupeKey: `aprovacao.pendente.${args.solicitacaoId}.u${uid}`,
          severity: 'WARNING',
          titulo: 'Aprovação pendente',
          mensagem: String(sol.titulo || 'Solicitação'),
          rota,
          entidadeTipo: 'APROVACAO_SOLICITACAO',
          entidadeId: args.solicitacaoId,
          referenciaData: nowIso(),
          expiresAt: null,
          metadata: { solicitacaoId: args.solicitacaoId },
        },
      });
    }

    await notifyUser({
      tenantId: args.tenantId,
      userId: Number(sol.idUsuarioSolicitante),
      signal: {
        module: 'ADMIN',
        key: 'APROVACAO_ETAPA_AVANCOU',
        dedupeKey: `aprovacao.avancou.${args.solicitacaoId}.${String(next.nome)}`,
        severity: 'INFO',
        titulo: 'Solicitação avançou de etapa',
        mensagem: String(sol.titulo || 'Solicitação'),
        rota,
        entidadeTipo: 'APROVACAO_SOLICITACAO',
        entidadeId: args.solicitacaoId,
        referenciaData: nowIso(),
        expiresAt: null,
        metadata: { solicitacaoId: args.solicitacaoId, etapa: String(next.nome) },
      },
    });

    if (nextResponsavel) await publishMenuRefreshForUser(args.tenantId, nextResponsavel);
    await publishMenuRefreshForUser(args.tenantId, Number(sol.idUsuarioSolicitante));
    return { status: 'ok' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function listarMinhasPendenciasAprovacao(tenantId: number, userId: number): Promise<MinhaAprovacaoPendenteDTO[]> {
  const [rows]: any = await db.query(
    `
    SELECT
      s.id_aprovacao_solicitacao AS idSolicitacao,
      s.entidade_tipo AS entidadeTipo,
      s.entidade_id AS entidadeId,
      s.titulo_solicitacao AS tituloSolicitacao,
      e.nome_etapa AS etapaNome,
      e.vencimento_em AS vencimentoEm
    FROM aprovacoes_solicitacoes_etapas_aprovadores a
    INNER JOIN aprovacoes_solicitacoes_etapas e ON e.id_aprovacao_solicitacao_etapa = a.id_aprovacao_solicitacao_etapa
    INNER JOIN aprovacoes_solicitacoes s ON s.id_aprovacao_solicitacao = e.id_aprovacao_solicitacao
    WHERE a.tenant_id = ?
      AND a.id_usuario_aprovador = ?
      AND a.status_aprovador = 'PENDENTE'
      AND s.status_solicitacao IN ('PENDENTE','EM_ANALISE')
    ORDER BY e.vencimento_em IS NULL, e.vencimento_em ASC, s.id_aprovacao_solicitacao DESC
    LIMIT 200
    `,
    [tenantId, userId]
  );

  return (rows as any[]).map((r) => {
    const handler = getApprovalHandler(String(r.entidadeTipo));
    const rota = handler?.rotaDetalhe ? handler.rotaDetalhe(Number(r.entidadeId)) : null;
    const vencIso = toIso(r.vencimentoEm);
    const prioridade: MinhaAprovacaoPendenteDTO['prioridade'] = vencIso && new Date(vencIso).getTime() < Date.now() ? 'CRITICA' : 'MEDIA';
    return {
      idSolicitacao: Number(r.idSolicitacao),
      entidadeTipo: String(r.entidadeTipo),
      entidadeId: Number(r.entidadeId),
      tituloSolicitacao: String(r.tituloSolicitacao),
      etapaNome: String(r.etapaNome),
      vencimentoEm: vencIso,
      rota,
      prioridade,
    };
  });
}

export async function listarSolicitacoes(tenantId: number, args: { userId?: number | null; status?: string | null; limit?: number | null }) {
  const where: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];
  if (args.userId) {
    where.push('id_usuario_solicitante = ?');
    params.push(args.userId);
  }
  if (args.status) {
    where.push('status_solicitacao = ?');
    params.push(String(args.status));
  }
  const limit = Math.min(200, Math.max(1, Number(args.limit || 50)));

  const [rows]: any = await db.query(
    `
    SELECT
      id_aprovacao_solicitacao AS id,
      id_aprovacao_modelo AS idModelo,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      titulo_solicitacao AS tituloSolicitacao,
      descricao_solicitacao AS descricaoSolicitacao,
      status_solicitacao AS status,
      valor_referencia AS valorReferencia,
      id_usuario_solicitante AS idUsuarioSolicitante,
      id_usuario_responsavel_atual AS idUsuarioResponsavelAtual,
      enviada_em AS enviadaEm,
      concluida_em AS concluidaEm,
      vencimento_atual_em AS vencimentoAtualEm,
      criado_em AS criadoEm,
      atualizado_em AS atualizadoEm
    FROM aprovacoes_solicitacoes
    WHERE ${where.join(' AND ')}
    ORDER BY id_aprovacao_solicitacao DESC
    LIMIT ?
    `,
    [...params, limit]
  );

  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    idModelo: Number(r.idModelo),
    entidadeTipo: String(r.entidadeTipo),
    entidadeId: Number(r.entidadeId),
    tituloSolicitacao: String(r.tituloSolicitacao),
    descricaoSolicitacao: r.descricaoSolicitacao ? String(r.descricaoSolicitacao) : null,
    status: String(r.status) as any,
    valorReferencia: r.valorReferencia !== null ? Number(r.valorReferencia) : null,
    idUsuarioSolicitante: Number(r.idUsuarioSolicitante),
    idUsuarioResponsavelAtual: r.idUsuarioResponsavelAtual !== null ? Number(r.idUsuarioResponsavelAtual) : null,
    enviadaEm: toIso(r.enviadaEm),
    concluidaEm: toIso(r.concluidaEm),
    vencimentoAtualEm: toIso(r.vencimentoAtualEm),
    criadoEm: toIso(r.criadoEm) || nowIso(),
    atualizadoEm: toIso(r.atualizadoEm) || nowIso(),
  })) satisfies AprovacaoSolicitacaoDTO[];
}

export async function obterSolicitacaoDetalhe(tenantId: number, solicitacaoId: number): Promise<AprovacaoSolicitacaoDetalheDTO> {
  const [[s]]: any = await db.query(
    `
    SELECT
      id_aprovacao_solicitacao AS id,
      id_aprovacao_modelo AS idModelo,
      entidade_tipo AS entidadeTipo,
      entidade_id AS entidadeId,
      titulo_solicitacao AS tituloSolicitacao,
      descricao_solicitacao AS descricaoSolicitacao,
      status_solicitacao AS status,
      valor_referencia AS valorReferencia,
      id_usuario_solicitante AS idUsuarioSolicitante,
      id_usuario_responsavel_atual AS idUsuarioResponsavelAtual,
      enviada_em AS enviadaEm,
      concluida_em AS concluidaEm,
      vencimento_atual_em AS vencimentoAtualEm,
      criado_em AS criadoEm,
      atualizado_em AS atualizadoEm,
      snapshot_json AS snapshotJson
    FROM aprovacoes_solicitacoes
    WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
    LIMIT 1
    `,
    [tenantId, solicitacaoId]
  );
  if (!s) throw new ApiError(404, 'Solicitação não encontrada.');

  const [etapasRows]: any = await db.query(
    `
    SELECT
      id_aprovacao_solicitacao_etapa AS id,
      id_aprovacao_modelo_etapa AS idModeloEtapa,
      ordem_etapa AS ordem,
      nome_etapa AS nome,
      status_etapa AS status,
      tipo_aprovador AS tipoAprovador,
      exige_todos AS exigeTodos,
      quantidade_minima_aprovacoes AS quantidadeMinimaAprovacoes,
      aprovacoes_realizadas AS aprovacoesRealizadas,
      vencimento_em AS vencimentoEm,
      concluida_em AS concluidaEm
    FROM aprovacoes_solicitacoes_etapas
    WHERE id_aprovacao_solicitacao = ?
    ORDER BY ordem_etapa ASC
    `,
    [solicitacaoId]
  );

  const [aprovRows]: any = await db.query(
    `
    SELECT
      id_aprovacao_etapa_aprovador AS id,
      id_aprovacao_solicitacao_etapa AS idEtapa,
      id_usuario_aprovador AS idUsuarioAprovador,
      status_aprovador AS status,
      decidido_em AS decididoEm
    FROM aprovacoes_solicitacoes_etapas_aprovadores
    WHERE tenant_id = ? AND id_aprovacao_solicitacao_etapa IN (
      SELECT id_aprovacao_solicitacao_etapa FROM aprovacoes_solicitacoes_etapas WHERE id_aprovacao_solicitacao = ?
    )
    ORDER BY id_aprovacao_solicitacao_etapa ASC, id_usuario_aprovador ASC
    `,
    [tenantId, solicitacaoId]
  );

  const [decRows]: any = await db.query(
    `
    SELECT
      id_aprovacao_decisao AS id,
      decisao,
      parecer,
      id_usuario_decisor AS idUsuarioDecisor,
      id_assinatura_registro AS idAssinaturaRegistro,
      criado_em AS criadoEm
    FROM aprovacoes_decisoes
    WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
    ORDER BY id_aprovacao_decisao ASC
    `,
    [tenantId, solicitacaoId]
  );

  const [histRows]: any = await db.query(
    `
    SELECT
      id_aprovacao_historico AS id,
      status_anterior AS statusAnterior,
      status_novo AS statusNovo,
      descricao_evento AS descricaoEvento,
      id_usuario_evento AS idUsuarioEvento,
      criado_em AS criadoEm
    FROM aprovacoes_historico
    WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
    ORDER BY id_aprovacao_historico ASC
    `,
    [tenantId, solicitacaoId]
  );

  return {
    solicitacao: {
      id: Number(s.id),
      idModelo: Number(s.idModelo),
      entidadeTipo: String(s.entidadeTipo),
      entidadeId: Number(s.entidadeId),
      tituloSolicitacao: String(s.tituloSolicitacao),
      descricaoSolicitacao: s.descricaoSolicitacao ? String(s.descricaoSolicitacao) : null,
      status: String(s.status) as any,
      valorReferencia: s.valorReferencia !== null ? Number(s.valorReferencia) : null,
      idUsuarioSolicitante: Number(s.idUsuarioSolicitante),
      idUsuarioResponsavelAtual: s.idUsuarioResponsavelAtual !== null ? Number(s.idUsuarioResponsavelAtual) : null,
      enviadaEm: toIso(s.enviadaEm),
      concluidaEm: toIso(s.concluidaEm),
      vencimentoAtualEm: toIso(s.vencimentoAtualEm),
      criadoEm: toIso(s.criadoEm) || nowIso(),
      atualizadoEm: toIso(s.atualizadoEm) || nowIso(),
    },
    etapas: (etapasRows as any[]).map((r) => ({
      id: Number(r.id),
      idModeloEtapa: Number(r.idModeloEtapa),
      ordem: Number(r.ordem),
      nome: String(r.nome),
      status: String(r.status) as any,
      tipoAprovador: String(r.tipoAprovador) as any,
      exigeTodos: Boolean(r.exigeTodos),
      quantidadeMinimaAprovacoes: r.quantidadeMinimaAprovacoes !== null ? Number(r.quantidadeMinimaAprovacoes) : null,
      aprovacoesRealizadas: Number(r.aprovacoesRealizadas || 0),
      vencimentoEm: toIso(r.vencimentoEm),
      concluidaEm: toIso(r.concluidaEm),
    })) satisfies AprovacaoSolicitacaoEtapaDTO[],
    aprovadores: (aprovRows as any[]).map((r) => ({
      id: Number(r.id),
      idEtapa: Number(r.idEtapa),
      idUsuarioAprovador: Number(r.idUsuarioAprovador),
      status: String(r.status) as any,
      decididoEm: toIso(r.decididoEm),
    })),
    decisoes: (decRows as any[]).map((r) => ({
      id: Number(r.id),
      decisao: String(r.decisao) as any,
      parecer: r.parecer ? String(r.parecer) : null,
      idUsuarioDecisor: Number(r.idUsuarioDecisor),
      idAssinaturaRegistro: r.idAssinaturaRegistro !== null ? Number(r.idAssinaturaRegistro) : null,
      criadoEm: toIso(r.criadoEm) || nowIso(),
    })) satisfies AprovacaoDecisaoDTO[],
    historico: (histRows as any[]).map((r) => ({
      id: Number(r.id),
      statusAnterior: r.statusAnterior ? String(r.statusAnterior) : null,
      statusNovo: String(r.statusNovo),
      descricaoEvento: String(r.descricaoEvento),
      idUsuarioEvento: r.idUsuarioEvento !== null ? Number(r.idUsuarioEvento) : null,
      criadoEm: toIso(r.criadoEm) || nowIso(),
    })) satisfies AprovacaoHistoricoDTO[],
    snapshot: parseJsonMaybe(s.snapshotJson),
  };
}

export async function habilitarPinAssinaturaUsuario(args: { tenantId: number; userId: number; pin: string }) {
  const pin = String(args.pin || '').trim();
  if (pin.length < 4) throw new ApiError(422, 'PIN inválido.');
  const hash = await bcrypt.hash(pin, 10);
  await db.execute(
    `
    INSERT INTO usuarios_assinatura_habilitacoes
      (tenant_id, id_usuario, tipo_assinatura, pin_hash, ativo)
    VALUES (?, ?, 'PIN', ?, 1)
    ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), ativo = 1, atualizado_em = CURRENT_TIMESTAMP
    `,
    [args.tenantId, args.userId, hash]
  );
}

export async function expirarSolicitacoesPendentes(args: { tenantId: number }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows]: any = await conn.query(
      `
      SELECT id_aprovacao_solicitacao AS id, status_solicitacao AS status
      FROM aprovacoes_solicitacoes
      WHERE tenant_id = ?
        AND status_solicitacao IN ('PENDENTE','EM_ANALISE')
        AND vencimento_atual_em IS NOT NULL
        AND vencimento_atual_em < NOW()
      ORDER BY vencimento_atual_em ASC
      LIMIT 200
      `,
      [args.tenantId]
    );

    let expiradas = 0;
    for (const r of rows as any[]) {
      const solicitacaoId = Number(r.id);
      if (!solicitacaoId) continue;
      const statusAnterior = r.status ? String(r.status) : null;

      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes
        SET status_solicitacao = 'EXPIRADA', concluida_em = ?, id_usuario_responsavel_atual = NULL, atualizado_em = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
        `,
        [nowIso(), args.tenantId, solicitacaoId]
      );
      await conn.execute(
        `
        UPDATE aprovacoes_solicitacoes_etapas
        SET status_etapa = 'EXPIRADA', atualizado_em = CURRENT_TIMESTAMP
        WHERE id_aprovacao_solicitacao = ? AND status_etapa IN ('PENDENTE','EM_ANALISE')
        `,
        [solicitacaoId]
      );
      await addHistorico(conn, {
        tenantId: args.tenantId,
        solicitacaoId,
        statusAnterior,
        statusNovo: 'EXPIRADA',
        descricao: 'Solicitação expirada por vencimento.',
        userId: null,
      });
      expiradas++;
    }

    await conn.commit();
    return { expiradas };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

