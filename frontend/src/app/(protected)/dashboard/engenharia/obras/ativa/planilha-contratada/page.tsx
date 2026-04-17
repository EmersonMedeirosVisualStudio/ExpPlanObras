import { redirect } from "next/navigation";
import { getActiveObraIdOrRedirect } from "../_lib";

export default async function ObrasAtivaPlanilhaContratadaPage() {
  const id = await getActiveObraIdOrRedirect();
  redirect(`/dashboard/engenharia/obras/${id}/planilha`);
}

