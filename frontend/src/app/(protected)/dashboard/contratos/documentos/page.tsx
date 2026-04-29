import { requirePermission } from "@/lib/auth/require-permission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

function safeInternalPath(v: unknown) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (!s.startsWith("/")) return null;
  if (s.startsWith("//")) return null;
  if (s.includes("://")) return null;
  return s;
}

export default async function ContratosDocumentosPage(props: { searchParams?: Record<string, string | string[] | undefined> }) {
  await requirePermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);

  const sp = props.searchParams || {};
  const contratoIdRaw = Array.isArray(sp.contratoId) ? sp.contratoId[0] : sp.contratoId;
  const idRaw = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const returnToRaw = Array.isArray(sp.returnTo) ? sp.returnTo[0] : sp.returnTo;
  const fromRaw = Array.isArray(sp.from) ? sp.from[0] : sp.from;

  const contratoId = String(idRaw || contratoIdRaw || "").trim();
  const id = /^\d+$/.test(contratoId) ? contratoId : "";
  const returnTo = safeInternalPath(String(returnToRaw || fromRaw || "")) || (id ? `/dashboard/contratos?id=${id}` : "/dashboard/contratos");

  const qp = new URLSearchParams();
  qp.set("tipo", "CONTRATO");
  if (id) qp.set("id", id);
  qp.set("returnTo", returnTo);
  redirect(`/dashboard/obras/documentos?${qp.toString()}`);
}
