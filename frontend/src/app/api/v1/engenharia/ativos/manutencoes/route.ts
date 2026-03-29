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
    CREATE TABLE IF NOT EXISTS engenharia_ativos_manutencoes (
      id_manutencao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_ativo BIGINT UNSIGNED NOT NULL,
      tipo ENUM('PREVENTIVA','CORRETIVA') NOT NULL,
      status ENUM('ABERTA','EXECUTADA','CANCELADA') NOT NULL DEFAULT 'ABERTA',
      data_programada DATE NULL,
      data_execucao DATE NULL,
      descricao TEXT NULL,
      codigo_servico VARCHAR(80) NULL,
      custo_total DECIMAL(14,2) NULL,
      id_contraparte BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_manutencao),
      KEY idx_ativo (tenant_id, id_ativo),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function assertServicoExists(tenantId: number, codigo: string) {
  const [[row]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_servicos WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (!row) throw new Error('Código de serviço inválido');
}

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'PREVENTIVA' || s === 'CORRETIVA' ? s : null;
}

function normalizeStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ABERTA' || s === 'EXECUTADA' || s === 'CANCELADA' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return s ? (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null) : null;
}

function toNumberOrNull(v: unknown) {
  if (v == null || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const idAtivo = req.nextUrl.searchParams.get('idAtivo') ? Number(req.nextUrl.searchParams.get('idAtivo')) : null;
    const status = normalizeStatus(req.nextUrl.searchParams.get('status'));
    const limite = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limite') || 50)));

    await ensureTables();

    const where: string[] = ['m.tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (idAtivo) {
      where.push('m.id_ativo = ?');
      params.push(idAtivo);
    }
    if (status) {
      where.push('m.status = ?');
      params.push(status);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        m.id_manutencao AS idManutencao,
        m.id_ativo AS idAtivo,
        a.descricao AS ativoDescricao,
        a.categoria AS ativoCategoria,
        a.local_tipo AS localTipo,
        a.local_id AS localId,
        m.tipo,
        m.status,
        m.data_programada AS dataProgramada,
        m.data_execucao AS dataExecucao,
        m.descricao,
        m.codigo_servico AS codigoServico,
        m.custo_total AS custoTotal,
        m.id_contraparte AS idContraparte,
        m.criado_em AS criadoEm
      FROM engenharia_ativos_manutencoes m
      INNER JOIN engenharia_ativos a ON a.tenant_id = m.tenant_id AND a.id_ativo = m.id_ativo
      WHERE ${where.join(' AND ')}
      ORDER BY m.id_manutencao DESC
      LIMIT ?
      `,
      [...params, limite]
    );

    const out = (rows as any[]).filter((r) => {
      if (scope.empresaTotal) return true;
      const t = String(r.localTipo || '');
      const id = r.localId == null ? null : Number(r.localId);
      if (t === 'OBRA' && id != null) return scope.obras.includes(id);
      if (t === 'UNIDADE' && id != null) return scope.unidades.includes(id);
      return false;
    });

    return ok(
      out.map((r: any) => ({
        ...r,
        idManutencao: Number(r.idManutencao),
        idAtivo: Number(r.idAtivo),
        localId: r.localId == null ? null : Number(r.localId),
        custoTotal: r.custoTotal == null ? null : Number(r.custoTotal),
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

    const idAtivo = Number(body?.idAtivo || 0);
    const tipo = normalizeTipo(body?.tipo);
    const dataProgramada = normalizeDate(body?.dataProgramada);
    const descricao = body?.descricao ? String(body.descricao).trim() : null;
    const codigoServico = body?.codigoServico ? String(body.codigoServico).trim() : null;
    const custoTotal = toNumberOrNull(body?.custoTotal);
    const idContraparte = body?.idContraparte ? Number(body.idContraparte) : null;

    if (!Number.isFinite(idAtivo) || idAtivo <= 0) return fail(422, 'idAtivo é obrigatório');
    if (!tipo) return fail(422, 'tipo é obrigatório (PREVENTIVA|CORRETIVA)');
    if (codigoServico) await assertServicoExists(current.tenantId, codigoServico);
    if (custoTotal != null && custoTotal < 0) return fail(422, 'custoTotal inválido');
    if (idContraparte != null && (!Number.isFinite(idContraparte) || idContraparte <= 0)) return fail(422, 'idContraparte inválido');

    await ensureTables();

    const [[ativo]]: any = await conn.query(
      `SELECT local_tipo AS localTipo, local_id AS localId FROM engenharia_ativos WHERE tenant_id = ? AND id_ativo = ? LIMIT 1`,
      [current.tenantId, idAtivo]
    );
    if (!ativo) return fail(404, 'Ativo não encontrado');

    const localTipo = ativo.localTipo ? String(ativo.localTipo) : null;
    const localId = ativo.localId == null ? null : Number(ativo.localId);
    if (!scope.empresaTotal && localTipo === 'OBRA' && localId && !scope.obras.includes(localId)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && localTipo === 'UNIDADE' && localId && !scope.unidades.includes(localId)) return fail(403, 'Unidade fora da abrangência');

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_ativos_manutencoes
        (tenant_id, id_ativo, tipo, status, data_programada, descricao, codigo_servico, custo_total, id_contraparte, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, idAtivo, tipo, 'ABERTA', dataProgramada, descricao, codigoServico, custoTotal, idContraparte, current.id]
    );
    await conn.commit();
    return ok({ idManutencao: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

