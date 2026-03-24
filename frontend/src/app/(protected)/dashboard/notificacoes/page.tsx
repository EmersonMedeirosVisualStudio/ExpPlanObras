import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import NotificationsPageClient from './NotificationsPageClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.NOTIFICACOES_VIEW);
  return <NotificationsPageClient />;
}

