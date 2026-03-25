import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_VIEW);
    const scope = await getDashboardScope(current);

    let obras: any[] = [];
    let unidades: any[] = [];
    let almoxarifados: any[] = [];
    let diretorias: any[] = [];

    if (scope.empresaTotal) {
      const [obrasRows]: any = await db.query(
        `
        SELECT o.id_obra AS id, CONCAT('Obra #', o.id_obra) AS nome
        FROM obras o
        INNER JOIN contratos c ON c.id_contrato = o.id_contrato
        WHERE c.tenant_id = ?
        ORDER BY o.id_obra DESC
        `,
        [current.tenantId]
      );

      const [unidadesRows]: any = await db.query(
        `
        SELECT id_unidade AS id, nome
        FROM unidades
        WHERE tenant_id = ? AND ativo = 1
        ORDER BY nome
        `,
        [current.tenantId]
      );

      obras = obrasRows as any[];
      unidades = unidadesRows as any[];

      try {
        const [dirRows]: any = await db.query(
          `
          SELECT id_setor AS id, nome_setor AS nome
          FROM organizacao_setores
          WHERE tenant_id = ? AND ativo = 1
          ORDER BY nome_setor
          `,
          [current.tenantId]
        );
        diretorias = dirRows as any[];
      } catch {
        diretorias = [];
      }

      try {
        const [almoxRows]: any = await db.query(
          `
          SELECT id_almoxarifado AS id, nome
          FROM almoxarifados
          WHERE tenant_id = ? AND ativo = 1
          ORDER BY nome
          `,
          [current.tenantId]
        );
        almoxarifados = almoxRows as any[];
      } catch {
        almoxarifados = [];
      }
    } else {
      if (scope.obras.length) {
        const ids = inClause(scope.obras);
        const [obrasRows]: any = await db.query(
          `
          SELECT o.id_obra AS id, CONCAT('Obra #', o.id_obra) AS nome
          FROM obras o
          INNER JOIN contratos c ON c.id_contrato = o.id_contrato
          WHERE c.tenant_id = ?
            AND o.id_obra IN ${ids.sql}
          ORDER BY o.id_obra DESC
          `,
          [current.tenantId, ...ids.params]
        );
        obras = obrasRows as any[];
      }

      if (scope.unidades.length) {
        const ids = inClause(scope.unidades);
        const [unidadesRows]: any = await db.query(
          `
          SELECT id_unidade AS id, nome
          FROM unidades
          WHERE tenant_id = ?
            AND id_unidade IN ${ids.sql}
            AND ativo = 1
          ORDER BY nome
          `,
          [current.tenantId, ...ids.params]
        );
        unidades = unidadesRows as any[];
      }

      if (scope.diretorias.length) {
        try {
          const ids = inClause(scope.diretorias);
          const [dirRows]: any = await db.query(
            `
            SELECT id_setor AS id, nome_setor AS nome
            FROM organizacao_setores
            WHERE tenant_id = ?
              AND id_setor IN ${ids.sql}
              AND ativo = 1
            ORDER BY nome_setor
            `,
            [current.tenantId, ...ids.params]
          );
          diretorias = dirRows as any[];
        } catch {
          diretorias = [];
        }
      }

      if (scope.obras.length || scope.unidades.length) {
        try {
          const obraIds = scope.obras.length ? inClause(scope.obras) : null;
          const unidadeIds = scope.unidades.length ? inClause(scope.unidades) : null;

          const parts: string[] = [];
          const params: any[] = [current.tenantId];

          if (obraIds) {
            parts.push(`(tipo_local = 'OBRA' AND id_obra IN ${obraIds.sql})`);
            params.push(...obraIds.params);
          }
          if (unidadeIds) {
            parts.push(`(tipo_local = 'UNIDADE' AND id_unidade IN ${unidadeIds.sql})`);
            params.push(...unidadeIds.params);
          }

          if (parts.length) {
            const [almoxRows]: any = await db.query(
              `
              SELECT id_almoxarifado AS id, nome
              FROM almoxarifados
              WHERE tenant_id = ? AND ativo = 1
                AND (${parts.join(' OR ')})
              ORDER BY nome
              `,
              params
            );
            almoxarifados = almoxRows as any[];
          }
        } catch {
          almoxarifados = [];
        }
      }
    }

    return ok({
      empresaTotal: scope.empresaTotal,
      diretorias,
      obras,
      unidades,
      almoxarifados,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
