import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { rebuildSecurityIndexForTenant } from '@/lib/auth/policies/indexer';
import type { PolicyResource } from '@/lib/auth/policies/types';

export const runtime = 'nodejs';

const POLICY_RESOURCES: PolicyResource[] = [
  'FUNCIONARIO',
  'PRESENCA',
  'HORA_EXTRA',
  'SST_NC',
  'SST_ACIDENTE',
  'SST_TREINAMENTO',
  'SST_CHECKLIST',
  'SUP_SOLICITACAO',
  'SUP_PEDIDO',
  'ENG_MEDICAO',
  'ENG_CONTRATO',
  'DOCUMENTO',
  'WORKFLOW',
  'APROVACAO',
  'BACKUP_RESTAURACAO',
  'ANALYTICS_DATASET',
];

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SECURITY_POLICIES_REINDEXAR);
    const body = (await req.json().catch(() => null)) as any;

    const recursosIn = Array.isArray(body?.recursos) ? body.recursos.map((r: any) => String(r).toUpperCase()) : [];
    const recursos = recursosIn.length ? recursosIn.filter((r: any) => POLICY_RESOURCES.includes(r as any)) : undefined;
    if (recursosIn.length && (!recursos || !recursos.length)) throw new ApiError(422, 'recursos inválido.');

    const data = await rebuildSecurityIndexForTenant({ tenantId: current.tenantId, recursos: recursos as any });
    return ok(data);
  } catch (e) {
    return handleApiError(e);
  }
}
