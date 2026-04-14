CREATE TABLE "EmpresaTitular" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "roleCode" TEXT NOT NULL,
    "funcionarioId" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataInicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" DATETIME,
    CONSTRAINT "EmpresaTitular_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmpresaTitular_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Funcionario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmpresaTitular_tenantId_roleCode_idx" ON "EmpresaTitular"("tenantId", "roleCode");
CREATE INDEX "EmpresaTitular_funcionarioId_idx" ON "EmpresaTitular"("funcionarioId");
