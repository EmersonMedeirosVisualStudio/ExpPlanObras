import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { buildLocalFilter } from '@/lib/api/local-filter';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_PAINEL_VIEW);
    const local = buildLocalFilter(req.nextUrl.searchParams);
    const localTurma = buildLocalFilter(req.nextUrl.searchParams, 't');
    const localEpi = buildLocalFilter(req.nextUrl.searchParams, 'f');

    const [ncs]: any = await db.query(
      `
      SELECT
        'NC_CRITICA' AS tipo,
        CONCAT('NC crítica aberta: ', titulo) AS titulo,
        CONCAT('Severidade ', severidade, ' / prazo ', COALESCE(DATE_FORMAT(prazo_correcao, '%d/%m/%Y'), '-')) AS subtitulo,
        id_nc AS referenciaId
      FROM sst_nao_conformidades
      WHERE tenant_id = ?
        AND status_nc IN ('ABERTA','EM_TRATAMENTO','AGUARDANDO_VALIDACAO')
        AND severidade IN ('ALTA','CRITICA')
        ${local.sql}
      ORDER BY created_at DESC
      LIMIT 10
      `,
      [current.tenantId, ...local.params]
    );

    const [cats]: any = await db.query(
      `
      SELECT
        'CAT_PENDENTE' AS tipo,
        CONCAT('CAT pendente: ocorrência #', id_acidente) AS titulo,
        CONCAT(tipo_ocorrencia, ' / ', DATE_FORMAT(data_hora_ocorrencia, '%d/%m/%Y %H:%i')) AS subtitulo,
        id_acidente AS referenciaId
      FROM sst_acidentes
      WHERE tenant_id = ?
        AND cat_aplicavel = 1
        AND cat_registrada = 0
        AND status_acidente IN ('ABERTO','EM_INVESTIGACAO','AGUARDANDO_VALIDACAO')
        ${local.sql}
      ORDER BY data_hora_ocorrencia DESC
      LIMIT 10
      `,
      [current.tenantId, ...local.params]
    );

    const [trein]: any = await db.query(
      `
      SELECT
        'TREINAMENTO_VENCIDO' AS tipo,
        CONCAT('Treinamento vencido: ', COALESCE(f.nome_completo, tt.nome_completo)) AS titulo,
        CONCAT(tm.nome_treinamento, ' / validade ', DATE_FORMAT(p.validade_ate, '%d/%m/%Y')) AS subtitulo,
        p.id_treinamento_participante AS referenciaId
      FROM sst_treinamentos_participantes p
      INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
      INNER JOIN sst_treinamentos_modelos tm ON tm.id_treinamento_modelo = t.id_treinamento_modelo
      LEFT JOIN funcionarios f ON f.id_funcionario = p.id_funcionario AND f.tenant_id = t.tenant_id
      LEFT JOIN terceirizados_trabalhadores tt ON tt.id_terceirizado_trabalhador = p.id_terceirizado_trabalhador AND tt.tenant_id = t.tenant_id
      WHERE t.tenant_id = ?
        AND p.validade_ate IS NOT NULL
        AND p.validade_ate < CURDATE()
        ${localTurma.sql}
      ORDER BY p.validade_ate ASC
      LIMIT 10
      `,
      [current.tenantId, ...localTurma.params]
    );

    const [epi]: any = await db.query(
      `
      SELECT
        'EPI_TROCA' AS tipo,
        CONCAT('Troca de EPI vencida: ', c.nome_epi) AS titulo,
        CONCAT('Prevista para ', DATE_FORMAT(i.data_prevista_troca, '%d/%m/%Y')) AS subtitulo,
        i.id_ficha_epi_item AS referenciaId
      FROM sst_epi_fichas_itens i
      INNER JOIN sst_epi_fichas f ON f.id_ficha_epi = i.id_ficha_epi
      INNER JOIN sst_epi_catalogo c ON c.id_epi = i.id_epi
      WHERE f.tenant_id = ?
        AND i.status_item = 'ENTREGUE'
        AND i.data_prevista_troca IS NOT NULL
        AND i.data_prevista_troca < CURDATE()
        ${localEpi.sql}
      ORDER BY i.data_prevista_troca ASC
      LIMIT 10
      `,
      [current.tenantId, ...localEpi.params]
    );

    return ok([...(ncs as any[]), ...(cats as any[]), ...(trein as any[]), ...(epi as any[])].slice(0, 20));
  } catch (e) {
    return handleApiError(e);
  }
}

