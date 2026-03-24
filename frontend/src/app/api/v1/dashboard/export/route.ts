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
    if (!body?.contexto || !body?.formato) return fail('contexto e formato são obrigatórios', 422);

    const provider = DASHBOARD_EXPORT_PROVIDERS[body.contexto];
    if (!provider) return fail('Contexto não suportado', 400);

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
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    const pdf = await renderPdf(data);
    return new Response(pdf, {
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
