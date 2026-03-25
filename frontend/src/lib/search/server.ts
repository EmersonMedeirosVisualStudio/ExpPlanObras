import { db } from '@/lib/db';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { normalizeSearchText, toBooleanFulltextQuery } from './normalize';
import type { GlobalSearchModulo, GlobalSearchResponseDTO, GlobalSearchResultDTO, GlobalSearchSuggestResponseDTO, SearchDocumentInput } from './types';
import { buildQuickActionResults } from './actions';
import { buildMenuResponse, type BuildMenuContext } from '@/lib/navigation/build';
import type { MenuItemDTO, MenuScopeType } from '@/lib/navigation/types';
import { getCurrentUserPermissions } from '@/lib/auth/get-current-user-permissions';

function collectMenuItems(items: MenuItemDTO[], out: MenuItemDTO[]) {
  for (const it of items) {
    if (it.href) out.push(it);
    if (it.children?.length) collectMenuItems(it.children, out);
  }
}

function moduloFromMenuKey(key: string): GlobalSearchModulo {
  const k = String(key || '');
  if (k.startsWith('rh') || k.includes('rh')) return 'RH';
  if (k.startsWith('sst') || k.includes('sst')) return 'SST';
  if (k.includes('supr')) return 'SUPRIMENTOS';
  if (k.includes('engenharia') || k.includes('obras') || k.includes('contratos')) return 'ENGENHARIA';
  if (k.includes('admin') || k.includes('backup') || k.includes('governanca') || k.includes('organograma')) return 'ADMIN';
  return 'GERAL';
}

export async function upsertSearchDocument(input: SearchDocumentInput) {
  const ativo = input.ativo === undefined ? 1 : input.ativo ? 1 : 0;
  await db.execute(
    `
    INSERT INTO busca_global_documentos
      (tenant_id, modulo, entidade_tipo, entidade_id, titulo, subtitulo, codigo_referencia, status_referencia, rota,
       resumo_texto, termos_busca, palavras_chave, permissao_view,
       id_diretoria, id_obra, id_unidade, ativo, atualizado_em_origem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      modulo = VALUES(modulo),
      titulo = VALUES(titulo),
      subtitulo = VALUES(subtitulo),
      codigo_referencia = VALUES(codigo_referencia),
      status_referencia = VALUES(status_referencia),
      rota = VALUES(rota),
      resumo_texto = VALUES(resumo_texto),
      termos_busca = VALUES(termos_busca),
      palavras_chave = VALUES(palavras_chave),
      permissao_view = VALUES(permissao_view),
      id_diretoria = VALUES(id_diretoria),
      id_obra = VALUES(id_obra),
      id_unidade = VALUES(id_unidade),
      ativo = VALUES(ativo),
      atualizado_em_origem = VALUES(atualizado_em_origem),
      atualizado_em = CURRENT_TIMESTAMP
    `,
    [
      input.tenantId,
      input.modulo,
      input.entidadeTipo,
      input.entidadeId,
      input.titulo,
      input.subtitulo ?? null,
      input.codigoReferencia ?? null,
      input.statusReferencia ?? null,
      input.rota,
      input.resumoTexto ?? null,
      input.termosBusca ?? null,
      input.palavrasChave ?? null,
      input.permissaoView ?? null,
      input.idDiretoria ?? null,
      input.idObra ?? null,
      input.idUnidade ?? null,
      ativo,
      input.atualizadoEmOrigem ?? null,
    ]
  );
}

export async function deleteSearchDocument(args: { tenantId: number; entidadeTipo: string; entidadeId: number }) {
  await db.execute(
    `DELETE FROM busca_global_documentos WHERE tenant_id = ? AND entidade_tipo = ? AND entidade_id = ?`,
    [args.tenantId, args.entidadeTipo, args.entidadeId]
  );
}

export async function registerSearchQuery(args: { tenantId: number; userId: number; query: string }) {
  const queryText = String(args.query || '').trim().slice(0, 180);
  if (!queryText) return;
  await db.execute(
    `
    INSERT INTO usuarios_busca_recente
      (tenant_id, id_usuario, query_texto, ultima_busca_em, contador_uso)
    VALUES (?, ?, ?, NOW(), 1)
    ON DUPLICATE KEY UPDATE
      ultima_busca_em = NOW(),
      contador_uso = contador_uso + 1
    `,
    [args.tenantId, args.userId, queryText]
  );
}

