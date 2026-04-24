import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import DocumentosContratoClient from "./DocumentosContratoClient";

export default async function ContratosDocumentosPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <DocumentosContratoClient />;
}

