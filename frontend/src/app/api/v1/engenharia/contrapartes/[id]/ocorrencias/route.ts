import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contrapartes_ocorrencias (
      id_ocorrencia BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_contraparte BIGINT UNSIGNED NOT NULL,
      id_contrato_locacao BIGINT UNSIGNED NULL,
      tipo VARCHAR(80) NULL,
      gravidade ENUM('BAIXA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
      data_ocorrencia DATE NULL,
      descricao TEXT NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario_criador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_ocorrencia),
      KEY idx_contraparte (tenant_id, id_contraparte),
      KEY idx_contrato (tenant_id, id_contrato_locacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function normalizeGravidade(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'BAIXA' || s === 'MEDIA' || s === 'ALTA' || s === 'CRITICA' ? s : null;
}

function normalizeDate(v: unknown) {
  const s = String(v ?? '').trim();
  return s ? (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null) : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idContraparte = Number(id || 0);
    if (!Number.isFinite(idContraparte) || idContraparte <= 0) return fail(422, 'idContraparte inválido');

    await ensureTables();

    const [rows]: any = await db.query(
      `
      SELECT
        id_ocorrencia AS idOcorrencia,
        id_contrato_locacao AS idContratoLocacao,
        tipo,
        gravidade,
        data_ocorrencia AS dataOcorrencia,
        descricao,
        criado_em AS criadoEm
      FROM engenharia_contrapartes_ocorrencias
      WHERE tenant_id = ? AND id_contraparte = ?
      ORDER BY COALESCE(data_ocorrencia, DATE(criado_em)) DESC, id_ocorrencia DESC
      LIMIT 200
      `,
      [current.tenantId, idContraparte]
    );
    return ok((rows as any[]).map((r) => ({ ...r, idOcorrencia: Number(r.idOcorrencia), idContratoLocacao: r.idContratoLocacao == null ? null : Number(r.idContratoLocacao) })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await params;
    const idContraparte = Number(id || 0);
    if (!Number.isFinite(idContraparte) || idContraparte <= 0) return fail(422, 'idContraparte inválido');

    const body = await req.json().catch(() => null);
    const idContratoLocacao = body?.idContratoLocacao ? Number(body.idContratoLocacao) : null;
    const tipo = body?.tipo ? String(body.tipo).trim() : null;
    const gravidade = normalizeGravidade(body?.gravidade) || 'MEDIA';
    const dataOcorrencia = normalizeDate(body?.dataOcorrencia);
    const descricao = String(body?.descricao || '').trim();

    if (!descricao) return fail(422, 'descricao é obrigatória');
    if (idContratoLocacao != null && (!Number.isFinite(idContratoLocacao) || idContratoLocacao <= 0)) return fail(422, 'idContratoLocacao inválido');

    await ensureTables();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_contrapartes_ocorrencias
        (tenant_id, id_contraparte, id_contrato_locacao, tipo, gravidade, data_ocorrencia, descricao, id_usuario_criador)
      VALUES
        (?,?,?,?,?,?,?,?)
      `,
      [current.tenantId, idContraparte, idContratoLocacao, tipo, gravidade, dataOcorrencia, descricao, current.id]
    );
    await conn.commit();
    return ok({ idOcorrencia: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

