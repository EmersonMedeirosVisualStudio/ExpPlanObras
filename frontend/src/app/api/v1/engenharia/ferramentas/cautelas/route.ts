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
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_cautelas (
      id_cautela BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      status ENUM('ABERTA','FECHADA') NOT NULL DEFAULT 'ABERTA',
      id_funcionario_responsavel BIGINT UNSIGNED NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_cautela),
      UNIQUE KEY uk_local_data (tenant_id, tipo_local, id_local, data_referencia),
      KEY idx_tenant (tenant_id),
      KEY idx_local (tenant_id, tipo_local, id_local)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ferramentas_cautelas_itens (
      id_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_cautela BIGINT UNSIGNED NOT NULL,
      codigo_ferramenta VARCHAR(80) NOT NULL,
      acao ENUM('ENTREGA','DEVOLUCAO') NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 1,
      id_funcionario_destinatario BIGINT UNSIGNED NULL,
      codigo_servico VARCHAR(80) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_item),
      KEY idx_cautela (tenant_id, id_cautela),
      KEY idx_codigo (tenant_id, codigo_ferramenta),
      KEY idx_data (tenant_id, criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idLocal = Number(req.nextUrl.searchParams.get('idLocal') || 0);
    const data = normalizeDate(req.nextUrl.searchParams.get('data'));

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const [[row]]: any = await db.query(
      `
      SELECT
        id_cautela AS idCautela,
        tipo_local AS tipoLocal,
        id_local AS idLocal,
        data_referencia AS dataReferencia,
        status,
        id_funcionario_responsavel AS idFuncionarioResponsavel,
        observacao
      FROM engenharia_ferramentas_cautelas
      WHERE tenant_id = ? AND tipo_local = ? AND id_local = ? ${data ? 'AND data_referencia = ?' : ''}
      ORDER BY data_referencia DESC, id_cautela DESC
      LIMIT 30
      `,
      data ? [current.tenantId, tipoLocal, idLocal, data] : [current.tenantId, tipoLocal, idLocal]
    );

    return ok(
      row
        ? {
            ...row,
            idCautela: Number(row.idCautela),
            idLocal: Number(row.idLocal),
            idFuncionarioResponsavel: row.idFuncionarioResponsavel ? Number(row.idFuncionarioResponsavel) : null,
          }
        : null
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);
    const body = await req.json().catch(() => null);

    const tipoLocal = normalizeTipoLocal(body?.tipoLocal);
    const idLocal = Number(body?.idLocal || 0);
    const dataReferencia = normalizeDate(body?.dataReferencia);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!dataReferencia) return fail(422, 'dataReferencia é obrigatória (YYYY-MM-DD)');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const [ins]: any = await db.query(
      `
      INSERT INTO engenharia_ferramentas_cautelas (tenant_id, tipo_local, id_local, data_referencia, status, id_funcionario_responsavel, observacao)
      VALUES (?, ?, ?, ?, 'ABERTA', ?, ?)
      ON DUPLICATE KEY UPDATE atualizado_em = CURRENT_TIMESTAMP
      `,
      [current.tenantId, tipoLocal, idLocal, dataReferencia, current.idFuncionario ?? null, observacao]
    );

    const idCautela = Number(ins.insertId || 0);
    if (idCautela) return ok({ idCautela });

    const [[row]]: any = await db.query(
      `SELECT id_cautela AS idCautela FROM engenharia_ferramentas_cautelas WHERE tenant_id = ? AND tipo_local = ? AND id_local = ? AND data_referencia = ? LIMIT 1`,
      [current.tenantId, tipoLocal, idLocal, dataReferencia]
    );
    return ok({ idCautela: Number(row.idCautela) });
  } catch (e) {
    return handleApiError(e);
  }
}
