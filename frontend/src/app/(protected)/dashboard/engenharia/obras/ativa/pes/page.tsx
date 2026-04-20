import { getActiveObraIdOrRedirect } from '../_lib';
import PesWorkspaceClient from './pesWorkspaceClient';

export default async function Page() {
  const idObra = await getActiveObraIdOrRedirect();
  return <PesWorkspaceClient idObra={idObra} />;
}

