import { NextRequest } from 'next/server';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { servicosModeloCsv } from '@/lib/modules/engenharia-importacao/templates';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  await requireApiPermission(PERMISSIONS.ENGENHARIA_SERVICOS_IMPORTAR);
  const csv = servicosModeloCsv();
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="servicos-modelo.csv"',
    },
  });
}
