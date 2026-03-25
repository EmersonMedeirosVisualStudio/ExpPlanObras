import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import WorkflowsDesignerListClient from './WorkflowsDesignerListClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.WORKFLOWS_DESIGNER_VIEW);
  return <WorkflowsDesignerListClient />;
}

