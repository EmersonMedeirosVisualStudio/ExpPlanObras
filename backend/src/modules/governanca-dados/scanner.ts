import prisma from '../../plugins/prisma.js';
import { FIELD_CATALOG } from '../security-fields/catalog.js';

type Classification = 'PUBLICO' | 'INTERNO' | 'SENSIVEL' | 'RESTRITO';

function maxClass(a: Classification, b: Classification): Classification {
  const rank = (c: Classification) => (c === 'PUBLICO' ? 1 : c === 'INTERNO' ? 2 : c === 'SENSIVEL' ? 3 : 4);
  return rank(a) >= rank(b) ? a : b;
}

function mapClass(c: string): Classification {
  const s = String(c || '').toUpperCase();
  if (s === 'PUBLICO') return 'PUBLICO';
  if (s === 'SENSIVEL') return 'SENSIVEL';
  if (s === 'RESTRITO') return 'RESTRITO';
  return 'INTERNO';
}

export async function sincronizarCatalogoBasico(args: { tenantId: number }) {
  const domSeg = await prisma.governancaDadoDominio.upsert({
    where: { tenantId_codigoDominio: { tenantId: args.tenantId, codigoDominio: 'SEGURANCA' } },
    create: { tenantId: args.tenantId, codigoDominio: 'SEGURANCA', nomeDominio: 'Segurança de Dados', descricaoDominio: null, ativo: true },
    update: { nomeDominio: 'Segurança de Dados', ativo: true },
  });

  const byResource = new Map<string, { fields: Array<{ path: string; classification: Classification; mask: string | null }> }>();
  for (const f of FIELD_CATALOG as any[]) {
    const resource = String(f.resource || '').trim().toUpperCase();
    if (!resource) continue;
    const item = byResource.get(resource) || { fields: [] };
    item.fields.push({ path: String(f.path), classification: mapClass(String(f.classification)), mask: f.defaultMaskStrategy ? String(f.defaultMaskStrategy) : null });
    byResource.set(resource, item);
  }

  const createdAssets: Array<{ codigoAtivo: string; ativoId: number }> = [];
  for (const [resource, info] of byResource.entries()) {
    let classificacao: Classification = 'INTERNO';
    for (const f of info.fields) classificacao = maxClass(classificacao, f.classification);

    const codigoAtivo = `API.${resource}`;
    const ativo = await prisma.governancaDadoAtivo.upsert({
      where: { tenantId_codigoAtivo: { tenantId: args.tenantId, codigoAtivo } },
      create: {
        tenantId: args.tenantId,
        dominioId: domSeg.id,
        tipoAtivo: 'API',
        codigoAtivo,
        nomeAtivo: `API ${resource}`,
        descricaoAtivo: null,
        origemSistema: 'BACKEND',
        schemaNome: null,
        objetoNome: resource,
        datasetKey: null,
        classificacaoGlobal: classificacao,
        criticidadeNegocio: 'MEDIA',
        slaFreshnessMinutos: null,
        statusAtivo: 'ATIVO',
        metadataJson: { source: 'SECURITY_FIELDS_CATALOG' } as any,
      },
      update: {
        dominioId: domSeg.id,
        classificacaoGlobal: classificacao,
        statusAtivo: 'ATIVO',
      },
    });

    for (const f of info.fields) {
      await prisma.governancaDadoAtivoCampo.upsert({
        where: { ativoId_caminhoCampo: { ativoId: ativo.id, caminhoCampo: f.path } },
        create: {
          ativoId: ativo.id,
          caminhoCampo: f.path,
          nomeCampoExibicao: f.path,
          tipoDado: 'string',
          descricaoCampo: null,
          classificacaoCampo: f.classification,
          pii: f.classification === 'SENSIVEL' || f.classification === 'RESTRITO',
          campoChave: false,
          campoObrigatorio: false,
          campoMascaravel: !!f.mask,
          estrategiaMascaraPadrao: f.mask,
          origemCampo: null,
          ativo: true,
          metadataJson: { source: 'SECURITY_FIELDS_CATALOG' } as any,
        },
        update: {
          classificacaoCampo: f.classification,
          pii: f.classification === 'SENSIVEL' || f.classification === 'RESTRITO',
          campoMascaravel: !!f.mask,
          estrategiaMascaraPadrao: f.mask,
          ativo: true,
        },
      });
    }
    createdAssets.push({ codigoAtivo, ativoId: ativo.id });
  }

  return { dominios: [domSeg.codigoDominio], ativos: createdAssets };
}

