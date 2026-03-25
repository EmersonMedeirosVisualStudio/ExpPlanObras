import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { db } from '@/lib/db';
import { alterarStatusInstancia } from '@/lib/modules/automacoes/server';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedApiUser();
    await requireApiPermission(PERMISSIONS.AUTOMACOES_VIEW);
    const { id } = await ctx.params;
    const taskId = Number(id);
    if (!Number.isFinite(taskId)) return fail(400, 'ID inválido');
    const [[row]]: any = await db.query(
      `SELECT id_usuario_atribuido AS idUsuarioAtribuido FROM automacoes_tarefas_instancias WHERE tenant_id = ? AND id_automacao_tarefa_instancia = ? LIMIT 1`,
      [user.tenantId, taskId]
    );
    if (!row) return fail(404, 'Tarefa não encontrada');
    const idUsuarioAtribuido = row.idUsuarioAtribuido !== null ? Number(row.idUsuarioAtribuido) : null;
    if (idUsuarioAtribuido !== user.id) {
      const perms = await getCurrentUserPermissions(user.id);
      if (!perms.includes(PERMISSIONS.AUTOMACOES_CRUD)) return fail(403, 'Sem permissão para alterar esta tarefa');
    }
    const body = (await req.json().catch(() => null)) as { acao?: 'INICIAR' | 'CONCLUIR' | 'CANCELAR'; observacao?: string } | null;
    const acao = body?.acao;
    if (!acao) return fail(422, 'Ação obrigatória');
    await alterarStatusInstancia({ tenantId: user.tenantId, id: taskId, userId: user.id, acao, observacao: body?.observacao });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

