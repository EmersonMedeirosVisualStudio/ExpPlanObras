import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import DocumentoDetalheClient from './DocumentoDetalheClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.DOCUMENTOS_VIEW);
  return <DocumentoDetalheClient />;
}

