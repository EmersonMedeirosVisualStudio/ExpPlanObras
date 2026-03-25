import type { PendenciaSignal } from './types';
import { db } from '@/lib/db';

export type PendenciaProviderContext = { tenantId: number; userId: number };

export type PendenciaProvider = {
  chavePendencia: string;
  modulo: string;
  entidadeTipo: string;
  collect: (ctx: PendenciaProviderContext) => Promise<PendenciaSignal[]>;
};

async function safeRows(sql: string, params: any[]) {
  try {
    const [rows]: any = await db.query(sql, params);
    return rows as any[];
  } catch {
    return [];
  }
}

export const PENDENCIA_PROVIDERS: PendenciaProvider[] = [
  {
    chavePendencia: 'ENG_MEDICAO_ATRASADA',
    modulo: 'ENGENHARIA',
    entidadeTipo: 'MEDICAO',
    async collect(ctx) {
      const rows = await safeRows(
        `
        SELECT
          m.id_medicao AS id,
          c.numero_contrato AS numeroContrato,
          m.data_prevista_envio AS dataPrevista,
          m.status_medicao AS statusMedicao
        FROM contratos_medicoes m
        INNER JOIN contratos c ON c.id_contrato = m.id_contrato
        WHERE c.tenant_id = ?
          AND m.status_medicao IN ('EM_ELABORACAO','ENVIADA')
          AND m.data_prevista_envio IS NOT NULL
          AND m.data_prevista_envio < CURDATE()
        ORDER BY m.data_prevista_envio ASC
        LIMIT 200
        `,
        [ctx.tenantId]
      );

      return rows.map((r: any) => {
        const id = Number(r.id);
        const dataPrevista = r.dataPrevista ? new Date(r.dataPrevista).toISOString() : null;
        const vencimentoEm = dataPrevista ? dataPrevista : new Date().toISOString();
        return {
          modulo: 'ENGENHARIA',
          chavePendencia: 'ENG_MEDICAO_ATRASADA',
          entidadeTipo: 'MEDICAO',
          entidadeId: id,
          titulo: `Medição atrasada (${String(r.numeroContrato || '')})`,
          descricao: `Status ${String(r.statusMedicao || '')}`,
          severidade: 'ALTA',
          referenciaData: dataPrevista,
          vencimentoEm,
          rota: '/dashboard/execucao/medicoes',
          responsavelUserId: null,
        } satisfies PendenciaSignal;
      });
    },
  },
];

