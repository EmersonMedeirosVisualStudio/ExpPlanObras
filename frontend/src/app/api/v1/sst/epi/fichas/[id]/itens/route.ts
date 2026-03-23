import { db } from '@/lib/db';
import { created, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_EPI_ENTREGA);
    const { id } = await context.params;
    const idFicha = Number(id);
    const body = await req.json();
    if (!body.idEpi || !body.dataEntrega) return fail(422, 'EPI e data obrigatórios');

    const [fichaRows]: any = await db.query(`SELECT * FROM sst_epi_fichas WHERE id_ficha_epi = ? AND tenant_id = ?`, [idFicha, current.tenantId]);
    if (!fichaRows.length) return fail(404, 'Ficha não encontrada');
    if (!['EM_PREENCHIMENTO', 'ATIVA'].includes(String(fichaRows[0].status_ficha || ''))) {
      return fail(422, 'Ficha não aceita novos itens');
    }

    const [epiRows]: any = await db.query(`SELECT * FROM sst_epi_catalogo WHERE id_epi = ? AND tenant_id = ? AND ativo = 1`, [
      body.idEpi,
      current.tenantId,
    ]);
    if (!epiRows.length) return fail(404, 'EPI não encontrado');

    const caValidade = epiRows[0].ca_validade ? new Date(epiRows[0].ca_validade) : null;
    if (caValidade && new Date(body.dataEntrega) > caValidade) {
      if (!body.excecaoCaVencido) return fail(422, 'CA do EPI está vencido para a data de entrega');
      if (!String(body?.motivoMovimentacao || '').trim()) return fail(422, 'Formalize o motivo da exceção');
    }

    let dataPrevistaTroca: string | null = null;
    if (epiRows[0].vida_util_dias) {
      const [[row]]: any = await db.query(`SELECT DATE_ADD(DATE(?), INTERVAL ? DAY) dt`, [String(body.dataEntrega), Number(epiRows[0].vida_util_dias)]);
      dataPrevistaTroca = row?.dt ? String(row.dt).slice(0, 10) : null;
    }

    const [result]: any = await db.query(
      `
      INSERT INTO sst_epi_fichas_itens
      (id_ficha_epi, id_epi, quantidade_entregue, tamanho, data_entrega, data_prevista_troca, status_item, observacao)
      VALUES (?, ?, ?, ?, ?, ?, 'ENTREGUE', ?)
      `,
      [
        idFicha,
        body.idEpi,
        body.quantidadeEntregue || 1,
        body.tamanho || null,
        body.dataEntrega,
        dataPrevistaTroca,
        body.observacao || null,
      ]
    );

    await db.query(`UPDATE sst_epi_fichas SET status_ficha = 'ATIVA' WHERE id_ficha_epi = ? AND tenant_id = ? AND status_ficha = 'EM_PREENCHIMENTO'`, [
      idFicha,
      current.tenantId,
    ]);

    return created({ id: result.insertId, dataPrevistaTroca });
  } catch (e) {
    return handleApiError(e);
  }
}
