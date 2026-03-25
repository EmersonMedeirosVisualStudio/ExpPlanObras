import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import CentroExecutivoClient from './CentroExecutivoClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_CENTRO_EXECUTIVO_VIEW);
  return <CentroExecutivoClient />;
}

