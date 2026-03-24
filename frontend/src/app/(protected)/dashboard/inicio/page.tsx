import InicioDashboardClient from './InicioDashboardClient';
import { requireAuthenticatedUser } from '@/lib/auth/require-authenticated-user';

export default async function Page() {
  await requireAuthenticatedUser();
  return <InicioDashboardClient />;
}

