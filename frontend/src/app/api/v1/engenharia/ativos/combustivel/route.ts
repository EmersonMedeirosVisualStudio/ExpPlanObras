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
    CREATE TABLE IF NOT EXISTS engenharia_ativos_combustivel (
      id_registro BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      litros DECIMAL(12,3) NOT NULL DEFAULT 0,
      valor_total DECIMAL(14,2) NOT NULL DEFAULT 0,
      odometro_horimetro DECIMAL(14,2) NULL,
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_funcionario_lancador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_registro),
      KEY idx_local (tenant_id, tipo_local, id_local),
      KEY idx_ativo (tenant_id, id_ativo),
      UNIQUE KEY uk_unique (tenant_id, id_ativo, data_referencia, tipo_local, id_local, codigo_servico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function assertServicoExists(tenantId: number, codigo: string) {
  const [[row]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_servicos WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (!row) throw new Error('Código de serviço inválido');
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idLocal = Number(req.nextUrl.searchParams.get('idLocal') || 0);
    const competencia = String(req.nextUrl.searchParams.get('competencia') || '').trim();

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const where: string[] = ['tenant_id = ?', 'tipo_local = ?', 'id_local = ?'];
    const params: any[] = [current.tenantId, tipoLocal, idLocal];
    if (/^\d{4}-\d{2}$/.test(competencia)) {
      where.push(`DATE_FORMAT(data_referencia,'%Y-%m') = ?`);
      params.push(competencia);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_registro AS idRegistro,
        id_ativo AS idAtivo,
        data_referencia AS dataReferencia,
        codigo_servico AS codigoServico,
        litros,
        valor_total AS valorTotal,
        odometro_horimetro AS odometroHorimetro,
        observacao
      FROM engenharia_ativos_combustivel
      WHERE ${where.join(' AND ')}
      ORDER BY data_referencia DESC, id_registro DESC
      LIMIT 500
      `,
      params
    );
    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idRegistro: Number(r.idRegistro),
        idAtivo: Number(r.idAtivo),
        litros: Number(r.litros || 0),
        valorTotal: Number(r.valorTotal || 0),
        odometroHorimetro: r.odometroHorimetro == null ? null : Number(r.odometroHorimetro),
      }))
    );
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

    const tipoLocal = normalizeTipoLocal(body?.tipoLocal);
    const idLocal = Number(body?.idLocal || 0);
    const idAtivo = Number(body?.idAtivo || 0);
    const dataReferencia = normalizeDate(body?.dataReferencia);
    const codigoServico = String(body?.codigoServico || '').trim();
    const litros = toNumber(body?.litros);
    const valorTotal = toNumber(body?.valorTotal);
    const odometroHorimetro = body?.odometroHorimetro == null ? null : toNumber(body.odometroHorimetro);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!dataReferencia) return fail(422, 'dataReferencia é obrigatória (YYYY-MM-DD)');
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');
    if (!Number.isFinite(litros) || litros < 0) return fail(422, 'litros inválido');
    if (!Number.isFinite(valorTotal) || valorTotal < 0) return fail(422, 'valorTotal inválido');
    if (odometroHorimetro != null && (!Number.isFinite(odometroHorimetro) || odometroHorimetro < 0)) return fail(422, 'odometroHorimetro inválido');

    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();
    await assertServicoExists(current.tenantId, codigoServico);

    const [[ativo]]: any = await conn.query(`SELECT id_ativo FROM engenharia_ativos WHERE tenant_id = ? AND id_ativo = ? LIMIT 1`, [
      current.tenantId,
      idAtivo,
    ]);
    if (!ativo) return fail(404, 'Ativo não encontrado');

    await conn.beginTransaction();
    await conn.query(
      `
      INSERT INTO engenharia_ativos_combustivel
        (tenant_id, id_ativo, data_referencia, tipo_local, id_local, codigo_servico, litros, valor_total, odometro_horimetro, observacao, id_funcionario_lancador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        litros = VALUES(litros),
        valor_total = VALUES(valor_total),
        odometro_horimetro = VALUES(odometro_horimetro),
        observacao = VALUES(observacao),
        id_funcionario_lancador = VALUES(id_funcionario_lancador)
      `,
      [current.tenantId, idAtivo, dataReferencia, tipoLocal, idLocal, codigoServico, litros, valorTotal, odometroHorimetro, observacao, current.idFuncionario ?? null]
    );
    await conn.commit();

    return ok({ ok: true });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

