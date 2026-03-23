import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.GOVERNANCA_PERFIS_CRUD);
    const { id } = await context.params;
    const body = await req.json();

    const [[perfil]]: any = await conn.query(
      `SELECT * FROM perfis WHERE id_perfil = ? AND tenant_id = ?`,
      [id, user.tenantId]
    );
    if (!perfil) throw new ApiError(404, 'Perfil não encontrado.');
    if (perfil.tipo_perfil !== 'EMPRESA') throw new ApiError(403, 'Perfil base não pode ser editado.');

    await conn.beginTransaction();
    await conn.execute(`UPDATE perfis SET nome = ?, codigo = ?, ativo = ? WHERE id_perfil = ?`, [body.nome, body.codigo, body.ativo ?? true, id]);
    await conn.execute(`DELETE FROM perfil_permissoes WHERE id_perfil = ?`, [id]);

    for (const permissao of body.permissoes ?? []) {
      await conn.execute(
        `INSERT INTO perfil_permissoes (id_perfil, modulo, janela, acao, permitido)
         VALUES (?, ?, ?, ?, 1)`,
        [id, permissao.modulo, permissao.janela, permissao.acao]
      );
    }

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'perfis',
      idRegistro: String(id),
      acao: 'UPDATE',
      dadosAnteriores: perfil,
      dadosNovos: body,
    });

    await conn.commit();
    return ok(null, 'Perfil atualizado com sucesso.');
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
