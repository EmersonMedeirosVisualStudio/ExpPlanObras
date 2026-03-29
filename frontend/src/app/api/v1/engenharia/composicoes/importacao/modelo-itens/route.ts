import { NextRequest } from 'next/server';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { composicoesItensModeloCsv } from '@/lib/modules/engenharia-importacao/templates';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  await requireApiPermission(PERMISSIONS.ENGENHARIA_COMPOSICOES_IMPORTAR);
  const csv = composicoesItensModeloCsv();
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="composicoes-itens-modelo.csv"',
    },
  });
}
