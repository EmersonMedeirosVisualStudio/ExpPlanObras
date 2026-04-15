import { db } from '@/lib/db';
import { ApiError, created, fail, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureEmpresaParceiraPadrao(tenantId: number) {
  const [[row]]: any = await db.query(
    `SELECT id_empresa_parceira id FROM terceirizados_empresas_parceiras WHERE tenant_id = ? ORDER BY id_empresa_parceira ASC LIMIT 1`,
    [tenantId]
  );
  if (row?.id) return Number(row.id);

  const [result]: any = await db.execute(
    `INSERT INTO terceirizados_empresas_parceiras (tenant_id, razao_social, cnpj, telefone, email, ativo)
     VALUES (?, ?, NULL, NULL, NULL, 1)`,
    [tenantId, 'Não informado']
  );
  return Number(result.insertId);
}

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();

    await ensureEmpresaParceiraPadrao(current.tenantId);

    let sql = `
      SELECT
        t.id_terceirizado_trabalhador id,
        t.nome_completo nomeCompleto,
        t.funcao,
        t.ativo,
        t.id_empresa_parceira idEmpresaParceira,
        ep.razao_social empresaParceira
      FROM terceirizados_trabalhadores t
      JOIN terceirizados_empresas_parceiras ep ON ep.id_empresa_parceira = t.id_empresa_parceira
      WHERE t.tenant_id = ?
    `;
    const params: any[] = [current.tenantId];

    if (q) {
      sql += ` AND (t.nome_completo LIKE ? OR COALESCE(t.funcao,'') LIKE ? OR COALESCE(ep.razao_social,'') LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ` ORDER BY t.nome_completo`;

    const [rows]: any = await db.query(sql, params);
    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const body = (await req.json().catch(() => null)) as any;

    const nomeCompleto = String(body?.nomeCompleto || '').trim();
    const funcao = body?.funcao ? String(body.funcao).trim() : null;
    const ativo = body?.ativo === false ? 0 : 1;
    const idEmpresaParceira = body?.idEmpresaParceira ? Number(body.idEmpresaParceira) : await ensureEmpresaParceiraPadrao(current.tenantId);

    if (nomeCompleto.length < 3) return fail(422, 'Nome completo é obrigatório');
    if (!Number.isFinite(idEmpresaParceira) || idEmpresaParceira <= 0) throw new ApiError(422, 'Empresa parceira inválida');

    const [[empresa]]: any = await db.query(
      `SELECT id_empresa_parceira id FROM terceirizados_empresas_parceiras WHERE tenant_id = ? AND id_empresa_parceira = ? AND ativo = 1 LIMIT 1`,
      [current.tenantId, idEmpresaParceira]
    );
    if (!empresa) throw new ApiError(404, 'Empresa parceira não encontrada');

    const [result]: any = await db.execute(
      `INSERT INTO terceirizados_trabalhadores
       (tenant_id, id_empresa_parceira, nome_completo, cpf, funcao, cbo_codigo, telefone, ativo)
       VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?)`,
      [current.tenantId, idEmpresaParceira, nomeCompleto, funcao, ativo]
    );

    return created({ id: result.insertId }, 'Terceirizado criado com sucesso.');
  } catch (e) {
    return handleApiError(e);
  }
}

