import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS contratos_vinculos (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_contrato_principal BIGINT UNSIGNED NOT NULL,
      id_contrato_terceiro BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_principal_terceiro (tenant_id, id_contrato_principal, id_contrato_terceiro),
      KEY idx_principal (tenant_id, id_contrato_principal),
      KEY idx_terceiro (tenant_id, id_contrato_terceiro)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_contratos_terceirizados (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      id_contrato_terceiro BIGINT UNSIGNED NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_obra_contrato (tenant_id, id_obra, id_contrato_terceiro),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_contrato_terceiro (tenant_id, id_contrato_terceiro)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        oct.id_contrato_terceiro AS idContratoTerceiro,
        ct.numero_contrato AS numeroContratoTerceiro,
        c0.id_contrato AS idContratoPrincipal,
        c0.numero_contrato AS numeroContratoPrincipal,
        oct.created_at AS vinculadoEm
      FROM obras_contratos_terceirizados oct
      INNER JOIN obras o ON o.id_obra = oct.id_obra
      INNER JOIN contratos c0 ON c0.id_contrato = o.id_contrato
      INNER JOIN contratos ct ON ct.id_contrato = oct.id_contrato_terceiro
      WHERE oct.tenant_id = ?
        AND oct.id_obra = ?
        AND c0.tenant_id = ?
        AND ct.tenant_id = ?
      ORDER BY oct.created_at DESC, oct.id_vinculo DESC
      `,
      [current.tenantId, idObra, current.tenantId, current.tenantId]
    );

    return ok(rows || []);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const idContratoTerceiro = Number(body?.idContratoTerceiro || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!Number.isFinite(idContratoTerceiro) || idContratoTerceiro <= 0) return fail(422, 'idContratoTerceiro é obrigatório');

    await ensureTables();

    const [[obra]]: any = await conn.query(
      `
      SELECT o.id_obra, o.id_contrato AS idContratoPrincipal, c0.numero_contrato AS numeroContratoPrincipal
      FROM obras o
      INNER JOIN contratos c0 ON c0.id_contrato = o.id_contrato
      WHERE o.id_obra = ?
        AND c0.tenant_id = ?
      LIMIT 1
      `,
      [idObra, current.tenantId]
    );
    if (!obra) return fail(404, 'Obra não encontrada');
    const idContratoPrincipal = Number(obra.idContratoPrincipal || 0);
    if (!idContratoPrincipal) return fail(422, 'Obra sem contrato principal');
    if (idContratoTerceiro === idContratoPrincipal) return fail(422, 'Contrato terceirizado não pode ser o mesmo do contrato principal');
    if (!String(obra.numeroContratoPrincipal || '').trim()) return fail(422, 'Contrato principal sem número. Cadastre o número do contrato.');

    const [[terceiro]]: any = await conn.query(
      `SELECT id_contrato, numero_contrato FROM contratos WHERE tenant_id = ? AND id_contrato = ? LIMIT 1`,
      [current.tenantId, idContratoTerceiro]
    );
    if (!terceiro) return fail(404, 'Contrato terceirizado não encontrado');

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO contratos_vinculos (tenant_id, id_contrato_principal, id_contrato_terceiro)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE id_vinculo = id_vinculo
      `,
      [current.tenantId, idContratoPrincipal, idContratoTerceiro]
    );
    await conn.query(
      `
      INSERT INTO obras_contratos_terceirizados (tenant_id, id_obra, id_contrato_terceiro)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE id_vinculo = id_vinculo
      `,
      [current.tenantId, idObra, idContratoTerceiro]
    );
    await conn.commit();

    return ok({ idObra, idContratoPrincipal, idContratoTerceiro });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

export async function DELETE(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const idContratoTerceiro = Number(body?.idContratoTerceiro || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra é obrigatório');
    if (!Number.isFinite(idContratoTerceiro) || idContratoTerceiro <= 0) return fail(422, 'idContratoTerceiro é obrigatório');

    await ensureTables();

    await conn.beginTransaction();
    await conn.query(`DELETE FROM obras_contratos_terceirizados WHERE tenant_id = ? AND id_obra = ? AND id_contrato_terceiro = ?`, [
      current.tenantId,
      idObra,
      idContratoTerceiro,
    ]);
    await conn.commit();

    return ok({ idObra, idContratoTerceiro });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

