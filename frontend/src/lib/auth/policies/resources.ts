import { db } from '@/lib/db';
import type { PolicyAction, PolicyResource, ResourceContext, SubjectContext } from './types';

export type PolicyResourceProvider = {
  resource: PolicyResource;
  entityIdColumn: string | null;
  loadResourceContext?: (tenantId: number, entityId: number) => Promise<ResourceContext>;
  buildListSqlFilter?: (args: { alias: string; subject: SubjectContext; action: PolicyAction }) => Promise<{ join?: string; where: string; params: unknown[] }>;
};

function inParams(values: number[]) {
  const unique = Array.from(new Set(values.filter((n) => Number.isFinite(n) && n > 0)));
  if (!unique.length) return { sql: '(NULL)', params: [] as unknown[] };
  return { sql: unique.map(() => '?').join(','), params: unique };
}

export async function loadResourceContextFromIndex(tenantId: number, resource: PolicyResource, entityId: number): Promise<ResourceContext | null> {
  const [[row]]: any = await db.query(
    `
    SELECT
      recurso,
      entidade_id AS entityId,
      id_setor_diretoria AS diretoriaId,
      tipo_local AS tipoLocal,
      id_obra AS idObra,
      id_unidade AS idUnidade,
      id_usuario_criador AS creatorUserId,
      id_usuario_responsavel AS responsibleUserId,
      id_usuario_proprietario AS ownerUserId,
      status_referencia AS statusRef,
      valor_referencia AS valorRef,
      confidencialidade AS confid,
      atributos_json AS attrs
    FROM seguranca_recursos_indice
    WHERE tenant_id = ? AND recurso = ? AND entidade_id = ?
    LIMIT 1
    `,
    [tenantId, resource, entityId]
  );

  if (!row) return null;
  const attrs = row.attrs ? (typeof row.attrs === 'string' ? JSON.parse(row.attrs) : row.attrs) : null;

  return {
    resource,
    entityId: Number(row.entityId),
    diretoriaId: row.diretoriaId !== null && row.diretoriaId !== undefined ? Number(row.diretoriaId) : null,
    tipoLocal: row.tipoLocal ? (String(row.tipoLocal).toUpperCase() === 'OBRA' ? 'OBRA' : 'UNIDADE') : null,
    idObra: row.idObra !== null && row.idObra !== undefined ? Number(row.idObra) : null,
    idUnidade: row.idUnidade !== null && row.idUnidade !== undefined ? Number(row.idUnidade) : null,
    creatorUserId: row.creatorUserId !== null && row.creatorUserId !== undefined ? Number(row.creatorUserId) : null,
    responsibleUserId: row.responsibleUserId !== null && row.responsibleUserId !== undefined ? Number(row.responsibleUserId) : null,
    ownerUserId: row.ownerUserId !== null && row.ownerUserId !== undefined ? Number(row.ownerUserId) : null,
    status: row.statusRef ? String(row.statusRef) : null,
    value: row.valorRef !== null && row.valorRef !== undefined ? Number(row.valorRef) : null,
    confidentiality: row.confid ? (String(row.confid).toUpperCase() as any) : null,
    attributes: attrs && typeof attrs === 'object' ? (attrs as Record<string, unknown>) : undefined,
  };
}

async function buildIndexExistsFilter(args: { subject: SubjectContext; alias: string; entityIdColumn: string; resource: PolicyResource }) {
  if (args.subject.scope.empresaTotal) {
    return {
      where: `EXISTS (SELECT 1 FROM seguranca_recursos_indice sri WHERE sri.tenant_id = ? AND sri.recurso = ? AND sri.entidade_id = ${args.alias}.${args.entityIdColumn})`,
      params: [args.subject.tenantId, args.resource],
    };
  }

  const diret = inParams(args.subject.scope.diretorias);
  const obras = inParams(args.subject.scope.obras);
  const unid = inParams(args.subject.scope.unidades);

  const hasAny = diret.params.length || obras.params.length || unid.params.length;
  if (!hasAny) {
    return { where: '0=1', params: [] as unknown[] };
  }

  const scopeParts: string[] = [];
  const scopeParams: unknown[] = [];
  if (diret.params.length) {
    scopeParts.push(`sri.id_setor_diretoria IN (${diret.sql})`);
    scopeParams.push(...diret.params);
  }
  if (obras.params.length) {
    scopeParts.push(`sri.id_obra IN (${obras.sql})`);
    scopeParams.push(...obras.params);
  }
  if (unid.params.length) {
    scopeParts.push(`sri.id_unidade IN (${unid.sql})`);
    scopeParams.push(...unid.params);
  }

  return {
    where: `EXISTS (
      SELECT 1
      FROM seguranca_recursos_indice sri
      WHERE sri.tenant_id = ?
        AND sri.recurso = ?
        AND sri.entidade_id = ${args.alias}.${args.entityIdColumn}
        AND (${scopeParts.join(' OR ')})
    )`,
    params: [args.subject.tenantId, args.resource, ...scopeParams],
  };
}

export const POLICY_RESOURCE_PROVIDERS: PolicyResourceProvider[] = [
  {
    resource: 'DOCUMENTO',
    entityIdColumn: 'id_documento_registro',
    buildListSqlFilter: async ({ alias, subject }) => {
      return buildIndexExistsFilter({ subject, alias, entityIdColumn: 'id_documento_registro', resource: 'DOCUMENTO' });
    },
  },
  {
    resource: 'SST_NC',
    entityIdColumn: 'id_nc',
    buildListSqlFilter: async ({ alias, subject }) => buildIndexExistsFilter({ subject, alias, entityIdColumn: 'id_nc', resource: 'SST_NC' }),
  },
  {
    resource: 'SUP_SOLICITACAO',
    entityIdColumn: 'id_solicitacao_material',
    buildListSqlFilter: async ({ alias, subject }) =>
      buildIndexExistsFilter({ subject, alias, entityIdColumn: 'id_solicitacao_material', resource: 'SUP_SOLICITACAO' }),
  },
  {
    resource: 'ENG_MEDICAO',
    entityIdColumn: 'id_medicao',
    buildListSqlFilter: async ({ alias, subject }) => buildIndexExistsFilter({ subject, alias, entityIdColumn: 'id_medicao', resource: 'ENG_MEDICAO' }),
  },
  {
    resource: 'ENG_CONTRATO',
    entityIdColumn: 'id_contrato',
    buildListSqlFilter: async ({ alias, subject }) => buildIndexExistsFilter({ subject, alias, entityIdColumn: 'id_contrato', resource: 'ENG_CONTRATO' }),
  },
];

export function getPolicyResourceProvider(resource: PolicyResource): PolicyResourceProvider | null {
  return POLICY_RESOURCE_PROVIDERS.find((p) => p.resource === resource) || null;
}

