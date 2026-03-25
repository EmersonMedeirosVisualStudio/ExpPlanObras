import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type { PolicyAction, PolicyConditionNode, PolicyDTO, PolicyEffect, PolicyResource } from './types';

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes('seguranca_politicas') || msg.includes('seguranca_recursos_indice') || msg.includes('seguranca_decisoes_auditoria') || msg.includes("doesn't exist") || msg.includes('unknown')) {
    throw new ApiError(501, 'Banco sem tabelas do motor de políticas (RBAC/ABAC). Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

function iso(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseJson(v: any) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

export async function listarPoliticas(tenantId: number): Promise<Array<Pick<PolicyDTO, 'id' | 'nomePolitica' | 'recurso' | 'acao' | 'ativo' | 'prioridadeBase' | 'criadoEm' | 'atualizadoEm'>>> {
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_seguranca_politica AS id,
        nome_politica AS nomePolitica,
        recurso,
        acao,
        ativo,
        prioridade_base AS prioridadeBase,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM seguranca_politicas
      WHERE tenant_id = ?
      ORDER BY ativo DESC, prioridade_base DESC, id_seguranca_politica DESC
      LIMIT 500
      `,
      [tenantId]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      nomePolitica: String(r.nomePolitica),
      recurso: String(r.recurso) as any,
      acao: String(r.acao) as any,
      ativo: Boolean(r.ativo),
      prioridadeBase: Number(r.prioridadeBase || 0),
      criadoEm: iso(r.criadoEm) || new Date().toISOString(),
      atualizadoEm: iso(r.atualizadoEm) || new Date().toISOString(),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function obterPolitica(tenantId: number, id: number): Promise<PolicyDTO> {
  try {
    const [[p]]: any = await db.query(
      `
      SELECT
        id_seguranca_politica AS id,
        tenant_id AS tenantId,
        nome_politica AS nomePolitica,
        recurso,
        acao,
        descricao_politica AS descricaoPolitica,
        ativo,
        prioridade_base AS prioridadeBase,
        criado_por_usuario AS criadoPorUsuario,
        atualizado_por_usuario AS atualizadoPorUsuario,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM seguranca_politicas
      WHERE tenant_id = ? AND id_seguranca_politica = ?
      LIMIT 1
      `,
      [tenantId, id]
    );
    if (!p) throw new ApiError(404, 'Política não encontrada.');

    const [rules]: any = await db.query(
      `
      SELECT
        id_seguranca_politica_regra AS id,
        id_seguranca_politica AS policyId,
        nome_regra AS nomeRegra,
        efeito,
        prioridade,
        condicao_json AS condicaoJson,
        sql_hint_json AS sqlHintJson,
        ativo
      FROM seguranca_politicas_regras
      WHERE id_seguranca_politica = ?
      ORDER BY prioridade DESC, id_seguranca_politica_regra ASC
      `,
      [id]
    );

    const [targets]: any = await db.query(
      `
      SELECT
        id_seguranca_politica_alvo AS id,
        id_seguranca_politica AS policyId,
        tipo_alvo AS tipoAlvo,
        id_usuario AS idUsuario,
        chave_perfil AS chavePerfil,
        chave_permissao AS chavePermissao,
        ativo
      FROM seguranca_politicas_alvos
      WHERE id_seguranca_politica = ?
      ORDER BY id_seguranca_politica_alvo ASC
      `,
      [id]
    );

    return {
      id: Number(p.id),
      tenantId: Number(p.tenantId),
      nomePolitica: String(p.nomePolitica),
      recurso: String(p.recurso) as any,
      acao: String(p.acao) as any,
      descricaoPolitica: p.descricaoPolitica ? String(p.descricaoPolitica) : null,
      ativo: Boolean(p.ativo),
      prioridadeBase: Number(p.prioridadeBase || 0),
      criadoPorUsuario: Number(p.criadoPorUsuario),
      atualizadoPorUsuario: Number(p.atualizadoPorUsuario),
      criadoEm: iso(p.criadoEm) || new Date().toISOString(),
      atualizadoEm: iso(p.atualizadoEm) || new Date().toISOString(),
      regras: (rules as any[]).map((r) => ({
        id: Number(r.id),
        policyId: Number(r.policyId),
        nomeRegra: String(r.nomeRegra),
        efeito: String(r.efeito) as PolicyEffect,
        prioridade: Number(r.prioridade || 0),
        condicao: (parseJson(r.condicaoJson) || { all: [] }) as PolicyConditionNode,
        sqlHint: parseJson(r.sqlHintJson),
        ativo: Boolean(r.ativo),
      })),
      alvos: (targets as any[]).map((t) => ({
        id: Number(t.id),
        policyId: Number(t.policyId),
        tipoAlvo: String(t.tipoAlvo) as any,
        idUsuario: t.idUsuario !== null && t.idUsuario !== undefined ? Number(t.idUsuario) : null,
        chavePerfil: t.chavePerfil ? String(t.chavePerfil) : null,
        chavePermissao: t.chavePermissao ? String(t.chavePermissao) : null,
        ativo: Boolean(t.ativo),
      })),
    };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function criarPolitica(
  tenantId: number,
  userId: number,
  body: {
    nomePolitica: string;
    recurso: PolicyResource;
    acao: PolicyAction;
    descricaoPolitica?: string | null;
    prioridadeBase?: number;
    regras?: Array<{ nomeRegra: string; efeito: PolicyEffect; prioridade: number; condicao: PolicyConditionNode; ativo?: boolean }>;
    alvos?: Array<{ tipoAlvo: 'TODOS' | 'USUARIO' | 'PERFIL' | 'PERMISSAO'; idUsuario?: number | null; chavePerfil?: string | null; chavePermissao?: string | null; ativo?: boolean }>;
  }
) {
  const nomePolitica = String(body.nomePolitica || '').trim();
  const recurso = String(body.recurso || '').trim().toUpperCase() as PolicyResource;
  const acao = String(body.acao || '').trim().toUpperCase() as PolicyAction;
  if (!nomePolitica) throw new ApiError(422, 'nomePolitica obrigatório');
  if (!recurso) throw new ApiError(422, 'recurso obrigatório');
  if (!acao) throw new ApiError(422, 'acao obrigatório');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [res]: any = await conn.query(
      `
      INSERT INTO seguranca_politicas
        (tenant_id, nome_politica, recurso, acao, descricao_politica, ativo, prioridade_base, criado_por_usuario, atualizado_por_usuario)
      VALUES
        (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `,
      [tenantId, nomePolitica.slice(0, 180), recurso, acao, body.descricaoPolitica ?? null, Number(body.prioridadeBase || 0), userId, userId]
    );
    const policyId = Number(res.insertId);

    const regras = Array.isArray(body.regras) ? body.regras : [];
    for (const r of regras) {
      await conn.query(
        `
        INSERT INTO seguranca_politicas_regras
          (id_seguranca_politica, nome_regra, efeito, prioridade, condicao_json, sql_hint_json, ativo)
        VALUES
          (?, ?, ?, ?, ?, NULL, ?)
        `,
        [policyId, String(r.nomeRegra || '').slice(0, 180), String(r.efeito || 'ALLOW').toUpperCase(), Number(r.prioridade || 0), JSON.stringify(r.condicao || { all: [] }), r.ativo === false ? 0 : 1]
      );
    }

    const alvos = Array.isArray(body.alvos) ? body.alvos : [{ tipoAlvo: 'TODOS' as const }];
    for (const t of alvos) {
      await conn.query(
        `
        INSERT INTO seguranca_politicas_alvos
          (id_seguranca_politica, tipo_alvo, id_usuario, chave_perfil, chave_permissao, ativo)
        VALUES
          (?, ?, ?, ?, ?, ?)
        `,
        [
          policyId,
          String(t.tipoAlvo || 'TODOS').toUpperCase(),
          t.idUsuario ?? null,
          t.chavePerfil ?? null,
          t.chavePermissao ?? null,
          t.ativo === false ? 0 : 1,
        ]
      );
    }

    await conn.commit();
    return { id: policyId };
  } catch (e) {
    await conn.rollback();
    return assertSqlReady(e) as any;
  } finally {
    conn.release();
  }
}

export async function atualizarPolitica(
  tenantId: number,
  userId: number,
  id: number,
  body: {
    nomePolitica?: string;
    descricaoPolitica?: string | null;
    prioridadeBase?: number;
    regras?: Array<{ nomeRegra: string; efeito: PolicyEffect; prioridade: number; condicao: PolicyConditionNode; ativo?: boolean }>;
    alvos?: Array<{ tipoAlvo: 'TODOS' | 'USUARIO' | 'PERFIL' | 'PERMISSAO'; idUsuario?: number | null; chavePerfil?: string | null; chavePermissao?: string | null; ativo?: boolean }>;
  }
) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[row]]: any = await conn.query(
      `SELECT id_seguranca_politica AS id FROM seguranca_politicas WHERE tenant_id = ? AND id_seguranca_politica = ? LIMIT 1 FOR UPDATE`,
      [tenantId, id]
    );
    if (!row) throw new ApiError(404, 'Política não encontrada.');

    await conn.query(
      `
      UPDATE seguranca_politicas
      SET nome_politica = COALESCE(?, nome_politica),
          descricao_politica = ?,
          prioridade_base = COALESCE(?, prioridade_base),
          atualizado_por_usuario = ?,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_seguranca_politica = ?
      `,
      [
        body.nomePolitica !== undefined ? String(body.nomePolitica).slice(0, 180) : null,
        body.descricaoPolitica ?? null,
        body.prioridadeBase !== undefined ? Number(body.prioridadeBase) : null,
        userId,
        tenantId,
        id,
      ]
    );

    if (Array.isArray(body.regras)) {
      await conn.query(`DELETE FROM seguranca_politicas_regras WHERE id_seguranca_politica = ?`, [id]);
      for (const r of body.regras) {
        await conn.query(
          `
          INSERT INTO seguranca_politicas_regras
            (id_seguranca_politica, nome_regra, efeito, prioridade, condicao_json, sql_hint_json, ativo)
          VALUES
            (?, ?, ?, ?, ?, NULL, ?)
          `,
          [id, String(r.nomeRegra || '').slice(0, 180), String(r.efeito || 'ALLOW').toUpperCase(), Number(r.prioridade || 0), JSON.stringify(r.condicao || { all: [] }), r.ativo === false ? 0 : 1]
        );
      }
    }

    if (Array.isArray(body.alvos)) {
      await conn.query(`DELETE FROM seguranca_politicas_alvos WHERE id_seguranca_politica = ?`, [id]);
      for (const t of body.alvos) {
        await conn.query(
          `
          INSERT INTO seguranca_politicas_alvos
            (id_seguranca_politica, tipo_alvo, id_usuario, chave_perfil, chave_permissao, ativo)
          VALUES
            (?, ?, ?, ?, ?, ?)
          `,
          [id, String(t.tipoAlvo || 'TODOS').toUpperCase(), t.idUsuario ?? null, t.chavePerfil ?? null, t.chavePermissao ?? null, t.ativo === false ? 0 : 1]
        );
      }
    }

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    return assertSqlReady(e) as any;
  } finally {
    conn.release();
  }
}

export async function setStatusPolitica(tenantId: number, userId: number, id: number, ativo: boolean) {
  try {
    const [res]: any = await db.query(
      `
      UPDATE seguranca_politicas
      SET ativo = ?, atualizado_por_usuario = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id_seguranca_politica = ?
      `,
      [ativo ? 1 : 0, userId, tenantId, id]
    );
    if (!Number(res.affectedRows || 0)) throw new ApiError(404, 'Política não encontrada.');
    return { ok: true };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarAuditoriaDecisoes(tenantId: number, args: { limit?: number } = {}) {
  const limit = Math.min(Math.max(Number(args.limit || 200), 1), 500);
  try {
    const [rows]: any = await db.query(
      `
      SELECT
        id_seguranca_decisao AS id,
        id_usuario AS userId,
        recurso,
        acao,
        entidade_id AS entityId,
        resultado,
        motivo_codigo AS motivoCodigo,
        id_politica AS policyId,
        id_regra AS ruleId,
        latencia_ms AS latenciaMs,
        criado_em AS criadoEm
      FROM seguranca_decisoes_auditoria
      WHERE tenant_id = ?
      ORDER BY id_seguranca_decisao DESC
      LIMIT ?
      `,
      [tenantId, limit]
    );
    return (rows as any[]).map((r) => ({
      id: Number(r.id),
      userId: Number(r.userId),
      recurso: String(r.recurso),
      acao: String(r.acao),
      entityId: r.entityId !== null && r.entityId !== undefined ? Number(r.entityId) : null,
      resultado: String(r.resultado),
      motivoCodigo: r.motivoCodigo ? String(r.motivoCodigo) : null,
      policyId: r.policyId !== null && r.policyId !== undefined ? Number(r.policyId) : null,
      ruleId: r.ruleId !== null && r.ruleId !== undefined ? Number(r.ruleId) : null,
      latenciaMs: r.latenciaMs !== null && r.latenciaMs !== undefined ? Number(r.latenciaMs) : null,
      criadoEm: iso(r.criadoEm) || new Date().toISOString(),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function listarPoliticasAtivasParaRecurso(tenantId: number, recurso: PolicyResource, acao: PolicyAction): Promise<PolicyDTO[]> {
  try {
    const [polRows]: any = await db.query(
      `
      SELECT
        id_seguranca_politica AS id,
        tenant_id AS tenantId,
        nome_politica AS nomePolitica,
        recurso,
        acao,
        descricao_politica AS descricaoPolitica,
        ativo,
        prioridade_base AS prioridadeBase,
        criado_por_usuario AS criadoPorUsuario,
        atualizado_por_usuario AS atualizadoPorUsuario,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM seguranca_politicas
      WHERE tenant_id = ? AND ativo = 1 AND recurso = ? AND acao = ?
      ORDER BY prioridade_base DESC, id_seguranca_politica DESC
      `,
      [tenantId, recurso, acao]
    );

    const ids = (polRows as any[]).map((p) => Number(p.id));
    if (!ids.length) return [];

    const inSql = ids.map(() => '?').join(',');
    const [rules]: any = await db.query(
      `
      SELECT
        id_seguranca_politica_regra AS id,
        id_seguranca_politica AS policyId,
        nome_regra AS nomeRegra,
        efeito,
        prioridade,
        condicao_json AS condicaoJson,
        sql_hint_json AS sqlHintJson,
        ativo
      FROM seguranca_politicas_regras
      WHERE id_seguranca_politica IN (${inSql}) AND ativo = 1
      ORDER BY prioridade DESC, id_seguranca_politica_regra ASC
      `,
      ids
    );

    const [targets]: any = await db.query(
      `
      SELECT
        id_seguranca_politica_alvo AS id,
        id_seguranca_politica AS policyId,
        tipo_alvo AS tipoAlvo,
        id_usuario AS idUsuario,
        chave_perfil AS chavePerfil,
        chave_permissao AS chavePermissao,
        ativo
      FROM seguranca_politicas_alvos
      WHERE id_seguranca_politica IN (${inSql}) AND ativo = 1
      ORDER BY id_seguranca_politica_alvo ASC
      `,
      ids
    );

    const rulesBy = new Map<number, any[]>();
    for (const r of rules as any[]) {
      const pid = Number(r.policyId);
      if (!rulesBy.has(pid)) rulesBy.set(pid, []);
      rulesBy.get(pid)!.push(r);
    }

    const targetsBy = new Map<number, any[]>();
    for (const t of targets as any[]) {
      const pid = Number(t.policyId);
      if (!targetsBy.has(pid)) targetsBy.set(pid, []);
      targetsBy.get(pid)!.push(t);
    }

    return (polRows as any[]).map((p) => ({
      id: Number(p.id),
      tenantId: Number(p.tenantId),
      nomePolitica: String(p.nomePolitica),
      recurso: String(p.recurso) as any,
      acao: String(p.acao) as any,
      descricaoPolitica: p.descricaoPolitica ? String(p.descricaoPolitica) : null,
      ativo: Boolean(p.ativo),
      prioridadeBase: Number(p.prioridadeBase || 0),
      criadoPorUsuario: Number(p.criadoPorUsuario),
      atualizadoPorUsuario: Number(p.atualizadoPorUsuario),
      criadoEm: iso(p.criadoEm) || new Date().toISOString(),
      atualizadoEm: iso(p.atualizadoEm) || new Date().toISOString(),
      regras: (rulesBy.get(Number(p.id)) || []).map((r) => ({
        id: Number(r.id),
        policyId: Number(r.policyId),
        nomeRegra: String(r.nomeRegra),
        efeito: String(r.efeito) as PolicyEffect,
        prioridade: Number(r.prioridade || 0),
        condicao: (parseJson(r.condicaoJson) || { all: [] }) as PolicyConditionNode,
        sqlHint: parseJson(r.sqlHintJson),
        ativo: Boolean(r.ativo),
      })),
      alvos: (targetsBy.get(Number(p.id)) || []).map((t) => ({
        id: Number(t.id),
        policyId: Number(t.policyId),
        tipoAlvo: String(t.tipoAlvo) as any,
        idUsuario: t.idUsuario !== null && t.idUsuario !== undefined ? Number(t.idUsuario) : null,
        chavePerfil: t.chavePerfil ? String(t.chavePerfil) : null,
        chavePermissao: t.chavePermissao ? String(t.chavePermissao) : null,
        ativo: Boolean(t.ativo),
      })),
    }));
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

