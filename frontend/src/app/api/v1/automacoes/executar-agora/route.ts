import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { detectarPendenciasSla, gerarInstanciasTarefasRecorrentes, processarCobrancasPendentes } from '@/lib/modules/automacoes/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.AUTOMACOES_EXECUTAR);
    const body = (await req.json().catch(() => null)) as { tipo?: 'TAREFAS' | 'SLA' | 'COBRANCA' } | null;
    const tipo = body?.tipo;
    if (!tipo) return fail(422, 'tipo obrigatório');

    if (tipo === 'TAREFAS') {
      await gerarInstanciasTarefasRecorrentes({ tenantId: current.tenantId, executorUserId: current.id, manual: true });
      return ok(null);
    }
    if (tipo === 'SLA') {
      await detectarPendenciasSla({ tenantId: current.tenantId, userId: current.id, manual: true });
      return ok(null);
    }
    await processarCobrancasPendentes({ tenantId: current.tenantId, userId: current.id, manual: true });
    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

