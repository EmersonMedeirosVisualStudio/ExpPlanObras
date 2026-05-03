import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api/http";
import { requireApiPermission } from "@/lib/api/authz";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

function parseId(v: string) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const { id } = await ctx.params;
    const idObra = parseId(id);
    if (!idObra) return fail(400, "ID inválido.");

    const [rows]: any = await db.query(
      `
      SELECT
        o.id_obra AS idObra,
        o.nome_obra AS nomeObra,
        o.id_contrato AS idContrato,
        c.numero_contrato AS numeroContrato,
        c.objeto AS objeto,
        c.status_contrato AS statusContrato,
        c.valor_atualizado AS valorContratado,
        c.valor_executado AS valorExecutado,
        c.valor_pago AS valorPago
      FROM obras o
      LEFT JOIN contratos c
        ON c.tenant_id = o.tenant_id
       AND c.id_contrato = o.id_contrato
      WHERE o.tenant_id = ?
        AND o.id_obra = ?
      LIMIT 1
      `,
      [current.tenantId, idObra]
    );

    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) return fail(404, "Obra não encontrada.");

    return ok({
      idObra: Number(row.idObra),
      nomeObra: String(row.nomeObra || ""),
      idContrato: row.idContrato !== null && row.idContrato !== undefined ? Number(row.idContrato) : null,
      numeroContrato: String(row.numeroContrato || ""),
      objeto: row.objeto ? String(row.objeto) : null,
      statusContrato: row.statusContrato ? String(row.statusContrato) : null,
      valorContratado: Number(row.valorContratado || 0),
      valorExecutado: Number(row.valorExecutado || 0),
      valorPago: Number(row.valorPago || 0),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
