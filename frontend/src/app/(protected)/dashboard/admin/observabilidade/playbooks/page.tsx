import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import PlaybooksClient from './PlaybooksClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.PLAYBOOKS_VIEW);
  return <PlaybooksClient />;
}
