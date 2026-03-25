import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import WorkflowsClient from './WorkflowsClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.WORKFLOWS_VIEW);
  return <WorkflowsClient />;
}