export async function registerSearchAccess(args: {
  tenantId: number;
  userId: number;
  entidadeTipo: string | null;
  entidadeId: number | null;
  titulo: string;
  rota: string;
  modulo: string;
}) {
  if (!args.entidadeTipo || !args.entidadeId) return;
  await db.execute(
    `
    INSERT INTO usuarios_busca_resultados_recentes
      (tenant_id, id_usuario, entidade_tipo, entidade_id, titulo, rota, modulo, ultima_abertura_em, contador_aberturas)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 1)
    ON DUPLICATE KEY UPDATE
      titulo = VALUES(titulo),
      rota = VALUES(rota),
      modulo = VALUES(modulo),
      ultima_abertura_em = NOW(),
      contador_aberturas = contador_aberturas + 1
    `,
    [args.tenantId, args.userId, args.entidadeTipo, args.entidadeId, args.titulo, args.rota, args.modulo]
  );
}

function buildPermissionFilter(permissions: string[]) {
  if (!permissions.length) return { sql: ' AND permissao_view IS NULL', params: [] as any[] };
  return { sql: ` AND (permissao_view IS NULL OR permissao_view IN (${permissions.map(() => '?').join(',')}))`, params: permissions };
}

function buildScopeFilter(args: { empresaTotal: boolean; diretorias: number[]; obras: number[]; unidades: number[] }) {
  if (args.empresaTotal) return { sql: '', params: [] as any[] };
  const parts: string[] = [];
  const params: any[] = [];

  if (args.diretorias.length) {
    const c = inClause(args.diretorias);
    parts.push(`(id_diretoria IS NULL OR id_diretoria IN ${c.sql})`);
    params.push(...c.params);
  } else {
    parts.push(`id_diretoria IS NULL`);
  }

  if (args.obras.length) {
    const c = inClause(args.obras);
    parts.push(`(id_obra IS NULL OR id_obra IN ${c.sql})`);
    params.push(...c.params);
  } else {
    parts.push(`id_obra IS NULL`);
  }

  if (args.unidades.length) {
    const c = inClause(args.unidades);
    parts.push(`(id_unidade IS NULL OR id_unidade IN ${c.sql})`);
    params.push(...c.params);
  } else {
    parts.push(`id_unidade IS NULL`);
  }

  return { sql: ` AND ${parts.join(' AND ')}`, params };
}

function toResult(row: any): GlobalSearchResultDTO {
  return {
    id: `ent:${String(row.entidadeTipo)}:${Number(row.entidadeId)}`,
    type: 'ENTIDADE',
    modulo: String(row.modulo) as GlobalSearchModulo,
    entidadeTipo: String(row.entidadeTipo),
    entidadeId: Number(row.entidadeId),
    titulo: String(row.titulo),
    subtitulo: row.subtitulo ? String(row.subtitulo) : null,
    rota: row.rota ? String(row.rota) : null,
    status: row.statusReferencia ? String(row.statusReferencia) : null,
    codigoReferencia: row.codigoReferencia ? String(row.codigoReferencia) : null,
    score: Number(row.score || 0),
  };
}

