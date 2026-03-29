import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import GovernancaDadosClient from './GovernancaDadosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DATA_CATALOG_VIEW);
  return <GovernancaDadosClient />;
}

