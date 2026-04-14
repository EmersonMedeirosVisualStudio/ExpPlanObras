CREATE TABLE "EmpresaTitular" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "roleCode" TEXT NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),

    CONSTRAINT "EmpresaTitular_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmpresaTitular_tenantId_roleCode_idx" ON "EmpresaTitular"("tenantId", "roleCode");
CREATE INDEX "EmpresaTitular_funcionarioId_idx" ON "EmpresaTitular"("funcionarioId");

ALTER TABLE "EmpresaTitular" ADD CONSTRAINT "EmpresaTitular_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmpresaTitular" ADD CONSTRAINT "EmpresaTitular_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
