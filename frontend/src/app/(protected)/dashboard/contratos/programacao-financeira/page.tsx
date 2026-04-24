import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import ProgramacaoFinanceiraClient from "./ProgramacaoFinanceiraClient";

export default async function ContratosProgramacaoFinanceiraPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
  return <ProgramacaoFinanceiraClient />;
}

