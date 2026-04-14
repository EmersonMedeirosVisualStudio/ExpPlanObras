import { db } from '@/lib/db';
import { normalizeSearchText } from '../normalize';
import type { SearchDocumentInput, SearchIndexProvider } from '../types';
import { upsertSearchDocument } from '../server';

function buildDoc(row: any): SearchDocumentInput {
  const tipoLotacao = row?.tipoLotacao ? String(row.tipoLotacao) : null;
  const idObra = tipoLotacao === 'OBRA' ? Number(row.idObra || 0) : null;
  const idUnidade = tipoLotacao === 'UNIDADE' ? Number(row.idUnidade || 0) : null;
  const matricula = row?.matricula ? String(row.matricula) : '';
  const cpf = row?.cpf ? String(row.cpf) : '';
  const cargo = row?.cargoContratual ? String(row.cargoContratual) : '';
  const funcao = row?.funcaoPrincipal ? String(row.funcaoPrincipal) : '';
  const nome = row?.nomeCompleto ? `@${row.id} funcionario - ${String(row.nomeCompleto)}` : `@${row.id} funcionario`;
  const subtitulo = [matricula ? `Matrícula ${matricula}` : null, cargo || funcao ? `${cargo}${cargo && funcao ? ' • ' : ''}${funcao}` : null]
    .filter(Boolean)
    .join(' • ');

  const termos = normalizeSearchText([nome, matricula, cpf, cargo, funcao].filter(Boolean).join(' '));
  return {
    tenantId: Number(row.tenantId),
    modulo: 'RH',
    entidadeTipo: 'FUNCIONARIO',
    entidadeId: Number(row.id),
    titulo: nome,
    subtitulo: subtitulo || null,
    codigoReferencia: matricula || null,
    statusReferencia: row?.statusFuncional ? String(row.statusFuncional) : null,
    rota: `/dashboard/rh/funcionarios?id=${Number(row.id)}`,
    resumoTexto: null,
    termosBusca: termos,
    palavrasChave: cpf ? cpf.replace(/\D/g, '') : null,
    permissaoView: 'rh.funcionarios.view',
    idDiretoria: null,
    idObra: idObra && idObra > 0 ? idObra : null,
    idUnidade: idUnidade && idUnidade > 0 ? idUnidade : null,
    ativo: row?.ativo ? true : false,
    atualizadoEmOrigem: row?.updatedAt ? new Date(row.updatedAt) : null,
  };
}

export const funcionariosSearchProvider: SearchIndexProvider = {
  entidadeTipo: 'FUNCIONARIO',
  modulo: 'RH',
  permissaoView: 'rh.funcionarios.view',
  async reindexEntity(tenantId, entityId) {
    const [[row]]: any = await db.query(
      `
      SELECT
        f.tenant_id AS tenantId,
        f.id_funcionario AS id,
        f.matricula AS matricula,
        f.nome_completo AS nomeCompleto,
        f.cpf AS cpf,
        f.cargo_contratual AS cargoContratual,
        f.funcao_principal AS funcaoPrincipal,
        f.status_funcional AS statusFuncional,
        f.ativo AS ativo,
        f.atualizado_em AS updatedAt,
        fl.tipo_lotacao AS tipoLotacao,
        fl.id_obra AS idObra,
        fl.id_unidade AS idUnidade
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl
        ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ? AND f.id_funcionario = ?
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
        f.tenant_id AS tenantId,
        f.id_funcionario AS id,
        f.matricula AS matricula,
        f.nome_completo AS nomeCompleto,
        f.cpf AS cpf,
        f.cargo_contratual AS cargoContratual,
        f.funcao_principal AS funcaoPrincipal,
        f.status_funcional AS statusFuncional,
        f.ativo AS ativo,
        f.atualizado_em AS updatedAt,
        fl.tipo_lotacao AS tipoLotacao,
        fl.id_obra AS idObra,
        fl.id_unidade AS idUnidade
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl
        ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.tenant_id = ?
      ORDER BY f.id_funcionario ASC
      `,
      [tenantId]
    );
    for (const r of rows as any[]) {
      await upsertSearchDocument(buildDoc(r));
    }
  },
};

