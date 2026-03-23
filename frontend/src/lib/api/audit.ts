import { db } from '@/lib/db';

export async function audit(params: {
  tenantId: number;
  userId?: number | null;
  entidade: string;
  idRegistro: string;
  acao: string;
  dadosAnteriores?: unknown;
  dadosNovos?: unknown;
}) {
  await db.execute(
    `INSERT INTO auditoria_eventos
      (tenant_id, id_usuario, entidade, id_registro, acao, dados_anteriores, dados_novos)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.tenantId,
      params.userId ?? null,
      params.entidade,
      params.idRegistro,
      params.acao,
      params.dadosAnteriores ? JSON.stringify(params.dadosAnteriores) : null,
      params.dadosNovos ? JSON.stringify(params.dadosNovos) : null,
    ]
  );
}
