import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import FaturamentoClient from "./FaturamentoClient";

export default async function FaturamentoPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <FaturamentoClient />;
}
