import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import AnalyticsAdminClient from './AnalyticsAdminClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  return <AnalyticsAdminClient />;
}

