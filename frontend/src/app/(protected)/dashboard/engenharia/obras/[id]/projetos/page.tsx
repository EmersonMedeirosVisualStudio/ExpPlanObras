import { requirePermission } from "@/lib/auth/access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import ObraProjetosClient from "./ObraProjetosClient";

export default async function Page() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <ObraProjetosClient />;
}

