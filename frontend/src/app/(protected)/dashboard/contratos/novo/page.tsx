import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import NovoContratoClient from "./novoContratoClient";

export default async function NovoContratoPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <NovoContratoClient />;
}

