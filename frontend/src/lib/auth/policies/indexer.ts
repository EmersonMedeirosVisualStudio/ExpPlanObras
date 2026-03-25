import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/http';
import type { PolicyResource } from './types';

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes('seguranca_recursos_indice') || msg.includes("doesn't exist") || msg.includes('unknown')) {
    throw new ApiError(501, 'Banco sem tabelas do índice de segurança. Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

export async function upsertSecurityResourceIndex(args: {
  tenantId: number;
  recurso: PolicyResource;
  entidadeId: number;
  idEmpresaParceira?: number | null;
  diretoriaId?: number | null;
  tipoLocal?: 'OBRA' | 'UNIDADE' | null;
  idObra?: number | null;
  idUnidade?: number | null;
  creatorUserId?: number | null;
  responsibleUserId?: number | null;
  ownerUserId?: number | null;
  status?: string | null;
  value?: number | null;
  confidentiality?: string | null;
  atributos?: Record<string, unknown> | null;
  atualizadoEmOrigem?: Date | null;
}) {
  try {
    await db.query(
      `
      INSERT INTO seguranca_recursos_indice
        (tenant_id, recurso, entidade_id, id_setor_diretoria, tipo_local, id_obra, id_unidade, id_empresa_parceira,
         id_usuario_criador, id_usuario_responsavel, id_usuario_proprietario,
         status_referencia, valor_referencia, confidencialidade, atributos_json, atualizado_em_origem)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        id_setor_diretoria = VALUES(id_setor_diretoria),
        tipo_local = VALUES(tipo_local),
        id_obra = VALUES(id_obra),
        id_unidade = VALUES(id_unidade),
        id_empresa_parceira = VALUES(id_empresa_parceira),
        id_usuario_criador = VALUES(id_usuario_criador),
        id_usuario_responsavel = VALUES(id_usuario_responsavel),
        id_usuario_proprietario = VALUES(id_usuario_proprietario),
        status_referencia = VALUES(status_referencia),
        valor_referencia = VALUES(valor_referencia),
        confidencialidade = VALUES(confidencialidade),
        atributos_json = VALUES(atributos_json),
        atualizado_em_origem = VALUES(atualizado_em_origem),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [
        args.tenantId,
        args.recurso,
        args.entidadeId,
        args.diretoriaId ?? null,
        args.tipoLocal ?? null,
        args.idObra ?? null,
        args.idUnidade ?? null,
        args.idEmpresaParceira ?? null,
        args.creatorUserId ?? null,
        args.responsibleUserId ?? null,
        args.ownerUserId ?? null,
        args.status ?? null,
        args.value ?? null,
        args.confidentiality ?? null,
        args.atributos ? JSON.stringify(args.atributos) : null,
        args.atualizadoEmOrigem ? args.atualizadoEmOrigem : null,
      ]
    );
    return { ok: true };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export async function rebuildSecurityIndexForTenant(args: { tenantId: number; recursos?: PolicyResource[] }) {
  const tenantId = args.tenantId;
  const recursos = args.recursos && args.recursos.length ? args.recursos : (['DOCUMENTO', 'SST_NC', 'SUP_SOLICITACAO', 'ENG_MEDICAO'] as PolicyResource[]);

  const out: Record<string, number> = {};
  for (const r of recursos) out[r] = 0;

  try {
    if (recursos.includes('DOCUMENTO')) {
      const [rows]: any = await db.query(
        `
        SELECT
          d.id_documento_registro AS id,
          d.entidade_tipo AS entidadeTipo,
          d.entidade_id AS entidadeId,
          d.status_documento AS statusDocumento,
          d.id_usuario_criador AS creatorUserId,
          d.atualizado_em AS atualizadoEm
        FROM documentos_registros d
        WHERE d.tenant_id = ?
        ORDER BY d.id_documento_registro ASC
        `,
        [tenantId]
      );
      for (const row of rows as any[]) {
        const entidadeTipo = row.entidadeTipo ? String(row.entidadeTipo).toUpperCase() : null;
        const entidadeId = row.entidadeId !== null && row.entidadeId !== undefined ? Number(row.entidadeId) : null;
        const tipoLocal = entidadeTipo === 'OBRA' ? 'OBRA' : entidadeTipo === 'UNIDADE' ? 'UNIDADE' : null;
        await upsertSecurityResourceIndex({
          tenantId,
          recurso: 'DOCUMENTO',
          entidadeId: Number(row.id),
          tipoLocal,
          idObra: tipoLocal === 'OBRA' ? entidadeId : null,
          idUnidade: tipoLocal === 'UNIDADE' ? entidadeId : null,
          creatorUserId: row.creatorUserId !== null && row.creatorUserId !== undefined ? Number(row.creatorUserId) : null,
          status: row.statusDocumento ? String(row.statusDocumento) : null,
          atributos: entidadeTipo ? { entidadeTipo, entidadeId } : null,
          atualizadoEmOrigem: row.atualizadoEm ? new Date(row.atualizadoEm) : null,
        });
        out.DOCUMENTO++;
      }
    }

    if (recursos.includes('SST_NC')) {
      const [rows]: any = await db.query(
        `
        SELECT
          nc.id_nc AS id,
          nc.id_obra AS idObra,
          nc.id_unidade AS idUnidade,
          nc.status_nc AS statusNc,
          nc.severidade AS severidade,
          nc.valor_estimado AS valorRef,
          nc.atualizado_em AS atualizadoEm
        FROM sst_nao_conformidades nc
        WHERE nc.tenant_id = ?
        ORDER BY nc.id_nc ASC
        `,
        [tenantId]
      );
      for (const row of rows as any[]) {
        const idObra = row.idObra !== null && row.idObra !== undefined ? Number(row.idObra) : null;
        const idUnidade = row.idUnidade !== null && row.idUnidade !== undefined ? Number(row.idUnidade) : null;
        const tipoLocal = idObra ? 'OBRA' : idUnidade ? 'UNIDADE' : null;
        await upsertSecurityResourceIndex({
          tenantId,
          recurso: 'SST_NC',
          entidadeId: Number(row.id),
          tipoLocal,
          idObra,
          idUnidade,
          status: row.statusNc ? String(row.statusNc) : null,
          value: row.valorRef !== null && row.valorRef !== undefined ? Number(row.valorRef) : null,
          atributos: { severidade: row.severidade ? String(row.severidade) : null },
          atualizadoEmOrigem: row.atualizadoEm ? new Date(row.atualizadoEm) : null,
        });
        out.SST_NC++;
      }
    }

    if (recursos.includes('SUP_SOLICITACAO')) {
      const [rows]: any = await db.query(
        `
        SELECT
          s.id_solicitacao_material AS id,
          s.id_obra_origem AS idObra,
          s.id_unidade_origem AS idUnidade,
          s.status_solicitacao AS statusSolicitacao,
          s.regime_urgencia AS regimeUrgencia,
          s.valor_estimado AS valorRef,
          s.atualizado_em AS atualizadoEm,
          s.id_usuario_solicitante AS creatorUserId
        FROM solicitacao_material s
        WHERE s.tenant_id = ?
        ORDER BY s.id_solicitacao_material ASC
        `,
        [tenantId]
      );
      for (const row of rows as any[]) {
        const idObra = row.idObra !== null && row.idObra !== undefined ? Number(row.idObra) : null;
        const idUnidade = row.idUnidade !== null && row.idUnidade !== undefined ? Number(row.idUnidade) : null;
        const tipoLocal = idObra ? 'OBRA' : idUnidade ? 'UNIDADE' : null;
        await upsertSecurityResourceIndex({
          tenantId,
          recurso: 'SUP_SOLICITACAO',
          entidadeId: Number(row.id),
          tipoLocal,
          idObra,
          idUnidade,
          creatorUserId: row.creatorUserId !== null && row.creatorUserId !== undefined ? Number(row.creatorUserId) : null,
          status: row.statusSolicitacao ? String(row.statusSolicitacao) : null,
          value: row.valorRef !== null && row.valorRef !== undefined ? Number(row.valorRef) : null,
          atributos: { regimeUrgencia: row.regimeUrgencia ? String(row.regimeUrgencia) : null },
          atualizadoEmOrigem: row.atualizadoEm ? new Date(row.atualizadoEm) : null,
        });
        out.SUP_SOLICITACAO++;
      }
    }

    if (recursos.includes('ENG_MEDICAO')) {
      const [rows]: any = await db.query(
        `
        SELECT
          m.id_medicao AS id,
          m.status_medicao AS statusMedicao,
          m.valor_medido AS valorMedido,
          m.atualizado_em AS atualizadoEm,
          o.id_obra AS idObra
        FROM contratos_medicoes m
        INNER JOIN contratos c ON c.id_contrato = m.id_contrato
        INNER JOIN obras o ON o.id_contrato = c.id_contrato
        WHERE c.tenant_id = ?
        ORDER BY m.id_medicao ASC
        `,
        [tenantId]
      );
      for (const row of rows as any[]) {
        const idObra = row.idObra !== null && row.idObra !== undefined ? Number(row.idObra) : null;
        await upsertSecurityResourceIndex({
          tenantId,
          recurso: 'ENG_MEDICAO',
          entidadeId: Number(row.id),
          tipoLocal: idObra ? 'OBRA' : null,
          idObra,
          status: row.statusMedicao ? String(row.statusMedicao) : null,
          value: row.valorMedido !== null && row.valorMedido !== undefined ? Number(row.valorMedido) : null,
          atualizadoEmOrigem: row.atualizadoEm ? new Date(row.atualizadoEm) : null,
        });
        out.ENG_MEDICAO++;
      }
    }

    return { ok: true, counts: out };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

