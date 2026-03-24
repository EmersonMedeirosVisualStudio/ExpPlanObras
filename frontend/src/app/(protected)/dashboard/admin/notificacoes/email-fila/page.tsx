import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import EmailFilaClient from './EmailFilaClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.NOTIFICACOES_EMAIL_FILA_VIEW);
  return <EmailFilaClient />;
}

