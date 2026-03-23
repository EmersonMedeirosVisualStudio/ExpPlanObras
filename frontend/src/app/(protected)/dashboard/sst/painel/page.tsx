import { requirePermission } from '@/lib/auth/access';
import { PERMISSIONS } from '@/lib/auth/permissions';
import SstPainelClient from './SstPainelClient';

export default async function Page() {
  await requirePermission(PERMISSIONS.SST_PAINEL_VIEW);
  return <SstPainelClient />;
}

