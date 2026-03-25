import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SecurityPoliciesClient from './SecurityPoliciesClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SECURITY_POLICIES_VIEW);
  return <SecurityPoliciesClient />;
}
