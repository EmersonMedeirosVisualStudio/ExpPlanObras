import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import ContratoPlanejamentoClient from "./ContratoPlanejamentoClient";

export default async function ContratoPlanejamentoPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <ContratoPlanejamentoClient />;
}

