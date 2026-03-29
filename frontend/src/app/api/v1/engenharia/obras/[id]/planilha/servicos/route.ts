import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_planilhas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      descricao_servico VARCHAR(220) NULL,
      unidade_medida VARCHAR(32) NULL,
      quantidade_contratada DECIMAL(14,4) NULL,
      preco_unitario DECIMAL(14,6) NULL,
      valor_total DECIMAL(14,6) NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (id_item),
      UNIQUE KEY uk_item (tenant_id, id_obra, codigo_servico),
      KEY idx_tenant (tenant_id),
      KEY idx_obra (tenant_id, id_obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(`ALTER TABLE obras_planilhas_itens ADD COLUMN codigo_composicao VARCHAR(64) NULL AFTER codigo_servico`).catch(() => null);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idObra = Number(id || 0);
    if (!Number.isFinite(idObra) || idObra <= 0) return fail(422, 'idObra inválido');
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Sem acesso à obra');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT codigo_servico AS codigoServico, codigo_composicao AS codigoComposicao, descricao_servico AS descricaoServico
      FROM obras_planilhas_itens
      WHERE tenant_id = ? AND id_obra = ?
      ORDER BY codigo_servico ASC
      `,
      [current.tenantId, idObra]
    );

    return ok(
      (rows as any[]).map((r) => ({
        codigoServico: String(r.codigoServico),
        codigoComposicao: r.codigoComposicao ? String(r.codigoComposicao) : null,
        descricaoServico: r.descricaoServico ? String(r.descricaoServico) : null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}
