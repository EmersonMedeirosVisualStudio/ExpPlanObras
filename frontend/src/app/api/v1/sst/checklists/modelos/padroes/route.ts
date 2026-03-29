import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sst_checklists_modelos (
      id_modelo_checklist BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      codigo VARCHAR(40) NULL,
      nome_modelo VARCHAR(160) NOT NULL,
      tipo_local_permitido VARCHAR(20) NOT NULL DEFAULT 'AMBOS',
      periodicidade VARCHAR(20) NOT NULL,
      abrange_terceirizados TINYINT(1) NOT NULL DEFAULT 1,
      exige_assinatura_executor TINYINT(1) NOT NULL DEFAULT 1,
      exige_ciencia_responsavel TINYINT(1) NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_modelo_checklist),
      KEY idx_tenant (tenant_id),
      KEY idx_codigo (tenant_id, codigo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );

  await db.query(
    `
    CREATE TABLE IF NOT EXISTS sst_checklists_modelos_itens (
      id_modelo_item BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      id_modelo_checklist BIGINT UNSIGNED NOT NULL,
      ordem_item INT NOT NULL DEFAULT 0,
      grupo_item VARCHAR(100) NULL,
      descricao_item VARCHAR(255) NOT NULL,
      tipo_resposta VARCHAR(30) NOT NULL DEFAULT 'OK_NOK_NA',
      obrigatorio TINYINT(1) NOT NULL DEFAULT 1,
      gera_nc_quando_reprovado TINYINT(1) NOT NULL DEFAULT 1,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id_modelo_item),
      KEY idx_modelo (id_modelo_checklist),
      CONSTRAINT fk_sst_modelo_item FOREIGN KEY (id_modelo_checklist) REFERENCES sst_checklists_modelos(id_modelo_checklist)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

type ItemPadrao = {
  ordemItem: number;
  grupoItem?: string | null;
  descricaoItem: string;
  tipoResposta?: string;
  obrigatorio?: boolean;
  geraNcQuandoReprovado?: boolean;
};

type ModeloPadrao = {
  codigo: string;
  nomeModelo: string;
  tipoLocalPermitido: 'OBRA' | 'UNIDADE' | 'AMBOS';
  periodicidade: 'DIARIO' | 'SEMANAL' | 'MENSAL' | 'PONTUAL';
  abrangeTerceirizados: boolean;
  exigeAssinaturaExecutor: boolean;
  exigeCienciaResponsavel: boolean;
  itens: ItemPadrao[];
};

function padroes(): ModeloPadrao[] {
  return [
    {
      codigo: 'EXEC_INICIO_SERVICO',
      nomeModelo: 'Execução — Checklist de início de serviço',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'PONTUAL',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Planejamento', descricaoItem: 'Serviço e local definidos (frente/trecho)' },
        { ordemItem: 20, grupoItem: 'Planejamento', descricaoItem: 'Equipe definida e presente no início' },
        { ordemItem: 30, grupoItem: 'Documentos', descricaoItem: 'Ordem de Serviço (OS) disponível para consulta', geraNcQuandoReprovado: false },
        { ordemItem: 40, grupoItem: 'Interferências', descricaoItem: 'Interferências verificadas (rede, solo, acesso)' },
        { ordemItem: 50, grupoItem: 'Segurança', descricaoItem: 'DDS realizado e EPI adequado (quando aplicável)' },
      ],
    },
    {
      codigo: 'EXEC_LIBERACAO_FRENTE',
      nomeModelo: 'Execução — Checklist de liberação de frente',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'PONTUAL',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Acesso', descricaoItem: 'Frente liberada (acesso, sinalização e isolamento)' },
        { ordemItem: 20, grupoItem: 'Interferências', descricaoItem: 'Rede/interferências mapeadas e controladas' },
        { ordemItem: 30, grupoItem: 'Materiais', descricaoItem: 'Materiais críticos disponíveis ou alternativa definida', geraNcQuandoReprovado: false },
        { ordemItem: 40, grupoItem: 'Equipamentos', descricaoItem: 'Equipamentos necessários disponíveis e seguros' },
      ],
    },
    {
      codigo: 'EXEC_CONCLUSAO_SERVICO',
      nomeModelo: 'Execução — Checklist de conclusão de serviço',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'PONTUAL',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Qualidade', descricaoItem: 'Serviço conforme padrão e especificação' },
        { ordemItem: 20, grupoItem: 'Qualidade', descricaoItem: 'Retrabalho verificado (não aplicável ou resolvido)', tipoResposta: 'OK_NOK_NA' },
        { ordemItem: 30, grupoItem: 'Organização', descricaoItem: 'Local limpo e organizado após execução' },
        { ordemItem: 40, grupoItem: 'Registro', descricaoItem: 'Fotos e evidências anexadas (quando aplicável)', geraNcQuandoReprovado: false },
      ],
    },
    {
      codigo: 'EXEC_INTERFERENCIAS',
      nomeModelo: 'Execução — Checklist de interferências (rede/solo/clima)',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'PONTUAL',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Rede', descricaoItem: 'Interferências de rede verificadas e sinalizadas' },
        { ordemItem: 20, grupoItem: 'Solo', descricaoItem: 'Condição do solo verificada (umidade/estabilidade)' },
        { ordemItem: 30, grupoItem: 'Clima', descricaoItem: 'Condição climática compatível com execução', tipoResposta: 'OK_NOK_NA' },
      ],
    },
    {
      codigo: 'EQP_DIARIO',
      nomeModelo: 'Equipamentos — Checklist diário',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'DIARIO',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Segurança', descricaoItem: 'Equipamento em condição segura (proteções e sinalização)' },
        { ordemItem: 20, grupoItem: 'Inspeção', descricaoItem: 'Vazamentos e ruídos anormais verificados', tipoResposta: 'OK_NOK_NA' },
        { ordemItem: 30, grupoItem: 'Operação', descricaoItem: 'Horímetro/odômetro anotado (quando aplicável)', geraNcQuandoReprovado: false },
        { ordemItem: 40, grupoItem: 'Combustível', descricaoItem: 'Abastecimento necessário planejado', tipoResposta: 'OK_NOK_NA', geraNcQuandoReprovado: false },
      ],
    },
    {
      codigo: 'EQP_PRE_OPERACAO',
      nomeModelo: 'Equipamentos — Checklist pré-operação',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'DIARIO',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Condições', descricaoItem: 'Freios, comandos e alertas funcionando' },
        { ordemItem: 20, grupoItem: 'Condições', descricaoItem: 'Pneus/esteiras em bom estado (quando aplicável)' },
        { ordemItem: 30, grupoItem: 'Segurança', descricaoItem: 'Área de operação isolada/sinalizada (quando aplicável)', tipoResposta: 'OK_NOK_NA' },
      ],
    },
    {
      codigo: 'EQP_MANUT_PREVENTIVA',
      nomeModelo: 'Equipamentos — Checklist de manutenção preventiva',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'SEMANAL',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Manutenção', descricaoItem: 'Manutenção preventiva realizada conforme plano', geraNcQuandoReprovado: false },
        { ordemItem: 20, grupoItem: 'Manutenção', descricaoItem: 'Peças/insumos críticos verificados (filtros/óleos)', tipoResposta: 'OK_NOK_NA' },
        { ordemItem: 30, grupoItem: 'Registro', descricaoItem: 'Evidência anexada (nota, foto, laudo) quando aplicável', tipoResposta: 'OK_NOK_NA', geraNcQuandoReprovado: false },
      ],
    },
    {
      codigo: 'QUAL_INSPECAO_SERVICO',
      nomeModelo: 'Qualidade — Inspeção de serviço',
      tipoLocalPermitido: 'OBRA',
      periodicidade: 'PONTUAL',
      abrangeTerceirizados: true,
      exigeAssinaturaExecutor: true,
      exigeCienciaResponsavel: false,
      itens: [
        { ordemItem: 10, grupoItem: 'Conformidade', descricaoItem: 'Serviço atende padrão e escopo contratado' },
        { ordemItem: 20, grupoItem: 'Conformidade', descricaoItem: 'Dimensões/execução dentro do aceitável (quando aplicável)', tipoResposta: 'OK_NOK_NA' },
        { ordemItem: 30, grupoItem: 'Registro', descricaoItem: 'Evidências anexadas (fotos/relatório) quando aplicável', tipoResposta: 'OK_NOK_NA', geraNcQuandoReprovado: false },
      ],
    },
  ];
}

export async function POST(_req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_CRUD);
    await ensureTables();

    const modelos = padroes();
    const resultado: any[] = [];

    await conn.beginTransaction();
    for (const m of modelos) {
      const [[exists]]: any = await conn.query(
        `SELECT id_modelo_checklist AS id FROM sst_checklists_modelos WHERE tenant_id = ? AND codigo = ? LIMIT 1`,
        [current.tenantId, m.codigo]
      );
      if (exists?.id) {
        resultado.push({ codigo: m.codigo, idModelo: Number(exists.id), criado: false });
        continue;
      }

      const [ins]: any = await conn.query(
        `
        INSERT INTO sst_checklists_modelos
          (tenant_id, codigo, nome_modelo, tipo_local_permitido, periodicidade,
           abrange_terceirizados, exige_assinatura_executor, exige_ciencia_responsavel, ativo)
        VALUES
          (?,?,?,?,?,?,?,?,1)
        `,
        [
          current.tenantId,
          m.codigo,
          m.nomeModelo,
          m.tipoLocalPermitido,
          m.periodicidade,
          m.abrangeTerceirizados ? 1 : 0,
          m.exigeAssinaturaExecutor ? 1 : 0,
          m.exigeCienciaResponsavel ? 1 : 0,
        ]
      );
      const idModelo = Number(ins.insertId);

      for (const it of m.itens) {
        await conn.query(
          `
          INSERT INTO sst_checklists_modelos_itens
            (id_modelo_checklist, ordem_item, grupo_item, descricao_item, tipo_resposta, obrigatorio, gera_nc_quando_reprovado, ativo)
          VALUES
            (?,?,?,?,?,?,?,1)
          `,
          [
            idModelo,
            Number(it.ordemItem || 0),
            it.grupoItem ?? null,
            it.descricaoItem,
            it.tipoResposta || 'OK_NOK_NA',
            it.obrigatorio === false ? 0 : 1,
            it.geraNcQuandoReprovado === false ? 0 : 1,
          ]
        );
      }

      resultado.push({ codigo: m.codigo, idModelo, criado: true });
    }
    await conn.commit();

    const criados = resultado.filter((r) => r.criado).length;
    const existentes = resultado.filter((r) => !r.criado).length;
    return ok({ criados, existentes, modelos: resultado });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
