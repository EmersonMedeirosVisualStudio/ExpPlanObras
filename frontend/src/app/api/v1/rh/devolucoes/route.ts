import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureDevolucoesTable() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS rh_devolucoes_funcionario (
      id_solicitacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_funcionario BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NULL,
      motivo VARCHAR(100) NULL,
      justificativa TEXT NULL,
      relato_engenheiro TEXT NULL,
      relato_mestre TEXT NULL,
      relato_encarregado TEXT NULL,
      sugestao_providencia VARCHAR(40) NULL,
      status ENUM('PENDENTE','DECIDIDA') NOT NULL DEFAULT 'PENDENTE',
      decisao VARCHAR(40) NULL,
      decisao_observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decidido_em DATETIME NULL,
      id_usuario_solicitante BIGINT UNSIGNED NULL,
      id_usuario_decisor BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_solicitacao),
      KEY idx_tenant_status (tenant_id, status),
      KEY idx_tenant_funcionario (tenant_id, id_funcionario),
      KEY idx_tenant_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const status = String(req.nextUrl.searchParams.get('status') || '').trim().toUpperCase();
    const idObra = req.nextUrl.searchParams.get('idObra') ? Number(req.nextUrl.searchParams.get('idObra')) : null;
    const limite = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limite') || 50)));

    await ensureDevolucoesTable();

    const where: string[] = ['d.tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (status) {
      where.push('d.status = ?');
      params.push(status);
    }
    if (idObra) {
      where.push('d.id_obra = ?');
      params.push(idObra);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        d.id_solicitacao AS idSolicitacao,
        d.status,
        d.id_funcionario AS idFuncionario,
        f.nome_completo AS funcionarioNome,
        d.id_obra AS idObra,
        d.motivo,
        d.sugestao_providencia AS sugestaoProvidencia,
        d.criado_em AS criadoEm,
        d.decisao,
        d.decidido_em AS decididoEm
      FROM rh_devolucoes_funcionario d
      INNER JOIN funcionarios f ON f.id_funcionario = d.id_funcionario
      WHERE ${where.join(' AND ')}
      ORDER BY d.criado_em DESC, d.id_solicitacao DESC
      LIMIT ?
      `,
      [...params, limite]
    );

    return ok((rows as any[]).map((r) => ({ ...r, idSolicitacao: Number(r.idSolicitacao), idFuncionario: Number(r.idFuncionario) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const body = await req.json().catch(() => null);

    const idFuncionario = Number(body?.idFuncionario || 0);
    const idObra = body?.idObra ? Number(body.idObra) : null;
    const motivo = body?.motivo ? String(body.motivo).trim() : null;
    const justificativa = body?.justificativa ? String(body.justificativa).trim() : null;
    const relatoEngenheiro = body?.relatoEngenheiro ? String(body.relatoEngenheiro).trim() : null;
    const relatoMestre = body?.relatoMestre ? String(body.relatoMestre).trim() : null;
    const relatoEncarregado = body?.relatoEncarregado ? String(body.relatoEncarregado).trim() : null;
    const sugestaoProvidencia = body?.sugestaoProvidencia ? String(body.sugestaoProvidencia).trim() : null;

    if (!Number.isFinite(idFuncionario) || idFuncionario <= 0) return fail(422, 'idFuncionario é obrigatório');
    if (idObra && !canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');
    if (!justificativa) return fail(422, 'justificativa é obrigatória');

    await ensureDevolucoesTable();

    const [[func]]: any = await conn.query(`SELECT id_funcionario FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ? LIMIT 1`, [
      current.tenantId,
      idFuncionario,
    ]);
    if (!func) return fail(404, 'Funcionário não encontrado');

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO rh_devolucoes_funcionario
        (tenant_id, id_funcionario, id_obra, motivo, justificativa, relato_engenheiro, relato_mestre, relato_encarregado, sugestao_providencia, status, id_usuario_solicitante)
      VALUES
        (?,?,?,?,?,?,?,?,?,'PENDENTE',?)
      `,
      [current.tenantId, idFuncionario, idObra || null, motivo, justificativa, relatoEngenheiro, relatoMestre, relatoEncarregado, sugestaoProvidencia, current.id]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'rh_devolucoes_funcionario',
      idRegistro: String(ins.insertId),
      acao: 'CREATE',
      dadosNovos: { idFuncionario, idObra, motivo, sugestaoProvidencia },
    });

    await conn.commit();
    return ok({ idSolicitacao: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

