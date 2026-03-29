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

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const status = String(req.nextUrl.searchParams.get('status') || '').trim().toUpperCase();
    const tipoLocal = String(req.nextUrl.searchParams.get('tipoLocal') || '').trim().toUpperCase();
    const idLocal = req.nextUrl.searchParams.get('idLocal') ? Number(req.nextUrl.searchParams.get('idLocal')) : null;

    await ensureTables();

    const where: string[] = ['d.tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (status) {
      where.push('d.status = ?');
      params.push(status);
    }
    if (tipoLocal && idLocal) {
      if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
      if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');
      where.push('d.tipo_local = ? AND d.id_local = ?');
      params.push(tipoLocal, idLocal);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        d.id_descarte AS idDescarte,
        d.id_ativo AS idAtivo,
        a.descricao AS ativoDescricao,
        a.categoria AS ativoCategoria,
        d.tipo_local AS tipoLocal,
        d.id_local AS idLocal,
        d.data_solicitacao AS dataSolicitacao,
        d.motivo,
        d.laudo_url AS laudoUrl,
        d.status,
        d.aprovado_em AS aprovadoEm,
        d.rejeitado_em AS rejeitadoEm
      FROM engenharia_ativos_descartes d
      INNER JOIN engenharia_ativos a ON a.tenant_id = d.tenant_id AND a.id_ativo = d.id_ativo
      WHERE ${where.join(' AND ')}
      ORDER BY d.id_descarte DESC
      LIMIT 500
      `,
      params
    );

    return ok((rows as any[]).map((r) => ({ ...r, idDescarte: Number(r.idDescarte), idAtivo: Number(r.idAtivo), idLocal: r.idLocal == null ? null : Number(r.idLocal) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);
    const body = await req.json().catch(() => null);

    const idAtivo = Number(body?.idAtivo || 0);
    const dataSolicitacao = normalizeDate(body?.dataSolicitacao) || new Date().toISOString().slice(0, 10);
    const motivo = String(body?.motivo || '').trim();
    const laudoUrl = body?.laudoUrl ? String(body.laudoUrl).trim() : null;

    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!dataSolicitacao) return fail(422, 'dataSolicitacao inválida');
    if (!motivo) return fail(422, 'motivo é obrigatório');

    await ensureTables();

    const [[ativo]]: any = await conn.query(
      `SELECT id_ativo, local_tipo AS localTipo, local_id AS localId FROM engenharia_ativos WHERE tenant_id = ? AND id_ativo = ? LIMIT 1`,
      [current.tenantId, idAtivo]
    );
    if (!ativo) return fail(404, 'Ativo não encontrado');

    const tipoLocal = ativo.localTipo ? String(ativo.localTipo) : null;
    const idLocal = ativo.localId == null ? null : Number(ativo.localId);
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && idLocal && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && idLocal && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_ativos_descartes
        (tenant_id, id_ativo, tipo_local, id_local, data_solicitacao, motivo, laudo_url, status, id_usuario_solicitante)
      VALUES
        (?,?,?,?,?,?,?,'PENDENTE',?)
      `,
      [current.tenantId, idAtivo, tipoLocal, idLocal, dataSolicitacao, motivo, laudoUrl, current.id]
    );
    await conn.commit();
    return ok({ idDescarte: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

