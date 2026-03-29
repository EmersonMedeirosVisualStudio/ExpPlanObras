import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_centros_custo (
      id_centro_custo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(40) NOT NULL,
      descricao VARCHAR(200) NOT NULL,
      tipo VARCHAR(40) NULL,
      unidade_medida VARCHAR(32) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_centro_custo),
      UNIQUE KEY uk_codigo (tenant_id, codigo),
      KEY idx_tenant (tenant_id),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_servicos_centros_custo (
      id_vinculo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      id_centro_custo BIGINT UNSIGNED NOT NULL,
      id_equipe_padrao BIGINT UNSIGNED NULL,
      produtividade_prevista DECIMAL(14,6) NULL,
      custo_unitario_previsto DECIMAL(14,6) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_vinculo),
      UNIQUE KEY uk_servico_cc (tenant_id, codigo_servico, id_centro_custo),
      KEY idx_tenant (tenant_id),
      KEY idx_servico (tenant_id, codigo_servico),
      KEY idx_cc (tenant_id, id_centro_custo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const ativo = req.nextUrl.searchParams.get('ativo');

    const where: string[] = ['tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (ativo === '1' || ativo === '0') {
      where.push('ativo = ?');
      params.push(Number(ativo));
    }
    if (q) {
      where.push('(LOWER(codigo) LIKE ? OR LOWER(descricao) LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_centro_custo AS idCentroCusto,
        codigo,
        descricao,
        tipo,
        unidade_medida AS unidadeMedida,
        ativo,
        observacao
      FROM engenharia_centros_custo
      WHERE ${where.join(' AND ')}
      ORDER BY ativo DESC, codigo ASC
      LIMIT 500
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idCentroCusto: Number(r.idCentroCusto),
        ativo: Number(r.ativo || 0) ? true : false,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const body = await req.json().catch(() => null);
    const codigo = String(body?.codigo || '').trim().toUpperCase();
    const descricao = String(body?.descricao || '').trim();
    const tipo = body?.tipo ? String(body.tipo).trim() : null;
    const unidadeMedida = body?.unidadeMedida ? String(body.unidadeMedida).trim() : null;
    const ativo = body?.ativo === false ? 0 : 1;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!codigo) return fail(422, 'codigo é obrigatório');
    if (!descricao) return fail(422, 'descricao é obrigatória');

    const [ins]: any = await db.query(
      `
      INSERT INTO engenharia_centros_custo (tenant_id, codigo, descricao, tipo, unidade_medida, ativo, observacao)
      VALUES (?,?,?,?,?,?,?)
      `,
      [current.tenantId, codigo, descricao, tipo, unidadeMedida, ativo, observacao]
    );

    return ok({ idCentroCusto: Number(ins.insertId) });
  } catch (e) {
    return handleApiError(e);
  }
}

