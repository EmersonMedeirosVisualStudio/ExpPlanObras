import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos_descartes (
      id_descarte BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE','ALMOXARIFADO','TERCEIRO') NULL,
      id_local BIGINT UNSIGNED NULL,
      data_solicitacao DATE NOT NULL,
      motivo TEXT NOT NULL,
      laudo_url VARCHAR(1024) NULL,
      status ENUM('PENDENTE','APROVADO','REJEITADO') NOT NULL DEFAULT 'PENDENTE',
      id_usuario_solicitante BIGINT UNSIGNED NULL,
      id_usuario_aprovador BIGINT UNSIGNED NULL,
      aprovado_em DATETIME NULL,
      rejeitado_em DATETIME NULL,
      motivo_rejeicao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_descarte),
      KEY idx_ativo (tenant_id, id_ativo),
      KEY idx_status (tenant_id, status),
      KEY idx_local (tenant_id, tipo_local, id_local)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);
    const { id } = await params;
    const idDescarte = Number(id || 0);
    if (!Number.isFinite(idDescarte) || idDescarte <= 0) return fail(422, 'idDescarte inválido');

    const body = await req.json().catch(() => null);
    const motivoRejeicao = String(body?.motivoRejeicao || '').trim();
    if (!motivoRejeicao) return fail(422, 'motivoRejeicao é obrigatório');

    await ensureTables();

    const [[row]]: any = await conn.query(
      `
      SELECT id_descarte, status, tipo_local AS tipoLocal, id_local AS idLocal
      FROM engenharia_ativos_descartes
      WHERE tenant_id = ? AND id_descarte = ?
      LIMIT 1
      `,
      [current.tenantId, idDescarte]
    );
    if (!row) return fail(404, 'Laudo de descarte não encontrado');
    if (String(row.status) !== 'PENDENTE') return fail(422, 'Laudo já analisado');

    const tipoLocal = row.tipoLocal ? String(row.tipoLocal) : null;
    const idLocal = row.idLocal == null ? null : Number(row.idLocal);
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && idLocal && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && idLocal && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await conn.beginTransaction();
    await conn.query(
      `
      UPDATE engenharia_ativos_descartes
      SET status = 'REJEITADO', id_usuario_aprovador = ?, rejeitado_em = NOW(), motivo_rejeicao = ?
      WHERE tenant_id = ? AND id_descarte = ?
      `,
      [current.id, motivoRejeicao, current.tenantId, idDescarte]
    );
    await conn.commit();
    return ok({ idDescarte, status: 'REJEITADO' });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

