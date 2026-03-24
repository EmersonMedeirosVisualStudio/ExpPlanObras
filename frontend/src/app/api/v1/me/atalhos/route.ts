import { ok, handleApiError } from '@/lib/api/http';
import { requireAuthenticatedApiUser } from '@/lib/auth/require-authenticated-api-user';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';
import { buildMenuResponse, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuItemDTO, MenuScopeType } from '@/lib/navigation/types';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function collectMap(items: MenuItemDTO[], map: Map<string, MenuItemDTO>) {
  for (const it of items) {
    map.set(it.key, it);
    if (it.children?.length) collectMap(it.children, map);
  }
}

export async function GET() {
  try {
    const user = await requireAuthenticatedApiUser();
    try {
      const [rows]: any = await db.query(
        `
        SELECT id_usuario_atalho AS id, tipo_atalho AS tipo, titulo, href, menu_key AS menuKey, icone, cor, ordem, ativo
        FROM usuarios_atalhos_rapidos
        WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
        ORDER BY ordem ASC, id_usuario_atalho DESC
        LIMIT 12
        `,
        [user.tenantId, user.id]
      );
      return ok(rows as any[]);
    } catch {
      return ok([]);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedApiUser();
    const itens = (await req.json().catch(() => null)) as any[];
    const permissions = await getCurrentUserPermissions(user.id);
    const scope = await getDashboardScope(user);
    const scopeTypes = [
      scope.empresaTotal ? 'EMPRESA' : null,
      ...(scope.diretorias?.length ? ['DIRETORIA'] : []),
      ...(scope.obras?.length ? ['OBRA'] : []),
      ...(scope.unidades?.length ? ['UNIDADE'] : []),
    ].filter(Boolean) as MenuScopeType[];
    const ctx: BuildMenuContext = { permissions, scopeTypes };
    const menu = buildMenuResponse(ctx);
    const allowed = new Map<string, MenuItemDTO>();
    for (const s of menu.secoes) collectMap(s.items, allowed);

    const valid = (Array.isArray(itens) ? itens : [])
      .filter((x) => x && typeof x.titulo === 'string' && Number.isFinite(Number(x.ordem)))
      .filter((x) => {
        if (x.tipo === 'MENU') return x.menuKey && allowed.has(String(x.menuKey));
        if (x.tipo === 'ROTA') return typeof x.href === 'string' && x.href.startsWith('/dashboard');
        return false;
      })
      .slice(0, 12);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`DELETE FROM usuarios_atalhos_rapidos WHERE tenant_id = ? AND id_usuario = ?`, [user.tenantId, user.id]);
      for (const it of valid) {
        await conn.execute(
          `
          INSERT INTO usuarios_atalhos_rapidos
            (tenant_id, id_usuario, tipo_atalho, titulo, href, menu_key, icone, cor, ordem, ativo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
          [user.tenantId, user.id, it.tipo, it.titulo, it.href ?? null, it.menuKey ?? null, it.icone ?? null, it.cor ?? null, Number(it.ordem)]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return ok(null);
  } catch (e) {
    return handleApiError(e);
  }
}

