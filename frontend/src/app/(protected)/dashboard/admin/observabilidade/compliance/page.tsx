import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ComplianceClient from './ComplianceClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.INCIDENT_RESPONSE_COMPLIANCE_VIEW);
  return <ComplianceClient />;
}
