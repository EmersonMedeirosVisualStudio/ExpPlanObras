import { getActiveObraIdOrRedirect } from '../_lib';
import DashboardPesClient from './DashboardPesClient';

export default async function Page() {
  const idObra = await getActiveObraIdOrRedirect();
  return <DashboardPesClient idObra={idObra} />;
}

