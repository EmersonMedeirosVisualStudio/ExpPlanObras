import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RELATORIOS_AGENDADOS_VIEW);
    const { id } = await context.params;
    const agendamentoId = Number(id);
    if (!Number.isFinite(agendamentoId)) return fail(400, 'ID inválido');

    try {
      const [rows]: any = await db.query(
        `
        SELECT
          e.id_relatorio_agendamento_execucao AS id,
          e.status_execucao AS status,
          e.iniciado_em AS iniciadoEm,
          e.finalizado_em AS finalizadoEm,
          e.mensagem_resultado AS mensagemResultado,
          e.total_destinatarios AS totalDestinatarios,
          e.total_emails_enfileirados AS totalEmailsEnfileirados,
          e.total_arquivos AS totalArquivos,
          e.execucao_manual AS execucaoManual
        FROM relatorios_agendamentos_execucoes e
        WHERE e.tenant_id = ? AND e.id_relatorio_agendamento = ?
        ORDER BY e.id_relatorio_agendamento_execucao DESC
        LIMIT 50
        `,
        [current.tenantId, agendamentoId]
      );

      const execIds = (rows as any[]).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
      let arquivos: any[] = [];
      if (execIds.length) {
        const [arqs]: any = await db.query(
          `
          SELECT
            id_relatorio_execucao_arquivo AS id,
            id_relatorio_agendamento_execucao AS execucaoId,
            formato_arquivo AS formato,
            nome_arquivo AS nomeArquivo,
            storage_path AS storagePath,
            tamanho_bytes AS tamanhoBytes
          FROM relatorios_agendamentos_execucoes_arquivos
          WHERE tenant_id = ? AND id_relatorio_agendamento_execucao IN (${execIds.map(() => '?').join(',')})
          ORDER BY id_relatorio_execucao_arquivo DESC
          `,
          [current.tenantId, ...execIds]
        );
        arquivos = arqs as any[];
      }

      const map = new Map<number, any[]>();
      for (const a of arquivos) {
        const k = Number(a.execucaoId);
        map.set(k, [...(map.get(k) || []), a]);
      }

      return ok((rows as any[]).map((e) => ({ ...e, arquivos: map.get(Number(e.id)) || [] })));
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

