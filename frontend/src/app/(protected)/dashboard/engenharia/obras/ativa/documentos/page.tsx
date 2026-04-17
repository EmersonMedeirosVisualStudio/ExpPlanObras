import { redirect } from "next/navigation";
import { getActiveObraIdOrRedirect } from "../_lib";

export default async function ObrasAtivaDocumentosPage() {
  const id = await getActiveObraIdOrRedirect();
  redirect(`/dashboard/obras/documentos?tipo=OBRA&id=${id}`);
}

