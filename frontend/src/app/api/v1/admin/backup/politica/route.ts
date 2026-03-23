import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireCurrentEncarregado } from '@/lib/api/encarregado-authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.BACKUP_VIEW);

    const [[row]]: any = await db.query(
      `SELECT id_backup_politica id,
              periodicidade,
              hora_execucao horaExecucao,
              dia_semana diaSemana,
              retencao_dias retencaoDias,
              ativo
       FROM backup_politicas_tenant
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY id_backup_politica DESC
       LIMIT 1`,
      [user.tenantId]
    );

    return ok(row ?? null);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireCurrentEncarregado(PERMISSIONS.BACKUP_EDIT);
    const body = await req.json();

    if (!body.periodicidade || !body.horaExecucao) {
      throw new ApiError(400, 'Periodicidade e hora de execução são obrigatórias.');
    }
    if (body.periodicidade === 'SEMANAL' && !body.diaSemana) {
      throw new ApiError(400, 'Dia da semana é obrigatório para periodicidade semanal.');
    }
    if (!body.retencaoDias || body.retencaoDias < 7) {
      throw new ApiError(400, 'A retenção mínima recomendada é de 7 dias.');
    }

    await db.execute(`UPDATE backup_politicas_tenant SET ativo = 0 WHERE tenant_id = ? AND ativo = 1`, [user.tenantId]);

    const [result]: any = await db.execute(
      `INSERT INTO backup_politicas_tenant
        (tenant_id, periodicidade, hora_execucao, dia_semana, retencao_dias, ativo, configurado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.tenantId,
        body.periodicidade,
        body.horaExecucao,
        body.periodicidade === 'SEMANAL' ? body.diaSemana : null,
        body.retencaoDias,
        body.ativo ?? true,
        user.id,
      ]
    );

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'backup_politicas_tenant',
      idRegistro: String(result.insertId),
      acao: 'UPSERT_POLITICA_BACKUP',
      dadosNovos: body,
    });

    return ok({ id: result.insertId }, 'Política de backup salva com sucesso.');
  } catch (error) {
    return handleApiError(error);
  }
}
