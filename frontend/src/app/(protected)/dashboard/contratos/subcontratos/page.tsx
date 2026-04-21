import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import SubcontratosClient from "./SubcontratosClient";

export default async function SubcontratosPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <SubcontratosClient />;
}
