import { fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_VIEW);
    const { id } = await context.params;
    const arquivoId = Number(id);
    if (!Number.isFinite(arquivoId)) return fail(400, 'ID inválido');

    const [[row]]: any = await db.query(
      `
      SELECT formato_arquivo AS formato, nome_arquivo AS nome, conteudo_blob AS blob
      FROM relatorios_agendamentos_execucoes_arquivos
      WHERE tenant_id = ? AND id_relatorio_execucao_arquivo = ?
      LIMIT 1
      `,
      [current.tenantId, arquivoId]
    );
    if (!row) return fail(404, 'Arquivo não encontrado');
    if (!row.blob) return fail(404, 'Arquivo indisponível');

    const formato = String(row.formato);
    const contentType =
      formato === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    return new Response(row.blob as Buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${String(row.nome || 'relatorio')}"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

