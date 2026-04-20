import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { canAccessObra } from '@/lib/auth/access';

export const runtime = 'nodejs';

// Inicialização da tabela caso não exista
async function initTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS engenharia_pes_cenarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      id_obra INT NOT NULL,
      nome VARCHAR(255) NOT NULL,
      tipo VARCHAR(50) DEFAULT 'MANUAL',
      dados JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX(tenant_id, id_obra)
    )
  `);
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ENG_PES_VIEW);

    const { searchParams } = new URL(req.url);
    const idObraStr = searchParams.get('idObra');
    if (!idObraStr) return fail(400, 'idObra é obrigatório.');

    const idObra = parseInt(idObraStr, 10);
    if (!canAccessObra(current as any, idObra)) return fail(403, 'Acesso negado a esta obra.');

    await initTable();

    const [rows]: any = await db.query(
      `SELECT id, nome, tipo, dados, created_at as createdAt, updated_at as updatedAt 
       FROM engenharia_pes_cenarios 
       WHERE tenant_id = ? AND id_obra = ? 
       ORDER BY updated_at DESC`,
      [current.tenantId, idObra]
    );

    const formattedRows = rows.map((r: any) => ({
      ...r,
      dados: typeof r.dados === 'string' ? JSON.parse(r.dados) : r.dados
    }));

    return ok(formattedRows || []);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.ENG_PES_EDIT);

    const body = await req.json();
    const { idObra, nome, tipo, dados } = body;

    if (!idObra || !nome || !dados) {
      return fail(400, 'idObra, nome e dados são obrigatórios.');
    }

    if (!canAccessObra(current as any, idObra)) return fail(403, 'Acesso negado a esta obra.');

    await initTable();

    const [result]: any = await db.query(
      `INSERT INTO engenharia_pes_cenarios (tenant_id, id_obra, nome, tipo, dados) 
       VALUES (?, ?, ?, ?, ?)`,
      [current.tenantId, idObra, nome, tipo || 'MANUAL', JSON.stringify(dados)]
    );

    return ok({ id: result.insertId, message: 'Cenário salvo com sucesso.' });
  } catch (error) {
    return handleApiError(error);
  }
}
