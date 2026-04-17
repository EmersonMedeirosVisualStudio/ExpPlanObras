import { ok, fail, handleApiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail(401, "Não autenticado.");

    const obrasIds = Array.isArray(user.abrangencia?.obras) ? user.abrangencia.obras : [];
    const diretoriasIds = Array.isArray(user.abrangencia?.diretorias) ? user.abrangencia.diretorias : [];
    const unidadesIds = Array.isArray(user.abrangencia?.unidades) ? user.abrangencia.unidades : [];

    return ok({
      empresaTotal: !!user.abrangencia?.empresa,
      diretorias: diretoriasIds.map((id) => ({ id: Number(id), nome: `Diretoria #${id}` })),
      unidades: unidadesIds.map((id) => ({ id: Number(id), nome: `Unidade #${id}` })),
      obras: obrasIds.map((id) => ({ id: Number(id), nome: `Obra #${id}` })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

