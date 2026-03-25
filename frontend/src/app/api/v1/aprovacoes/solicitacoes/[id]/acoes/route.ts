import { handleApiError, ok, fail } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { decidirSolicitacaoAprovacao, enviarSolicitacaoAprovacao } from '@/lib/modules/aprovacoes/server';
import type { AssinaturaInputDTO } from '@/lib/modules/aprovacoes/types';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.APROVACOES_VIEW);
    const { id } = await ctx.params;
    const solicitacaoId = Number(id);
    if (!Number.isFinite(solicitacaoId)) return fail(400, 'ID inválido');

    const body = (await req.json().catch(() => null)) as { acao?: string; parecer?: string; assinatura?: AssinaturaInputDTO } | null;
    const acao = String(body?.acao || '').toUpperCase();

    if (acao === 'ENVIAR') {
      await enviarSolicitacaoAprovacao({ tenantId: current.tenantId, solicitacaoId, userId: current.id });
      return ok(null);
    }

    await requireApiPermission(PERMISSIONS.APROVACOES_DECIDIR);
    await requireApiPermission(PERMISSIONS.APROVACOES_ASSINAR);

    if (!['APROVAR', 'REJEITAR', 'DEVOLVER'].includes(acao)) return fail(422, 'acao inválida');

    await decidirSolicitacaoAprovacao({
      tenantId: current.tenantId,
      solicitacaoId,
      userId: current.id,
      acao: acao as any,
      parecer: body?.parecer ?? null,
      assinatura: body?.assinatura ?? null,
      reqIp: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

