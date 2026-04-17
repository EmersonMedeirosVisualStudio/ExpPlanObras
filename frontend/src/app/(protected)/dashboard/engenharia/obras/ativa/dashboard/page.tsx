import { redirect } from "next/navigation";
import { getActiveObraIdOrRedirect } from "../_lib";

export default async function ObrasAtivaDashboardPage() {
  const id = await getActiveObraIdOrRedirect();
  redirect(`/dashboard/engenharia/obras/${id}`);
}

