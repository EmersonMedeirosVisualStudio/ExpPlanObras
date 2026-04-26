import { requirePermission } from "@/lib/auth/access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import ProjetosClient from "./ProjetosClient";

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <ProjetosClient />;
}

