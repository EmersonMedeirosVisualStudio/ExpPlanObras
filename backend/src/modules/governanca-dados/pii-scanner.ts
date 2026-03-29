import prisma from '../../plugins/prisma.js';
import { applyMask } from '../security-fields/maskers.js';
import { detectByFieldName, detectByValue, type PiiType } from './pii-detectors.js';

function mapToMask(type: PiiType) {
  if (type === 'CPF') return 'CPF';
  if (type === 'CNPJ') return 'CNPJ';
  if (type === 'EMAIL') return 'EMAIL';
  return 'PHONE';
}

function suggestClassification(type: PiiType) {
  if (type === 'CPF' || type === 'CNPJ') return 'RESTRITO';
  return 'SENSIVEL';
}

function maxConfidence(a: string, b: string) {
  const rank = (x: string) => (x === 'CONFIRMADO' ? 3 : x === 'PROVAVEL' ? 2 : x === 'SUSPEITO' ? 1 : 0);
  return rank(a) >= rank(b) ? a : b;
}

export async function executarScanPiiAmostral(args: { tenantId: number; userId: number; ativoId: number; sampleSize?: number }) {
  const ativo = await prisma.governancaDadoAtivo.findUnique({ where: { id: args.ativoId } }).catch(() => null);
  if (!ativo || ativo.tenantId !== args.tenantId) return { ok: false as const, reason: 'ATIVO_INVALIDO' };

  const alvoChave = String(ativo.codigoAtivo);
  const scan = await prisma.governancaPiiScan.create({
    data: {
      tenantId: args.tenantId,
      tipoScan: 'AMOSTRAL',
      alvoTipo: 'ATIVO',
      alvoChave,
      statusScan: 'PROCESSANDO',
      executadoPorUserId: args.userId,
    },
  });

  const campos = await prisma.governancaDadoAtivoCampo.findMany({
    where: { ativoId: ativo.id, ativo: true },
    orderBy: [{ caminhoCampo: 'asc' }],
  });

  const modelName = ativo.objetoNome ? String(ativo.objetoNome) : null;
  const model = modelName && (prisma as any)[modelName] ? (prisma as any)[modelName] : null;
  if (!model) {
    await prisma.governancaPiiScan.update({
      where: { id: scan.id },
      data: { statusScan: 'ERRO', finalizadoEm: new Date(), resultadoResumoJson: { error: 'OBJETO_NAO_SUPORTADO' } as any },
    });
    return { ok: false as const, reason: 'OBJETO_NAO_SUPORTADO', scanId: scan.id };
  }

  const take = Math.min(Math.max(Number(args.sampleSize || 20), 1), 50);
  const rows = (await model.findMany({ where: { tenantId: args.tenantId }, take, orderBy: { id: 'desc' } }).catch(() => [])) as any[];

  const results: Array<{ campoId: number; fieldPath: string; piiType: PiiType; confidence: string; maskedSample: string | null; detector: string }> = [];

  for (const c of campos) {
    const fieldPath = String(c.caminhoCampo);
    const byName = detectByFieldName(fieldPath);
    let detectedType: PiiType | null = byName ? byName.type : null;
    let confidence = byName ? byName.confidence : 'NAO_IDENTIFICADO';
    let detector = byName ? 'FIELD_NAME' : '';
    let maskedSample: string | null = null;

    for (const r of rows) {
      const v = r?.[fieldPath];
      const byValue = detectByValue(v);
      if (!byValue) continue;
      detectedType = byValue.type;
      confidence = maxConfidence(confidence, byValue.confidence);
      detector = detector ? `${detector}+VALUE` : 'VALUE';
      const mask = mapToMask(byValue.type);
      maskedSample = String(applyMask(mask as any, v) ?? '');
      if (byValue.confidence === 'CONFIRMADO') break;
    }

    if (!detectedType || confidence === 'NAO_IDENTIFICADO') continue;
    results.push({ campoId: c.id, fieldPath, piiType: detectedType, confidence, maskedSample, detector });
  }

  const createdResults: number[] = [];
  for (const r of results) {
    const classificacao = suggestClassification(r.piiType);
    const row = await prisma.governancaPiiScanResultado.create({
      data: {
        tenantId: args.tenantId,
        scanId: scan.id,
        ativoId: ativo.id,
        campoId: r.campoId,
        tipoDetectado: r.piiType,
        nivelConfianca: r.confidence,
        statusResultado: r.confidence,
        amostraMascarada: r.maskedSample,
        regraDetector: r.detector,
        sugestaoClassificacao: classificacao,
        metadataJson: { fieldPath: r.fieldPath } as any,
      },
    });
    createdResults.push(row.id);

    await prisma.governancaClassificacaoSugestao.create({
      data: {
        tenantId: args.tenantId,
        ativoId: ativo.id,
        campoId: r.campoId,
        origemSugestao: 'SCAN',
        classificacaoSugerida: classificacao,
        categoriaSugerida: `PII_${r.piiType}`,
        scoreConfianca: r.confidence === 'CONFIRMADO' ? 0.95 : r.confidence === 'PROVAVEL' ? 0.75 : 0.55,
        statusSugestao: 'PENDENTE',
      },
    });
  }

  await prisma.governancaPiiScan.update({
    where: { id: scan.id },
    data: {
      statusScan: 'CONCLUIDO',
      finalizadoEm: new Date(),
      totalItens: campos.length,
      totalSuspeitos: results.length,
      resultadoResumoJson: { results: results.length, sampleSize: take, modelName } as any,
    },
  });

  return { ok: true as const, scanId: scan.id, results: createdResults.length };
}

