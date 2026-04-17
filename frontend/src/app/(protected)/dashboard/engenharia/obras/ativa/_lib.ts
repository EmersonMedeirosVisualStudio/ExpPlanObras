import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function getActiveObraIdOrRedirect(): Promise<number> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("exp_active_obra")?.value || "";
  const id = Number(raw || 0);
  if (!Number.isInteger(id) || id <= 0) redirect("/dashboard/engenharia/obras");
  return id;
}

