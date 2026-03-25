import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SecuritySimulatorClient from './SecuritySimulatorClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SECURITY_POLICIES_SIMULAR);
  return <SecuritySimulatorClient />;
}
