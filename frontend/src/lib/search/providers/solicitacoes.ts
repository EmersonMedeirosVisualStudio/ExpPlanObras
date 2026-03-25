import { db } from '@/lib/db';
import { normalizeSearchText } from '../normalize';
import type { SearchDocumentInput, SearchIndexProvider } from '../types';
import { upsertSearchDocument } from '../server';

function buildDoc(row: any): SearchDocumentInput {
  const id = Number(row.id);
  const status = row?.statusSolicitacao ? String(row.statusSolicitacao) : null;
  const urg = row?.regimeUrgencia ? String(row.regimeUrgencia) : null;
  const titulo = `Solicitação #${id}`;
  const subtitulo = [status ? `Status ${status}` : null, urg ? `Urgência ${urg}` : null].filter(Boolean).join(' • ');
  const termos = normalizeSearchText([titulo, status, urg, String(id)].filter(Boolean).join(' '));
  return {
    tenantId: Number(row.tenantId),
    modulo: 'SUPRIMENTOS',
    entidadeTipo: 'SOLICITACAO_MATERIAL',
    entidadeId: id,
    titulo,
    subtitulo: subtitulo || null,
    codigoReferencia: String(id),
    statusReferencia: status,
    rota: `/dashboard/suprimentos/solicitacoes?id=${id}`,
    resumoTexto: null,
    termosBusca: termos,
    palavrasChave: null,
    permissaoView: 'dashboard.suprimentos.view',
    idDiretoria: null,
    idObra: row?.idObra ? Number(row.idObra) : null,
    idUnidade: row?.idUnidade ? Number(row.idUnidade) : null,
    ativo: true,
    atualizadoEmOrigem: row?.updatedAt ? new Date(row.updatedAt) : null,
  };
}

export const solicitacoesSearchProvider: SearchIndexProvider = {
  entidadeTipo: 'SOLICITACAO_MATERIAL',
  modulo: 'SUPRIMENTOS',
  permissaoView: 'dashboard.suprimentos.view',
  async reindexEntity(tenantId, entityId) {
    const [[row]]: any = await db.query(
      `
      SELECT
        tenant_id AS tenantId,
        id_solicitacao_material AS id,
        status_solicitacao AS statusSolicitacao,
        regime_urgencia AS regimeUrgencia,
        id_obra_origem AS idObra,
        id_unidade_origem AS idUnidade,
        updated_at AS updatedAt
      FROM solicitacao_material
      WHERE tenant_id = ? AND id_solicitacao_material = ?
      LIMIT 1
      `,
      [tenantId, entityId]
    );
    if (!row) return;
    await upsertSearchDocument(buildDoc(row));
  },
  async reindexAll(tenantId) {
    const [rows]: any = await db.query(
      `
      SELECT
        tenant_id AS tenantId,
        id_solicitacao_material AS id,
        status_solicitacao AS statusSolicitacao,
        regime_urgencia AS regimeUrgencia,
        id_obra_origem AS idObra,
        id_unidade_origem AS idUnidade,
        updated_at AS updatedAt
      FROM solicitacao_material
      WHERE tenant_id = ?
      ORDER BY id_solicitacao_material ASC
      `,
      [tenantId]
    );
    for (const r of rows as any[]) {
      await upsertSearchDocument(buildDoc(r));
    }
  },
};

