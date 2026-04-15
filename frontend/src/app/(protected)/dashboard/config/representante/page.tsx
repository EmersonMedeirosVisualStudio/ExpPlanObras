import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { redirect } from 'next/navigation';

export default async function RepresentantePage() {
  await requirePermission(PERMISSIONS.REPRESENTANTE_VIEW);

  redirect('/dashboard/config/representante/dashboard');
}
