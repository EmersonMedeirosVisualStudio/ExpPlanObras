---
name: biome-skill
description: >
  Use esta skill para configurar e usar Biome no projeto expertObras:
  linting, formatting, import sorting, regras TypeScript/React, integração
  com VS Code, pre-commit hooks e CI. Biome substitui ESLint + Prettier.
  Aplica em backend (Fastify/Node) e frontend (Next.js/React).
---

# Biome Skill — expertObras
## Biome substitui ESLint + Prettier em um único binário, zero config externa

Antes de qualquer tarefa envolvendo lint/format, leia a seção relevante:

| Precisa de...                         | Seção                           |
|---------------------------------------|---------------------------------|
| Rodar lint/format pela primeira vez   | [Setup](#setup)                 |
| Configurar regras no biome.json       | [Config](#config)               |
| Integrar com VS Code                  | [VS Code](#vscode)              |
| Adicionar ao pre-commit               | [Pre-commit](#precommit)        |
| Erros comuns e como resolver          | [Troubleshooting](#trouble)     |

---

## Setup {#setup}

```bash
# Instalar (já instalado no projeto)
npm install -D --save-exact @biomejs/biome

# Inicializar config (já existe biome.json)
npx biome init
```

**Scripts disponíveis (backend e frontend):**

```bash
npm run check          # lint + format check (sem alterar arquivos)
npm run check:fix      # lint + format, aplica correções automáticas
npm run lint           # só lint
npm run lint:fix       # lint + auto-fix
npm run format         # só format check
npm run format:write   # aplica formatação
```

**Uso direto:**

```bash
# Check completo (lint + format + imports)
npx biome check ./src

# Aplicar todas as correções automáticas
npx biome check --write ./src

# Verificar arquivo específico
npx biome check src/modules/auth/infrastructure/http/auth.routes.ts

# Format only
npx biome format --write ./src
```

---

## Config {#config}

O `biome.json` fica na raiz de `backend/` e `frontend/`. Estrutura principal:

```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  }
}
```

### Desabilitar regra pontualmente (use com parcimônia)

```ts
// biome-ignore lint/suspicious/noExplicitAny: Prisma raw query necessita any
async function withRLS(tx: any) { ... }

// biome-ignore lint/correctness/noUnusedVariables: usado indiretamente via decorator
const _handler = ...
```

### Ignorar arquivo/pasta inteira

No `biome.json` → `files.ignore`:
```json
{
  "files": {
    "ignore": ["node_modules", "dist", "prisma/postgres/migrations", "*.generated.ts"]
  }
}
```

---

## Regras importantes ativas {#config}

| Regra | Severity | Comportamento |
|-------|----------|---------------|
| `noExplicitAny` | warn | Avisa sobre `any` — preferir `unknown` |
| `noUnusedVariables` | warn | Variáveis declaradas e não usadas |
| `noUnusedImports` | warn | Imports não utilizados — remover |
| `useConst` | error | `let` sem reassign → deve ser `const` |
| `noVar` | error | Proibido usar `var` |
| `noConsoleLog` | warn | `console.log` em produção (usar `logger`) |
| `useTemplate` | warn | String concatenação → template literal |
| `organizeImports` | auto | Ordena imports automaticamente |

---

## VS Code {#vscode}

Instalar extensão: **`biomejs.biome`** (Biome — oficial)

No `.vscode/settings.json` do projeto:

```json
{
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome",
    "editor.formatOnSave": true
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "biomejs.biome",
    "editor.formatOnSave": true
  },
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome",
    "editor.formatOnSave": true
  },
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  }
}
```

**Import sorting automático no save:**
Biome reorganiza imports ao salvar quando `organizeImports.enabled: true` no `biome.json`.

---

## Pre-commit integration {#precommit}

Adicionar ao `scripts/pre-commit-check.sh`:

```bash
echo "  → backend: biome check"
cd backend && npx biome check ./src --diagnostic-level=error
cd ..

echo "  → frontend: biome check"
cd frontend && npx biome check ./src --diagnostic-level=error
cd ..
```

`--diagnostic-level=error` → bloqueia commit apenas em erros (não em warns).

---

## Troubleshooting {#trouble}

### "The imports and exports are not sorted"

Biome ordena imports por caminho de módulo (alfabético). Corrija manualmente ou:
```bash
npx biome check --write src/arquivo.ts
```

### "This import is unused"

Import presente no arquivo mas não referenciado. Remover ou marcar:
```ts
// biome-ignore lint/correctness/noUnusedImports: needed for side effects
import '@/lib/setup.js'
```

### Conflict com TypeScript path aliases (`@/`)

Biome respeita o `tsconfig.json` automaticamente se `vcs.useIgnoreFile: true` e
o projeto está numa workspace git. Sem configuração extra necessária.

### Formatter reformatou meu arquivo mas typecheck falhou

Biome apenas formata — não altera lógica. Se typecheck falhou após format,
o erro era pré-existente. Rodar `npm run typecheck` antes do format.

### Biome vs Prettier conflito

Se o projeto tinha Prettier antes, remover:
```bash
npm remove prettier eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
rm .eslintrc* .prettierrc* .eslintignore .prettierignore
```
