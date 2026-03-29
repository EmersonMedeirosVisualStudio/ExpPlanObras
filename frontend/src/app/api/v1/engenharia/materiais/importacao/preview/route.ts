import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { previewMateriais } from '@/lib/modules/engenharia-importacao/validators';

export const runtime = 'nodejs';

async function readUtf8CsvFile(file: File) {
  if (!file) throw new Error('Arquivo ausente');
  if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande (limite 5MB)');
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error('Arquivo CSV deve estar em UTF-8');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireApiPermission(PERMISSIONS.ENGENHARIA_MATERIAIS_IMPORTAR);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail(422, 'Arquivo CSV é obrigatório (campo "file")');
    const csvText = await readUtf8CsvFile(file);
    const { result } = previewMateriais(csvText);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}

