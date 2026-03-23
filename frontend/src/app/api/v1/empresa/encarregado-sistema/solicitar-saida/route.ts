import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.ENCARREGADO_SISTEMA_SOLICITAR_SAIDA);
    const body = (await req.json().catch(() => null)) as any;
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : null;

    const [[atual]]: any = await db.query(
      `SELECT id_empresa_encarregado_sistema
       FROM empresa_encarregado_sistema
       WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
       ORDER BY data_inicio DESC
       LIMIT 1`,
      [user.tenantId, user.id]
    );
    if (!atual) throw new ApiError(403, 'Usuário não é o encarregado atual.');

    await db.execute(
      `UPDATE empresa_encarregado_sistema
       SET solicitou_saida = 1,
           data_solicitacao_saida = NOW(),
           motivo_solicitacao_saida = ?
       WHERE id_empresa_encarregado_sistema = ?`,
      [motivo, atual.id_empresa_encarregado_sistema]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'empresa_encarregado_sistema',
      idRegistro: String(atual.id_empresa_encarregado_sistema),
      acao: 'SOLICITAR_SAIDA',
      dadosNovos: { motivo },
    });

    return ok(null, 'Solicitação registrada com sucesso.');
  } catch (error) {
    return handleApiError(error);
  }
}
