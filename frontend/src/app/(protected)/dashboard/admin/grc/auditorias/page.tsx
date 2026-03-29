import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AuditoriasClient from './AuditoriasClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.GRC_AUDITORIAS_VIEW);
  return <AuditoriasClient />;
}
