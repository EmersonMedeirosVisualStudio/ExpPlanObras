import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import AditivosClient from "./AditivosClient";

export default async function ContratosAditivosPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <AditivosClient />;
}
