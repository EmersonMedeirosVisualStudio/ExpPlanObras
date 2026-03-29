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
    CREATE TABLE IF NOT EXISTS engenharia_ativos_horas (
      id_apontamento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      data_referencia DATE NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      codigo_servico VARCHAR(80) NOT NULL,
      horas_produtivas DECIMAL(10,2) NOT NULL DEFAULT 0,
      horas_improdutivas DECIMAL(10,2) NOT NULL DEFAULT 0,
      observacao TEXT NULL,
      id_funcionario_apontador BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_apontamento),
      UNIQUE KEY uk_unique (tenant_id, id_ativo, data_referencia, tipo_local, id_local, codigo_servico),
      KEY idx_local (tenant_id, tipo_local, id_local),
      KEY idx_ativo (tenant_id, id_ativo)
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
    const idAtivo = Number(req.nextUrl.searchParams.get('idAtivo') || 0);
    const dataIni = normalizeDate(req.nextUrl.searchParams.get('dataIni'));
    const dataFim = normalizeDate(req.nextUrl.searchParams.get('dataFim')) || dataIni;

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    const where: string[] = ['tenant_id = ?', 'tipo_local = ?', 'id_local = ?'];
    const params: any[] = [current.tenantId, tipoLocal, idLocal];
    if (idAtivo) {
      where.push('id_ativo = ?');
      params.push(idAtivo);
    }
    if (dataIni) {
      where.push('data_referencia BETWEEN ? AND ?');
      params.push(dataIni, dataFim || dataIni);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_apontamento AS idApontamento,
        id_ativo AS idAtivo,
        data_referencia AS dataReferencia,
        codigo_servico AS codigoServico,
        horas_produtivas AS horasProdutivas,
        horas_improdutivas AS horasImprodutivas,
        observacao
      FROM engenharia_ativos_horas
      WHERE ${where.join(' AND ')}
      ORDER BY data_referencia DESC, id_apontamento DESC
      LIMIT 500
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idApontamento: Number(r.idApontamento),
        idAtivo: Number(r.idAtivo),
        horasProdutivas: Number(r.horasProdutivas || 0),
        horasImprodutivas: Number(r.horasImprodutivas || 0),
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
    const horasProdutivas = toNumber(body?.horasProdutivas);
    const horasImprodutivas = toNumber(body?.horasImprodutivas);
    const observacao = body?.observacao ? String(body.observacao).trim() : null;

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!dataReferencia) return fail(422, 'dataReferencia é obrigatória (YYYY-MM-DD)');
    if (!codigoServico) return fail(422, 'codigoServico é obrigatório');
    if (!Number.isFinite(horasProdutivas) || horasProdutivas < 0) return fail(422, 'horasProdutivas inválida');
    if (!Number.isFinite(horasImprodutivas) || horasImprodutivas < 0) return fail(422, 'horasImprodutivas inválida');

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
      INSERT INTO engenharia_ativos_horas
        (tenant_id, id_ativo, data_referencia, tipo_local, id_local, codigo_servico, horas_produtivas, horas_improdutivas, observacao, id_funcionario_apontador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        horas_produtivas = VALUES(horas_produtivas),
        horas_improdutivas = VALUES(horas_improdutivas),
        observacao = VALUES(observacao),
        id_funcionario_apontador = VALUES(id_funcionario_apontador)
      `,
      [current.tenantId, idAtivo, dataReferencia, tipoLocal, idLocal, codigoServico, horasProdutivas, horasImprodutivas, observacao, current.idFuncionario ?? null]
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