export async function searchGlobal(args: {
  tenantId: number;
  userId: number;
  query: string;
  limit?: number;
  modulo?: string;
}): Promise<GlobalSearchResponseDTO> {
  const q = String(args.query || '').trim();
  const limit = Math.min(Math.max(Number(args.limit || 20), 5), 40);
  const permissions = await getCurrentUserPermissions(args.userId);
  const scope = await getDashboardScope({ id: args.userId, tenantId: args.tenantId });

  const permFilter = buildPermissionFilter(permissions);
  const scopeFilter = buildScopeFilter(scope);
  const modulo = args.modulo ? String(args.modulo) : null;
  const moduloFilter = modulo ? ` AND modulo = ?` : '';
  const moduloParams = modulo ? [modulo] : [];

  const qNorm = normalizeSearchText(q);
  const ft = toBooleanFulltextQuery(q);
  const like = `%${qNorm}%`;
  const hasFulltext = qNorm.length >= 3;

  const sql = hasFulltext
    ? `
      SELECT
        d.modulo AS modulo,
        d.entidade_tipo AS entidadeTipo,
        d.entidade_id AS entidadeId,
        d.titulo AS titulo,
        d.subtitulo AS subtitulo,
        d.rota AS rota,
        d.status_referencia AS statusReferencia,
        d.codigo_referencia AS codigoReferencia,
        (
          (MATCH(d.titulo, d.subtitulo, d.codigo_referencia, d.resumo_texto, d.termos_busca, d.palavras_chave) AGAINST (? IN BOOLEAN MODE) * 10)
          + (CASE WHEN d.codigo_referencia = ? THEN 1000 ELSE 0 END)
          + (CASE WHEN LOWER(d.titulo) LIKE CONCAT(?, '%') THEN 500 ELSE 0 END)
          + (CASE WHEN r.entidade_id IS NULL THEN 0 ELSE 50 END)
        ) AS score
      FROM busca_global_documentos d
      LEFT JOIN usuarios_busca_resultados_recentes r
        ON r.tenant_id = d.tenant_id
       AND r.id_usuario = ?
       AND r.entidade_tipo = d.entidade_tipo
       AND r.entidade_id = d.entidade_id
      WHERE d.tenant_id = ?
        AND d.ativo = 1
        ${moduloFilter}
        ${permFilter.sql}
        ${scopeFilter.sql}
        AND (
          MATCH(d.titulo, d.subtitulo, d.codigo_referencia, d.resumo_texto, d.termos_busca, d.palavras_chave) AGAINST (? IN BOOLEAN MODE)
          OR LOWER(d.titulo) LIKE ?
          OR LOWER(d.subtitulo) LIKE ?
          OR LOWER(d.codigo_referencia) LIKE ?
          OR LOWER(d.termos_busca) LIKE ?
        )
      ORDER BY score DESC, d.atualizado_em DESC
      LIMIT ?
    `
    : `
      SELECT
        d.modulo AS modulo,
        d.entidade_tipo AS entidadeTipo,
        d.entidade_id AS entidadeId,
        d.titulo AS titulo,
        d.subtitulo AS subtitulo,
        d.rota AS rota,
        d.status_referencia AS statusReferencia,
        d.codigo_referencia AS codigoReferencia,
        (
          (CASE WHEN d.codigo_referencia = ? THEN 1000 ELSE 0 END)
          + (CASE WHEN LOWER(d.titulo) LIKE CONCAT(?, '%') THEN 500 ELSE 0 END)
          + (CASE WHEN r.entidade_id IS NULL THEN 0 ELSE 50 END)
        ) AS score
      FROM busca_global_documentos d
      LEFT JOIN usuarios_busca_resultados_recentes r
        ON r.tenant_id = d.tenant_id
       AND r.id_usuario = ?
       AND r.entidade_tipo = d.entidade_tipo
       AND r.entidade_id = d.entidade_id
      WHERE d.tenant_id = ?
        AND d.ativo = 1
        ${moduloFilter}
        ${permFilter.sql}
        ${scopeFilter.sql}
        AND (
          LOWER(d.titulo) LIKE ?
          OR LOWER(d.subtitulo) LIKE ?
          OR LOWER(d.codigo_referencia) LIKE ?
          OR LOWER(d.termos_busca) LIKE ?
        )
      ORDER BY score DESC, d.atualizado_em DESC
      LIMIT ?
    `;

  const params = hasFulltext
    ? [
        ft,
        qNorm,
        qNorm,
        args.userId,
        args.tenantId,
        ...moduloParams,
        ...permFilter.params,
        ...scopeFilter.params,
        ft,
        like,
        like,
        like,
        like,
        limit,
      ]
    : [
        qNorm,
        qNorm,
        args.userId,
        args.tenantId,
        ...moduloParams,
        ...permFilter.params,
        ...scopeFilter.params,
        like,
        like,
        like,
        like,
        limit,
      ];

  const [rows]: any = await db.query(sql, params);
  const resultados = (rows as any[]).map(toResult);

  const gruposMap = new Map<GlobalSearchModulo, number>();
  for (const r of resultados) gruposMap.set(r.modulo, (gruposMap.get(r.modulo) || 0) + 1);
  const grupos = Array.from(gruposMap.entries()).map(([modulo, total]) => ({ modulo, total }));

  await registerSearchQuery({ tenantId: args.tenantId, userId: args.userId, query: q });

  return { query: q, resultados, grupos };
}

