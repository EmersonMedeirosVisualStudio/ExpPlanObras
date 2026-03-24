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
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      return new Response(blob, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const pdf = await renderPdf(data);
    const pdfBlob = new Blob([pdf], { type: 'application/pdf' });
    return new Response(pdfBlob, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
