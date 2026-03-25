import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import WorkflowsModelosClient from './WorkflowsModelosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.WORKFLOWS_MODELOS_VIEW);
  return <WorkflowsModelosClient />;
}

