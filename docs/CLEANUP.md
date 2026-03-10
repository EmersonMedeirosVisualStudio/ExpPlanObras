Limpeza e organização (recomendado)

Objetivo: evitar confusão entre SQLite (dev) e PostgreSQL (prod), e impedir que arquivos locais sejam versionados no GitHub.

Estrutura correta

- render.yaml (raiz do repositório)
- backend/prisma/schema.prisma (SQLite DEV)
- backend/prisma/migrations/* (migrações SQLite DEV)
- backend/prisma/postgres/schema.prisma (Postgres PROD)
- backend/prisma/postgres/migrations/* (migrações Postgres PROD)

O que NÃO deve ficar versionado

- backend/prisma/dev.db (banco SQLite local)
- backend/dist (build local)
- arquivos “soltos” na raiz do repositório do GitHub como:
  - schema.prisma (na raiz)
  - migration.sql (na raiz)
  - renderyaml (sem ponto)

Checklist de limpeza no GitHub (manual)

1) Renomear render.yaml
- Se existir um arquivo chamado "renderyaml", renomeie para "render.yaml"

2) Remover arquivos soltos na raiz
- Apague "migration.sql" e "schema.prisma" se estiverem na raiz do repositório

3) Conferir pasta Postgres no backend
- Deve existir: backend/prisma/postgres/schema.prisma
- Deve existir: backend/prisma/postgres/migrations/migration_lock.toml
- Deve existir: backend/prisma/postgres/migrations/<timestamp>_init/migration.sql

