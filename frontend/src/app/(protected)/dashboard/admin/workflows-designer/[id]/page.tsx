import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import WorkflowDesignerEditorClient from './WorkflowDesignerEditorClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.WORKFLOWS_DESIGNER_VIEW);
  return <WorkflowDesignerEditorClient />;
}

