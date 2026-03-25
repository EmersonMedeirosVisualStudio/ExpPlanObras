import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DocumentosClient from './DocumentosClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DOCUMENTOS_VIEW);
  return <DocumentosClient />;
}

