ALTER TABLE "Documento" DROP CONSTRAINT "Documento_obraId_fkey";
ALTER TABLE "Documento" ALTER COLUMN "obraId" DROP NOT NULL;
ALTER TABLE "Documento"
  ADD COLUMN "contratoId" INTEGER,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "categoriaDocumento" TEXT NOT NULL DEFAULT 'OBRA:OUTROS',
  ADD COLUMN "tituloDocumento" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "descricaoDocumento" TEXT,
  ADD COLUMN "statusDocumento" TEXT NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN "idVersaoAtual" INTEGER;

UPDATE "Documento"
SET
  "categoriaDocumento" = COALESCE(NULLIF("type", ''), "categoriaDocumento"),
  "tituloDocumento" = COALESCE(NULLIF("name", ''), "tituloDocumento"),
  "updatedAt" = COALESCE("uploadedAt", CURRENT_TIMESTAMP)
WHERE "tituloDocumento" = '' OR "tituloDocumento" IS NULL;

ALTER TABLE "Documento"
  ADD CONSTRAINT "Documento_obraId_fkey"
  FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Documento"
  ADD CONSTRAINT "Documento_contratoId_fkey"
  FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Documento_contratoId_idx" ON "Documento"("contratoId");

ALTER TABLE "DocumentoVersao"
  ADD COLUMN "hashSha256PdfCarimbado" TEXT,
  ADD COLUMN "nomeArquivoOriginal" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "tamanhoBytes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "conteudoOriginal" BYTEA,
  ADD COLUMN "conteudoPdfCarimbado" BYTEA,
  ADD COLUMN "statusVersao" TEXT NOT NULL DEFAULT 'ATIVA',
  ADD COLUMN "finalizadaEm" TIMESTAMP(3),
  ADD COLUMN "verificacaoToken" TEXT,
  ADD COLUMN "fluxoJson" JSONB,
  ADD COLUMN "assinaturasJson" JSONB,
  ADD COLUMN "historicoJson" JSONB;

CREATE UNIQUE INDEX "DocumentoVersao_verificacaoToken_key" ON "DocumentoVersao"("verificacaoToken");
