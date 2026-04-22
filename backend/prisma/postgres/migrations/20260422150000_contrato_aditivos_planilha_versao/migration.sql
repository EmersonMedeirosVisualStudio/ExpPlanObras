ALTER TABLE "Contrato" ADD COLUMN "planilhaVersao" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ContratoAditivo" ADD COLUMN "alterouPlanilha" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ContratoAditivo" ADD COLUMN "dataInicioVigencia" TIMESTAMP(3);
ALTER TABLE "ContratoAditivo" ADD COLUMN "dataFimVigencia" TIMESTAMP(3);
ALTER TABLE "ContratoAditivo" ADD COLUMN "snapshotPlanilhaVersao" INTEGER;
ALTER TABLE "ContratoAditivo" ADD COLUMN "planilhaVersaoNova" INTEGER;

UPDATE "ContratoAditivo" SET "alterouPlanilha" = true WHERE UPPER("tipo") IN ('VALOR', 'AMBOS');
