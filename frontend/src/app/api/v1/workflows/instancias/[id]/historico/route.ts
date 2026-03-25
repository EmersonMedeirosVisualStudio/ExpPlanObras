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
    const current = await requireApiPermission(PERMISSIONS.WORKFLOWS_AUDITORIA);
    const { id } = await ctx.params;
    const instanciaId = Number(id);
    if (!Number.isFinite(instanciaId)) return fail(400, 'ID inválido');

    const [rows]: any = await db.query(
      `
      SELECT
        id_workflow_instancia_historico AS id,
        chave_estado_anterior AS chaveEstadoAnterior,
        chave_estado_novo AS chaveEstadoNovo,
        acao_executada AS acaoExecutada,
        parecer,
        id_usuario_evento AS idUsuarioEvento,
        id_assinatura_registro AS idAssinaturaRegistro,
        criado_em AS criadoEm
      FROM workflows_instancias_historico
      WHERE tenant_id = ? AND id_workflow_instancia = ?
      ORDER BY id_workflow_instancia_historico ASC
      `,
      [current.tenantId, instanciaId]
    );

    return ok(
      (rows as any[]).map((r) => ({
        id: Number(r.id),
        chaveEstadoAnterior: r.chaveEstadoAnterior ? String(r.chaveEstadoAnterior) : null,
        chaveEstadoNovo: String(r.chaveEstadoNovo),
        acaoExecutada: r.acaoExecutada ? String(r.acaoExecutada) : null,
        parecer: r.parecer ? String(r.parecer) : null,
        idUsuarioEvento: r.idUsuarioEvento !== null ? Number(r.idUsuarioEvento) : null,
        idAssinaturaRegistro: r.idAssinaturaRegistro !== null ? Number(r.idAssinaturaRegistro) : null,
        criadoEm: toIso(r.criadoEm),
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