export async function getSearchSuggestions(args: { tenantId: number; userId: number }): Promise<GlobalSearchSuggestResponseDTO> {
  const permissions = await getCurrentUserPermissions(args.userId);
  const scope = await getDashboardScope({ id: args.userId, tenantId: args.tenantId });

  const quickActions = buildQuickActionResults({ permissions });

  let recentes: GlobalSearchResultDTO[] = [];
  try {
    const [rows]: any = await db.query(
      `
      SELECT query_texto AS query, ultima_busca_em AS ultimaBuscaEm, contador_uso AS contadorUso
      FROM usuarios_busca_recente
      WHERE tenant_id = ? AND id_usuario = ?
      ORDER BY ultima_busca_em DESC, contador_uso DESC
      LIMIT 8
      `,
      [args.tenantId, args.userId]
    );
    recentes = (rows as any[]).map((r) => ({
      id: `recente:${String(r.query)}`,
      type: 'RECENTE',
      modulo: 'GERAL',
      titulo: String(r.query),
      subtitulo: null,
      rota: null,
      score: 40,
    }));
  } catch {
    recentes = [];
  }

  let recentesResultados: GlobalSearchResultDTO[] = [];
  try {
    const permFilter = buildPermissionFilter(permissions);
    const scopeFilter = buildScopeFilter(scope);
    const [rows]: any = await db.query(
      `
      SELECT
        r.modulo AS modulo,
        r.entidade_tipo AS entidadeTipo,
        r.entidade_id AS entidadeId,
        r.titulo AS titulo,
        r.rota AS rota,
        r.contador_aberturas AS contadorAberturas,
        r.ultima_abertura_em AS ultimaAberturaEm
      FROM usuarios_busca_resultados_recentes r
      INNER JOIN busca_global_documentos d
        ON d.tenant_id = r.tenant_id
       AND d.entidade_tipo = r.entidade_tipo
       AND d.entidade_id = r.entidade_id
      WHERE r.tenant_id = ? AND r.id_usuario = ? AND d.ativo = 1
        ${permFilter.sql}
        ${scopeFilter.sql}
      ORDER BY r.ultima_abertura_em DESC, r.contador_aberturas DESC
      LIMIT 8
      `,
      [args.tenantId, args.userId, ...permFilter.params, ...scopeFilter.params]
    );
    recentesResultados = (rows as any[]).map((r) => ({
      id: `ent:${String(r.entidadeTipo)}:${Number(r.entidadeId)}`,
      type: 'ENTIDADE',
      modulo: String(r.modulo) as GlobalSearchModulo,
      entidadeTipo: String(r.entidadeTipo),
      entidadeId: Number(r.entidadeId),
      titulo: String(r.titulo),
      subtitulo: null,
      rota: String(r.rota),
      score: 60,
    }));
  } catch {
    recentesResultados = [];
  }

  let favoritos: GlobalSearchResultDTO[] = [];
  let atalhos: GlobalSearchResultDTO[] = [];
  try {
    const scopeTypes = [
      scope.empresaTotal ? 'EMPRESA' : null,
      ...(scope.diretorias?.length ? ['DIRETORIA'] : []),
      ...(scope.obras?.length ? ['OBRA'] : []),
      ...(scope.unidades?.length ? ['UNIDADE'] : []),
    ].filter(Boolean) as MenuScopeType[];
    const ctx: BuildMenuContext = { permissions, scopeTypes };
    const menu = buildMenuResponse(ctx);
    const menuItems: MenuItemDTO[] = [];
    for (const s of menu.secoes) collectMenuItems(s.items, menuItems);
    const byKey = new Map(menuItems.map((m) => [m.key, m]));

    try {
      const [favRows]: any = await db.query(
        `SELECT menu_key AS menuKey, ordem FROM usuarios_menu_favoritos WHERE tenant_id = ? AND id_usuario = ? ORDER BY ordem ASC, menu_key ASC LIMIT 8`,
        [args.tenantId, args.userId]
      );
      favoritos = (favRows as any[])
        .map((r) => byKey.get(String(r.menuKey)))
        .filter(Boolean)
        .map((it) => ({
          id: `favorito:${it!.key}`,
          type: 'FAVORITO',
          modulo: moduloFromMenuKey(it!.key),
          titulo: it!.label,
          subtitulo: null,
          rota: it!.href || null,
          score: 55,
        }));
    } catch {
      favoritos = [];
    }

    try {
      const [rows]: any = await db.query(
        `
        SELECT tipo_atalho AS tipo, titulo, href, menu_key AS menuKey
        FROM usuarios_atalhos_rapidos
        WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
        ORDER BY ordem ASC, id_usuario_atalho DESC
        LIMIT 8
        `,
        [args.tenantId, args.userId]
      );
      atalhos = (rows as any[])
        .map((r) => {
          if (String(r.tipo) === 'ROTA' && r.href) {
            return {
              id: `atalho:rota:${String(r.href)}`,
              type: 'ATALHO' as const,
              modulo: 'GERAL' as const,
              titulo: String(r.titulo),
              subtitulo: null,
              rota: String(r.href),
              score: 52,
            };
          }
          if (String(r.tipo) === 'MENU' && r.menuKey) {
            const it = byKey.get(String(r.menuKey));
            if (!it) return null;
            return {
              id: `atalho:menu:${it.key}`,
              type: 'ATALHO' as const,
              modulo: moduloFromMenuKey(it.key),
              titulo: it.label,
              subtitulo: null,
              rota: it.href || null,
              score: 52,
            };
          }
          return null;
        })
        .filter(Boolean) as any[];
    } catch {
      atalhos = [];
    }
  } catch {
    favoritos = [];
    atalhos = [];
  }

  return {
    recentes: recentes.length ? recentes : recentesResultados,
    favoritos,
    atalhos,
    acoes: quickActions,
  };
}

