import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canAccessObra } from '@/lib/auth/access';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureCronogramaTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS contratos_aditivos (
      id_aditivo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_contrato BIGINT UNSIGNED NOT NULL,
      numero_aditivo VARCHAR(64) NULL,
      tipo_aditivo ENUM('CRONOGRAMA','PRAZO','VALOR','OUTRO') NOT NULL DEFAULT 'OUTRO',
      descricao TEXT NULL,
      data_assinatura DATE NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_aditivo),
      KEY idx_tenant_contrato (tenant_id, id_contrato),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_cronogramas (
      id_cronograma BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_contrato BIGINT UNSIGNED NOT NULL,
      versao INT NOT NULL,
      origem ENUM('CONTRATADO','ADITIVO') NOT NULL DEFAULT 'CONTRATADO',
      id_aditivo BIGINT UNSIGNED NULL,
      cronograma_json JSON NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_cronograma),
      UNIQUE KEY uk_obra_versao (tenant_id, id_obra, versao),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_contrato (tenant_id, id_contrato)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);

    const idObra = Number(body?.idObra || 0);
    const numeroAditivo = body?.numeroAditivo ? String(body.numeroAditivo).trim() : null;
    const dataAssinatura = body?.dataAssinatura ? String(body.dataAssinatura).trim() : null;
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const cronogramaJson = body?.cronogramaJson ?? null;

    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!cronogramaJson || typeof cronogramaJson !== 'object') return fail(422, 'cronogramaJson é obrigatório');

    await ensureCronogramaTables();

    const [[obra]]: any = await conn.query(
      `
      SELECT o.id_obra, o.id_contrato, c.numero_contrato
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );
    if (!obra) return fail(404, 'Obra não encontrada');
    if (!String(obra.numero_contrato || '').trim()) return fail(422, 'Contrato principal sem número. Cadastre o número do contrato.');

    const [[last]]: any = await conn.query(
      `SELECT versao FROM obras_cronogramas WHERE tenant_id = ? AND id_obra = ? ORDER BY versao DESC LIMIT 1`,
      [current.tenantId, idObra]
    );
    if (!last) return fail(422, 'Cronograma contratado não encontrado. Cadastre primeiro o cronograma inicial contratado.');

    const nextVersao = Number(last.versao || 0) + 1;

    await conn.beginTransaction();

    const [adInsert]: any = await conn.query(
      `
      INSERT INTO contratos_aditivos
        (tenant_id, id_contrato, numero_aditivo, tipo_aditivo, descricao, data_assinatura, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?)
      `,
      [current.tenantId, obra.id_contrato, numeroAditivo, 'CRONOGRAMA', descricao, dataAssinatura || null, current.id]
    );
    const idAditivo = Number(adInsert.insertId);

    const [crInsert]: any = await conn.query(
      `
      INSERT INTO obras_cronogramas
        (tenant_id, id_obra, id_contrato, versao, origem, id_aditivo, cronograma_json, id_usuario_criador)
      VALUES
        (?,?,?,?, 'ADITIVO', ?, ?, ?)
      `,
      [current.tenantId, idObra, obra.id_contrato, nextVersao, idAditivo, JSON.stringify(cronogramaJson), current.id]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'contratos_aditivos',
      idRegistro: String(idAditivo),
      acao: 'CREATE',
      dadosNovos: { idContrato: Number(obra.id_contrato), idObra, numeroAditivo, tipoAditivo: 'CRONOGRAMA', descricao, dataAssinatura },
    });

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'obras_cronogramas',
      idRegistro: String(crInsert.insertId),
      acao: 'CREATE_ADITIVO',
      dadosNovos: { idObra, idContrato: Number(obra.id_contrato), versao: nextVersao, origem: 'ADITIVO', idAditivo, cronogramaJson },
    });

    await conn.commit();
    return ok({ idObra, idContrato: Number(obra.id_contrato), idAditivo, versao: nextVersao });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

