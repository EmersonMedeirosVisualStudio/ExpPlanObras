import { db } from '@/lib/db';
import { normalizeSearchText } from '../normalize';
import type { SearchDocumentInput, SearchIndexProvider } from '../types';
import { upsertSearchDocument } from '../server';

function buildDoc(row: any): SearchDocumentInput {
  const id = Number(row.id);
  const status = row?.statusObra ? String(row.statusObra) : null;
  const contrato = row?.numeroContrato ? String(row.numeroContrato) : '';
  const titulo = row?.nomeObra ? String(row.nomeObra) : `Obra #${id}`;
  const subtitulo = [contrato ? `Contrato ${contrato}` : null, status ? `Status ${status}` : null].filter(Boolean).join(' • ');
  const termos = normalizeSearchText([titulo, contrato, status, String(id)].filter(Boolean).join(' '));
  return {
    tenantId: Number(row.tenantId),
    modulo: 'ENGENHARIA',
    entidadeTipo: 'OBRA',
    entidadeId: id,
    titulo,
    subtitulo: subtitulo || null,
    codigoReferencia: String(id),
    statusReferencia: status,
    rota: `/dashboard/obras?id=${id}`,
    resumoTexto: null,
    termosBusca: termos,
    palavrasChave: null,
    permissaoView: 'obras.view',
    idDiretoria: row?.idDiretoria ? Number(row.idDiretoria) : null,
    idObra: id,
    idUnidade: null,
    ativo: row?.ativo ? true : true,
    atualizadoEmOrigem: row?.updatedAt ? new Date(row.updatedAt) : null,
  };
}

export const obrasSearchProvider: SearchIndexProvider = {
  entidadeTipo: 'OBRA',
  modulo: 'ENGENHARIA',
  permissaoView: 'obras.view',
  async reindexEntity(tenantId, entityId) {
    const [[row]]: any = await db.query(
      `
      SELECT
        c.tenant_id AS tenantId,
        o.id_obra AS id,
        o.status_obra AS statusObra,
        o.data_inicio AS updatedAt,
        o.ativo AS ativo,
        c.numero_contrato AS numeroContrato,
        c.id_setor_diretoria AS idDiretoria,
        CONCAT('Obra #', o.id_obra) AS nomeObra
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ? AND o.id_obra = ?
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
        c.tenant_id AS tenantId,
        o.id_obra AS id,
        o.status_obra AS statusObra,
        o.data_inicio AS updatedAt,
        o.ativo AS ativo,
        c.numero_contrato AS numeroContrato,
        c.id_setor_diretoria AS idDiretoria,
        CONCAT('Obra #', o.id_obra) AS nomeObra
      FROM obras o
      INNER JOIN contratos c ON c.id_contrato = o.id_contrato
      WHERE c.tenant_id = ?
      ORDER BY o.id_obra ASC
      `,
      [tenantId]
    );
    for (const r of rows as any[]) {
      await upsertSearchDocument(buildDoc(r));
    }
  },
};

