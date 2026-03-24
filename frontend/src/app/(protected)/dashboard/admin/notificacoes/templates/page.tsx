import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import TemplatesClient from './TemplatesClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.NOTIFICACOES_TEMPLATES_ADMIN);
  return <TemplatesClient />;
}

