import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function toIso(v: any): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.APROVACOES_AUDITORIA);
    const { id } = await ctx.params;
    const solicitacaoId = Number(id);
    if (!Number.isFinite(solicitacaoId)) return fail(400, 'ID inválido');

    const [rows]: any = await db.query(
      `
      SELECT
        id_aprovacao_historico AS id,
        status_anterior AS statusAnterior,
        status_novo AS statusNovo,
        descricao_evento AS descricaoEvento,
        id_usuario_evento AS idUsuarioEvento,
        criado_em AS criadoEm
      FROM aprovacoes_historico
      WHERE tenant_id = ? AND id_aprovacao_solicitacao = ?
      ORDER BY id_aprovacao_historico ASC
      `,
      [current.tenantId, solicitacaoId]
    );

    return ok(
      (rows as any[]).map((r) => ({
        id: Number(r.id),
        statusAnterior: r.statusAnterior ? String(r.statusAnterior) : null,
        statusNovo: String(r.statusNovo),
        descricaoEvento: String(r.descricaoEvento),
        idUsuarioEvento: r.idUsuarioEvento !== null ? Number(r.idUsuarioEvento) : null,
        criadoEm: toIso(r.criadoEm) || null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

