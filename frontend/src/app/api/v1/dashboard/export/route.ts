import { NextRequest } from 'next/server';
import { fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { DashboardExportRequestDTO } from '@/lib/modules/dashboard-export/types';
import { buildDashboardExportFilename } from '@/lib/modules/dashboard-export/build-filename';
import { DASHBOARD_EXPORT_PROVIDERS } from '@/lib/modules/dashboard-export/registry';
import { renderXlsx } from '@/lib/modules/dashboard-export/render-xlsx';
import { renderPdf } from '@/lib/modules/dashboard-export/render-pdf';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_EXPORTAR);
    const body = (await req.json()) as DashboardExportRequestDTO;
    if (!body?.contexto || !body?.formato) return fail(422, 'contexto e formato são obrigatórios');

    const provider = DASHBOARD_EXPORT_PROVIDERS[body.contexto];
    if (!provider) return fail(400, 'Contexto não suportado');

    await requireApiPermission(provider.requiredPermission);

    const data = await provider.build({
      tenantId: current.tenantId,
      userId: current.id,
      filtros: body.filtros,
      incluirWidgets: body.incluirWidgets,
    });

    const filename = buildDashboardExportFilename(body.contexto, body.formato);
    if (body.formato === 'XLSX') {
      const buf = await renderXlsx(data);
      const bodyOut = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return new Response(bodyOut, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const pdf = await renderPdf(data);
    const pdfOut = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
    return new Response(pdfOut, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
