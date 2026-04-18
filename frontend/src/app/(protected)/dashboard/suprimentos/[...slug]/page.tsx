import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SuprimentosHubClient from '../SuprimentosHubClient';

export default async function SuprimentosModuloPage({ params }: { params: Promise<{ slug: string[] }> }) {
  await requirePermission(PERMISSIONS.DASHBOARD_SUPRIMENTOS_VIEW);
  const { slug } = await params;
  return <SuprimentosHubClient slug={slug || []} />;
}

