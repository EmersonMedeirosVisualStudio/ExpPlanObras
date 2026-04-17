import { redirect } from "next/navigation";
import { getActiveObraIdOrRedirect } from "../_lib";

export default async function ObrasAtivaApropriacaoPage() {
  const id = await getActiveObraIdOrRedirect();
  redirect(`/dashboard/engenharia/obras/${id}/apropriacao`);
}

