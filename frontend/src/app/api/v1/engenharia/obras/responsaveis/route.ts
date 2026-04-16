import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

function normalizeTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'RESPONSAVEL_TECNICO' || s === 'FISCAL_OBRA' ? s : null;
}

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS obras_responsaveis (
      id_responsavel_obra BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_obra BIGINT UNSIGNED NOT NULL,
      tipo ENUM('RESPONSAVEL_TECNICO','FISCAL_OBRA') NOT NULL,
      nome VARCHAR(255) NOT NULL,
      registro_profissional VARCHAR(64) NULL,
      cpf VARCHAR(20) NULL,
      email VARCHAR(120) NULL,
      telefone VARCHAR(40) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_responsavel_obra),
      KEY idx_obra (tenant_id, id_obra),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_ativo (tenant_id, ativo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    await ensureTables();

    const idObraParam = req.nextUrl.searchParams.get('idObra');
    const tipoParam = req.nextUrl.searchParams.get('tipo');
    const apenasAtivos = String(req.nextUrl.searchParams.get('apenasAtivos') || '1') === '1';

    const where: string[] = ['tenant_id = ?'];
    const params: any[] = [current.tenantId];

    if (idObraParam) {
      const idObra = Number(idObraParam);
      if (!Number.isInteger(idObra) || idObra <= 0) return fail(400, 'idObra inválido.');
      where.push('id_obra = ?');
      params.push(idObra);
    }

    if (tipoParam) {
      const tipo = normalizeTipo(tipoParam);
      if (!tipo) return fail(400, 'tipo inválido.');
      where.push('tipo = ?');
      params.push(tipo);
    }

    if (apenasAtivos) where.push('ativo = 1');

    const [rows]: any = await db.query(
      `
      SELECT
        id_responsavel_obra AS idResponsavelObra,
        id_obra AS idObra,
        tipo,
        nome,
        registro_profissional AS registroProfissional,
        cpf,
        email,
        telefone,
        ativo,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM obras_responsaveis
      WHERE ${where.join(' AND ')}
      ORDER BY id_obra, tipo, nome
      `,
      params
    );

    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idResponsavelObra: Number(r.idResponsavelObra),
        idObra: Number(r.idObra),
        ativo: Boolean(r.ativo),
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
    const body = await req.json().catch(() => null);
    const idObra = Number(body?.idObra || 0);
    const tipo = normalizeTipo(body?.tipo);
    const nome = String(body?.nome || '').trim();
    const registroProfissional = body?.registroProfissional ? String(body.registroProfissional).trim() : null;
    const cpf = body?.cpf ? String(body.cpf).trim() : null;
    const email = body?.email ? String(body.email).trim() : null;
    const telefone = body?.telefone ? String(body.telefone).trim() : null;
    const ativo = body?.ativo === undefined ? true : Boolean(body.ativo);

    if (!Number.isInteger(idObra) || idObra <= 0) return fail(422, 'idObra inválido.');
    if (!tipo) return fail(422, 'tipo é obrigatório (RESPONSAVEL_TECNICO|FISCAL_OBRA).');
    if (!nome) return fail(422, 'nome é obrigatório.');

    await ensureTables();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO obras_responsaveis
        (tenant_id, id_obra, tipo, nome, registro_profissional, cpf, email, telefone, ativo)
      VALUES
        (?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        idObra,
        tipo,
        nome.slice(0, 255),
        registroProfissional ? registroProfissional.slice(0, 64) : null,
        cpf ? cpf.slice(0, 20) : null,
        email ? email.slice(0, 120) : null,
        telefone ? telefone.slice(0, 40) : null,
        ativo ? 1 : 0,
      ]
    );
    await conn.commit();
    return ok({ idResponsavelObra: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
