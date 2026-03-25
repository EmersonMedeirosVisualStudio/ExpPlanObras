import { db } from '@/lib/db';
import { normalizeSearchText } from '../normalize';
import type { SearchDocumentInput, SearchIndexProvider } from '../types';
import { upsertSearchDocument } from '../server';

function buildDoc(row: any): SearchDocumentInput {
  const id = Number(row.id);
  const numero = row?.numeroContrato ? String(row.numeroContrato) : String(id);
  const status = row?.statusContrato ? String(row.statusContrato) : null;
  const titulo = `Contrato ${numero}`;
  const subtitulo = [status ? `Status ${status}` : null, row?.valorContratado ? `R$ ${row.valorContratado}` : null].filter(Boolean).join(' • ');
  const termos = normalizeSearchText([titulo, numero, status, String(id)].filter(Boolean).join(' '));
  return {
    tenantId: Number(row.tenantId),
    modulo: 'ENGENHARIA',
    entidadeTipo: 'CONTRATO',
    entidadeId: id,
    titulo,
    subtitulo: subtitulo || null,
    codigoReferencia: numero,
    statusReferencia: status,
    rota: `/dashboard/contratos?id=${id}`,
    resumoTexto: null,
    termosBusca: termos,
    palavrasChave: null,
    permissaoView: 'dashboard.engenharia.view',
    idDiretoria: row?.idDiretoria ? Number(row.idDiretoria) : null,
    idObra: null,
    idUnidade: null,
    ativo: true,
    atualizadoEmOrigem: row?.updatedAt ? new Date(row.updatedAt) : null,
  };
}

export const contratosSearchProvider: SearchIndexProvider = {
  entidadeTipo: 'CONTRATO',
  modulo: 'ENGENHARIA',
  permissaoView: 'dashboard.engenharia.view',
  async reindexEntity(tenantId, entityId) {
    const [[row]]: any = await db.query(
      `
      SELECT
        tenant_id AS tenantId,
        id_contrato AS id,
        numero_contrato AS numeroContrato,
        status_contrato AS statusContrato,
        valor_contratado AS valorContratado,
        id_setor_diretoria AS idDiretoria,
        atualizado_em AS updatedAt
      FROM contratos
      WHERE tenant_id = ? AND id_contrato = ?
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
        id_contrato AS id,
        numero_contrato AS numeroContrato,
        status_contrato AS statusContrato,
        valor_contratado AS valorContratado,
        id_setor_diretoria AS idDiretoria,
        atualizado_em AS updatedAt
      FROM contratos
      WHERE tenant_id = ?
      ORDER BY id_contrato ASC
      `,
      [tenantId]
    );
    for (const r of rows as any[]) {
      await upsertSearchDocument(buildDoc(r));
    }
  },
};

