# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the AutoScanner monorepo with a working `api-gateway` exposing JWT auth (REST `/auth/*`), a GraphQL `me` query, healthchecks, Prometheus metrics, and a minimal Prisma data model — all wired into a docker-compose dev stack with CI.

**Architecture:** Nx 20 monorepo (`apps/` + `libs/`). Single NestJS app `api-gateway` consuming shared libs (`config`, `logging`, `common`, `database`, `auth`). PostgreSQL via Prisma 6 ORM. Auth via REST endpoints (JWT access + opaque refresh, stored hashed). GraphQL Apollo (code-first) for the `me` query. Pino structured logs, prom-client metrics. Dev stack via `docker-compose.dev.yml` (Postgres + Redis + MinIO + Mongo). GitHub Actions CI.

**Tech stack:** Node 22 LTS, pnpm 9, Nx 20, NestJS 11, Prisma 6, TypeScript 5.5, Apollo Server 4 (`@nestjs/graphql` v13 code-first), graphql 16, Pino 9, prom-client 15, argon2, jsonwebtoken, otpauth, Zod, Jest, Supertest, Docker Compose v2.

**Spec reference:** `docs/superpowers/specs/2026-05-24-autoscanner-platform-design.md` § 1 (Phase 0), § 4 (Prisma), § 5 (Auth), § 13 (REST endpoints), § 22 (observability), § 24 (dev env), § 26 (CI).

**Scope choices for Phase 0 (deliberately reduced vs full spec):**
- Auth endpoints are REST-only (`/auth/login`, `/auth/refresh`, `/auth/logout`). The corresponding GraphQL mutations listed in spec § 12.2 are deferred — Phase 0 only ships GraphQL `me` query.
- Auth lib includes TOTP helper code, but TOTP enable/confirm endpoints are NOT exposed in Phase 0 (no opt-in flow yet).
- JWT secret rotation (`JWT_PREVIOUS_SECRET`) is NOT wired in Phase 0; deferred to Phase 6 hardening.
- `Engagements` module only ships create/list/get — no scope rules, no tags, no archiving. Just enough to prove Prisma + GraphQL + auth work together.
- No agent, no scheduler, no workers, no queues, no scanner runner, no MongoDB usage (Mongo is in compose but unused). Those land in Phase 1+.
- ReadinessProbe checks Postgres + Redis + MinIO; skips Mongo (unused in P0).

**Critère de complétion Phase 0 :**
```
git clone … && cd autoscanner
pnpm install
cp .env.example .env && edit .env
docker compose -f docker/docker-compose.dev.yml up -d
pnpm prisma migrate deploy
pnpm seed
pnpm nx serve api-gateway
# Then:
curl -X POST http://localhost:4000/auth/login \
     -H 'content-type: application/json' \
     -d '{"email":"admin@local","password":"changeme"}'
# → returns {accessToken, refreshToken}
# Then in GraphQL Sandbox @ http://localhost:4000/graphql with Authorization: Bearer <accessToken>:
#   query { me { id email } }
# → returns {id: "...", email: "admin@local"}
curl http://localhost:4000/health      # → 200 {"status":"ok"}
curl http://localhost:4000/ready       # → 200 {"db":"ok","redis":"ok","s3":"ok"}
curl http://localhost:4000/metrics     # → prometheus exposition text
```
CI green on PR.

---

## Repository file map (after Phase 0 completion)

```
autoscanner/
├── .editorconfig
├── .env.example
├── .eslintignore
├── .eslintrc.json
├── .gitattributes
├── .github/
│   └── workflows/
│       └── ci.yml
├── .gitignore
├── .husky/
│   ├── commit-msg
│   └── pre-commit
├── .nvmrc
├── .prettierignore
├── .prettierrc
├── README.md
├── apps/
│   └── api-gateway/
│       ├── jest.config.ts
│       ├── project.json
│       ├── src/
│       │   ├── app/
│       │   │   ├── app.module.ts
│       │   │   ├── graphql-error.formatter.ts
│       │   │   ├── auth/
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.module.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── decorators/
│       │   │   │   │   ├── current-user.decorator.ts
│       │   │   │   │   └── public.decorator.ts
│       │   │   │   ├── dto/
│       │   │   │   │   ├── login.dto.ts
│       │   │   │   │   └── refresh.dto.ts
│       │   │   │   ├── guards/
│       │   │   │   │   └── jwt-auth.guard.ts
│       │   │   │   └── strategies/
│       │   │   │       └── jwt.strategy.ts
│       │   │   ├── engagements/
│       │   │   │   ├── dto/
│       │   │   │   │   ├── create-engagement.input.ts
│       │   │   │   │   ├── engagement.object.ts
│       │   │   │   │   └── engagement-status.enum.ts
│       │   │   │   ├── engagements.module.ts
│       │   │   │   ├── engagements.resolver.ts
│       │   │   │   └── engagements.service.ts
│       │   │   ├── health/
│       │   │   │   ├── health.controller.ts
│       │   │   │   ├── health.module.ts
│       │   │   │   └── readiness.service.ts
│       │   │   ├── metrics/
│       │   │   │   ├── metrics.controller.ts
│       │   │   │   ├── metrics.module.ts
│       │   │   │   └── metrics.service.ts
│       │   │   ├── system/
│       │   │   │   ├── system.module.ts
│       │   │   │   └── system.resolver.ts
│       │   │   └── users/
│       │   │       ├── dto/
│       │   │       │   └── user.object.ts
│       │   │       ├── users.module.ts
│       │   │       ├── users.resolver.ts
│       │   │       └── users.service.ts
│       │   ├── main.ts
│       │   └── schema.gql                     # generated (gitignored)
│       ├── test/
│       │   ├── auth.e2e-spec.ts
│       │   ├── engagements.e2e-spec.ts
│       │   ├── graphql-me.e2e-spec.ts
│       │   ├── health.e2e-spec.ts
│       │   └── jest-e2e.config.ts
│       ├── tsconfig.app.json
│       └── tsconfig.json
├── docker/
│   └── docker-compose.dev.yml
├── docs/
│   └── superpowers/
│       ├── plans/
│       │   └── 2026-05-24-phase-0-foundations.md      # this file
│       └── specs/
│           └── 2026-05-24-autoscanner-platform-design.md
├── jest.config.ts                             # nx root jest
├── jest.preset.js
├── libs/
│   ├── auth/
│   │   ├── README.md
│   │   ├── jest.config.ts
│   │   ├── project.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── jwt/
│   │   │   │   ├── jwt.helpers.ts
│   │   │   │   └── jwt.helpers.spec.ts
│   │   │   ├── password/
│   │   │   │   ├── password.service.ts
│   │   │   │   └── password.service.spec.ts
│   │   │   └── totp/
│   │   │       ├── totp.service.ts
│   │   │       └── totp.service.spec.ts
│   │   ├── tsconfig.json
│   │   └── tsconfig.lib.json
│   ├── common/
│   │   ├── README.md
│   │   ├── jest.config.ts
│   │   ├── project.json
│   │   ├── src/
│   │   │   ├── crypto/
│   │   │   │   ├── secret-box.ts
│   │   │   │   └── secret-box.spec.ts
│   │   │   ├── errors/
│   │   │   │   └── domain.errors.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── tsconfig.lib.json
│   ├── config/
│   │   ├── README.md
│   │   ├── jest.config.ts
│   │   ├── project.json
│   │   ├── src/
│   │   │   ├── config.module.ts
│   │   │   ├── config.service.ts
│   │   │   ├── env.schema.ts
│   │   │   ├── env.schema.spec.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── tsconfig.lib.json
│   ├── database/
│   │   ├── README.md
│   │   ├── jest.config.ts
│   │   ├── project.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── tsconfig.json
│   │   └── tsconfig.lib.json
│   └── logging/
│       ├── README.md
│       ├── jest.config.ts
│       ├── project.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── logger.factory.ts
│       │   ├── logger.factory.spec.ts
│       │   └── logging.module.ts
│       ├── tsconfig.json
│       └── tsconfig.lib.json
├── nx.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prisma/
│   ├── migrations/
│   │   └── <timestamp>_init/
│   │       └── migration.sql
│   ├── schema.prisma
│   └── seed.ts
├── tools/                                     # placeholder for Phase 1+ scanner images
│   └── .gitkeep
└── tsconfig.base.json
```

---

## Task 1: Initialize Nx workspace + base files

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `nx.json`
- Create: `tsconfig.base.json`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `tools/.gitkeep`

- [ ] **Step 1.1: Create `.nvmrc`**

```bash
echo "22" > .nvmrc
```

- [ ] **Step 1.2: Create `.gitattributes`** (LF everywhere — avoids the CRLF noise we already hit)

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.pdf binary
```

- [ ] **Step 1.3: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
build/
out/
tmp/
.nx/cache/
.nx/workspace-data/

# IDE
.vscode/
!.vscode/extensions.json
.idea/
*.iml

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Env
.env
.env.local
.env.*.local

# Prisma generated
prisma/migrations/migration_lock.toml.bak

# GraphQL generated (regenerated on serve)
apps/*/src/schema.gql

# Coverage / test artifacts
coverage/
.jest-cache/

# MinIO local data (if mounted)
docker/data/
```

- [ ] **Step 1.4: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 1.5: Create `.env.example`**

```bash
# === Server ===
NODE_ENV=development
API_PORT=4000
API_HOST=0.0.0.0
FRONTEND_URL=http://localhost:5173

# === Auth ===
JWT_SECRET=replace-me-with-64-random-hex-chars
ACCESS_TOKEN_TTL_SECONDS=900            # 15 min
REFRESH_TOKEN_TTL_SECONDS=2592000       # 30 days
MASTER_ENCRYPTION_KEY=replace-me-base64-32-bytes

# === Postgres ===
DATABASE_URL=postgresql://autoscanner:dev@localhost:5432/autoscanner

# === MongoDB === (unused in Phase 0, prepared)
MONGODB_URL=mongodb://localhost:27017/autoscanner

# === Redis ===
REDIS_URL=redis://localhost:6379

# === MinIO / S3 ===
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=autoscanner
S3_SECRET_KEY=devpassword

# === Logging ===
LOG_LEVEL=info
LOG_PRETTY=true

# === Operator seed ===
OPERATOR_EMAIL=admin@local
OPERATOR_PASSWORD=changeme

# === Telemetry ===
PROMETHEUS_PORT=9091
```

- [ ] **Step 1.6: Create `package.json`**

```json
{
  "name": "autoscanner",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=22 <23",
    "pnpm": ">=9 <10"
  },
  "scripts": {
    "build": "nx run-many -t build",
    "test": "nx run-many -t test",
    "test:e2e": "nx run-many -t e2e",
    "lint": "nx run-many -t lint",
    "type-check": "nx run-many -t type-check",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio",
    "seed": "tsx prisma/seed.ts",
    "dev:up": "docker compose -f docker/docker-compose.dev.yml up -d",
    "dev:down": "docker compose -f docker/docker-compose.dev.yml down",
    "dev:logs": "docker compose -f docker/docker-compose.dev.yml logs -f"
  },
  "devDependencies": {
    "@nx/eslint": "20.3.0",
    "@nx/eslint-plugin": "20.3.0",
    "@nx/jest": "20.3.0",
    "@nx/js": "20.3.0",
    "@nx/nest": "20.3.0",
    "@nx/node": "20.3.0",
    "@nx/workspace": "20.3.0",
    "@swc-node/register": "1.10.9",
    "@swc/core": "1.10.1",
    "@swc/helpers": "0.5.15",
    "@types/jest": "29.5.14",
    "@types/node": "22.10.2",
    "@typescript-eslint/eslint-plugin": "8.18.1",
    "@typescript-eslint/parser": "8.18.1",
    "eslint": "9.17.0",
    "eslint-config-prettier": "9.1.0",
    "eslint-plugin-import": "2.31.0",
    "jest": "29.7.0",
    "jest-environment-node": "29.7.0",
    "nx": "20.3.0",
    "prettier": "3.4.2",
    "prisma": "6.1.0",
    "ts-jest": "29.2.5",
    "ts-node": "10.9.2",
    "tsx": "4.19.2",
    "typescript": "5.7.2"
  },
  "dependencies": {
    "@prisma/client": "6.1.0"
  }
}
```

- [ ] **Step 1.7: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - apps/*
  - libs/*
```

- [ ] **Step 1.8: Create `nx.json`**

```json
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json",
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)",
      "!{projectRoot}/tsconfig.spec.json",
      "!{projectRoot}/jest.config.[jt]s",
      "!{projectRoot}/src/test-setup.[jt]s",
      "!{projectRoot}/test-setup.[jt]s",
      "!{projectRoot}/test/**/*",
      "!{projectRoot}/eslint.config.*"
    ],
    "sharedGlobals": [
      "{workspaceRoot}/tsconfig.base.json",
      "{workspaceRoot}/.env.example"
    ]
  },
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production"]
    },
    "lint": {
      "cache": true,
      "inputs": ["default", "{workspaceRoot}/.eslintrc.json"]
    },
    "type-check": {
      "cache": true,
      "inputs": ["default", "^production"]
    }
  },
  "defaultBase": "main",
  "plugins": [
    {
      "plugin": "@nx/eslint/plugin",
      "options": { "targetName": "lint" }
    },
    {
      "plugin": "@nx/jest/plugin",
      "options": { "targetName": "test" }
    }
  ]
}
```

- [ ] **Step 1.9: Create `tsconfig.base.json`**

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2023"],
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "baseUrl": ".",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@autoscanner/auth": ["libs/auth/src/index.ts"],
      "@autoscanner/common": ["libs/common/src/index.ts"],
      "@autoscanner/config": ["libs/config/src/index.ts"],
      "@autoscanner/database": ["libs/database/src/index.ts"],
      "@autoscanner/logging": ["libs/logging/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
```

- [ ] **Step 1.10: Create placeholder `tools/.gitkeep`**

```bash
mkdir -p tools && touch tools/.gitkeep
```

- [ ] **Step 1.11: Install dependencies**

Run:
```bash
pnpm install
```

Expected: pnpm resolves and installs all devDependencies; creates `pnpm-lock.yaml` and `node_modules/`.

- [ ] **Step 1.12: Verify Nx is functional**

Run:
```bash
pnpm nx --version
pnpm nx report
```

Expected: prints Nx 20.3.0 and a report with no projects yet.

- [ ] **Step 1.13: Commit**

```bash
git add .nvmrc .gitignore .gitattributes .editorconfig .env.example \
        package.json pnpm-workspace.yaml pnpm-lock.yaml nx.json \
        tsconfig.base.json tools/.gitkeep
git commit -m "chore: initialize Nx workspace and base configuration"
```

---

## Task 2: Linting, formatting, commit hooks

**Files:**
- Create: `.eslintrc.json`
- Create: `.eslintignore`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `commitlint.config.js`
- Modify: `package.json` (add husky + commitlint + lint-staged deps and `prepare` script)

- [ ] **Step 2.1: Add dev deps**

Run:
```bash
pnpm add -D -w husky@9.1.7 lint-staged@15.2.11 \
  @commitlint/cli@19.6.1 @commitlint/config-conventional@19.6.0
```

- [ ] **Step 2.2: Update `package.json` to add `prepare` and `lint-staged` config**

Edit `package.json` — add `"prepare": "husky"` to `scripts`, and add at the bottom (top-level):

```json
  "lint-staged": {
    "*.{ts,tsx,js,json,md,yaml,yml}": ["prettier --write"],
    "*.{ts,tsx}": ["eslint --fix"]
  }
```

- [ ] **Step 2.3: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2.4: Create `.prettierignore`**

```
node_modules
dist
build
.nx
coverage
pnpm-lock.yaml
prisma/migrations
apps/*/src/schema.gql
```

- [ ] **Step 2.5: Create `.eslintrc.json`**

```json
{
  "root": true,
  "ignorePatterns": ["**/*"],
  "plugins": ["@nx", "@typescript-eslint"],
  "overrides": [
    {
      "files": ["*.ts", "*.tsx", "*.js", "*.jsx"],
      "rules": {
        "@nx/enforce-module-boundaries": [
          "error",
          {
            "enforceBuildableLibDependency": true,
            "allow": [],
            "depConstraints": [
              {
                "sourceTag": "scope:app",
                "onlyDependOnLibsWithTags": ["scope:lib"]
              },
              {
                "sourceTag": "scope:lib",
                "onlyDependOnLibsWithTags": ["scope:lib"]
              }
            ]
          }
        ]
      }
    },
    {
      "files": ["*.ts", "*.tsx"],
      "extends": [
        "plugin:@nx/typescript",
        "plugin:@typescript-eslint/recommended",
        "prettier"
      ],
      "rules": {
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-empty-function": "off"
      }
    },
    {
      "files": ["*.js", "*.jsx"],
      "extends": ["plugin:@nx/javascript", "prettier"]
    },
    {
      "files": ["*.spec.ts", "*.spec.tsx", "test/**/*.ts"],
      "env": { "jest": true },
      "rules": {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
}
```

- [ ] **Step 2.6: Create `.eslintignore`**

```
node_modules
dist
.nx
coverage
prisma/migrations
apps/*/src/schema.gql
```

- [ ] **Step 2.7: Create `commitlint.config.js`**

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
```

- [ ] **Step 2.8: Initialize Husky**

Run:
```bash
pnpm prepare
mkdir -p .husky
```

- [ ] **Step 2.9: Create `.husky/pre-commit`**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm exec lint-staged
```

Then:
```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 2.10: Create `.husky/commit-msg`**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm exec commitlint --edit "$1"
```

Then:
```bash
chmod +x .husky/commit-msg
```

- [ ] **Step 2.11: Verify Prettier works**

Run:
```bash
pnpm format:check
```

Expected: completes without error (no files to reformat).

- [ ] **Step 2.12: Commit**

```bash
git add .eslintrc.json .eslintignore .prettierrc .prettierignore \
        .husky/pre-commit .husky/commit-msg commitlint.config.js \
        package.json pnpm-lock.yaml
git commit -m "chore: add linting, formatting, and commit hooks"
```

(The commit-msg hook will run commitlint on this very commit — message above is conventional, will pass.)

---

## Task 3: Docker Compose dev stack

**Files:**
- Create: `docker/docker-compose.dev.yml`

- [ ] **Step 3.1: Create `docker/docker-compose.dev.yml`**

```yaml
name: autoscanner-dev

services:
  postgres:
    image: postgres:16-alpine
    container_name: autoscanner-postgres
    environment:
      POSTGRES_USER: autoscanner
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: autoscanner
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U autoscanner -d autoscanner"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: autoscanner-redis
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  mongo:
    image: mongo:7
    container_name: autoscanner-mongo
    ports:
      - "27017:27017"
    volumes:
      - mongodata:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.runCommand({ ping: 1 }).ok"]
      interval: 10s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    container_name: autoscanner-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: autoscanner
      MINIO_ROOT_PASSWORD: devpassword
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 10

  minio-bootstrap:
    image: minio/mc:latest
    container_name: autoscanner-minio-bootstrap
    depends_on:
      minio:
        condition: service_healthy
    entrypoint:
      - /bin/sh
      - -c
      - |
        mc alias set local http://minio:9000 autoscanner devpassword &&
        mc mb --ignore-existing local/raw-outputs local/reports local/uploads local/pcap local/screenshots local/backups local/cve-mirror &&
        echo "MinIO buckets ready"
    restart: "no"

volumes:
  pgdata:
  redisdata:
  mongodata:
  miniodata:
```

- [ ] **Step 3.2: Bring up the stack**

Run:
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

Expected: 5 containers pulled and started.

- [ ] **Step 3.3: Wait for health and verify each service**

Run:
```bash
docker compose -f docker/docker-compose.dev.yml ps
```

Expected: `postgres`, `redis`, `mongo`, `minio` show `(healthy)`. `minio-bootstrap` should be `Exited (0)` after creating buckets.

Then verify each manually:
```bash
docker exec autoscanner-postgres pg_isready -U autoscanner
# → autoscanner:5432 - accepting connections

docker exec autoscanner-redis redis-cli ping
# → PONG

docker exec autoscanner-mongo mongosh --quiet --eval 'db.runCommand({ping:1}).ok'
# → 1

curl -sf http://localhost:9000/minio/health/live && echo OK
# → OK
```

- [ ] **Step 3.4: Verify MinIO buckets**

Run:
```bash
docker run --rm --network host minio/mc \
  /bin/sh -c "mc alias set local http://localhost:9000 autoscanner devpassword >/dev/null && mc ls local"
```

Expected: lists `raw-outputs/ reports/ uploads/ pcap/ screenshots/ backups/ cve-mirror/`.

- [ ] **Step 3.5: Commit**

```bash
git add docker/docker-compose.dev.yml
git commit -m "chore: add docker-compose dev stack (postgres, redis, mongo, minio)"
```

---

## Task 4: Prisma — minimal initial schema + migration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_init/migration.sql` (generated)

This task ships the minimum Prisma schema needed for Phase 0 (User, Session, Engagement, ScopeRule, Asset). Full schema lives in the spec; we'll grow this incrementally per phase.

- [ ] **Step 4.1: Copy `.env.example` to `.env`**

Run:
```bash
cp .env.example .env
```

Then edit `.env`:
- Replace `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` output.
- Replace `MASTER_ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` output.

Verify with:
```bash
grep -E '^(JWT_SECRET|MASTER_ENCRYPTION_KEY)=' .env
```

Both should be non-empty and not equal to the placeholder.

- [ ] **Step 4.2: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearchPostgres"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto, citext, pg_trgm]
}

// =====================================================================
// AUTH
// =====================================================================

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  displayName   String?
  totpSecretEnc Bytes?    // AES-256-GCM ciphertext (Phase 0: schema only)
  totpEnabled   Boolean   @default(false)
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  sessions    Session[]
  engagements Engagement[]

  @@index([deletedAt])
}

model Session {
  id               String    @id @default(cuid())
  userId           String
  refreshTokenHash String    @unique
  userAgent        String?
  ip               String?
  expiresAt        DateTime
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

// =====================================================================
// ENGAGEMENTS (minimal Phase 0 surface)
// =====================================================================

enum EngagementStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
  ARCHIVED
}

model Engagement {
  id          String           @id @default(cuid())
  ownerId     String
  name        String
  clientName  String
  description String?
  scopeText   String?
  startDate   DateTime?
  endDate     DateTime?
  status      EngagementStatus @default(DRAFT)
  metadata    Json?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  deletedAt   DateTime?

  owner      User        @relation(fields: [ownerId], references: [id])
  scopeRules ScopeRule[]
  assets     Asset[]

  @@index([ownerId])
  @@index([status])
  @@index([deletedAt])
}

enum ScopeRuleType {
  INCLUDE
  EXCLUDE
}

enum ScopeRuleTarget {
  CIDR
  IP
  DOMAIN
  WILDCARD_DOMAIN
  URL
}

model ScopeRule {
  id           String          @id @default(cuid())
  engagementId String
  ruleType     ScopeRuleType
  targetType   ScopeRuleTarget
  value        String
  notes        String?
  createdAt    DateTime        @default(now())

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  @@index([engagementId])
}

// =====================================================================
// ASSETS (skeletal — Phase 1+ expands)
// =====================================================================

enum AssetType {
  DOMAIN
  SUBDOMAIN
  IP_ADDRESS
  URL
  HOSTNAME
  NETWORK
  CLOUD_RESOURCE
  CONTAINER
  WIFI_AP
}

model Asset {
  id             String    @id @default(cuid())
  engagementId   String
  type           AssetType
  value          String
  canonicalValue String
  firstSeenAt    DateTime  @default(now())
  lastSeenAt     DateTime  @default(now())
  riskScore      Float     @default(0)
  metadata       Json?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  // Real uniqueness applied via partial unique index in migration SQL
  // (see migration.sql edit in step 4.4).
  @@index([engagementId, type, canonicalValue])
  @@index([engagementId])
  @@index([type])
  @@index([deletedAt])
}
```

- [ ] **Step 4.3: Generate initial migration**

Run:
```bash
pnpm prisma migrate dev --name init
```

Expected:
- Prisma connects to Postgres on `localhost:5432`.
- Creates database extensions (`pgcrypto`, `citext`, `pg_trgm`).
- Creates tables: `User`, `Session`, `Engagement`, `ScopeRule`, `Asset` plus enums.
- Writes `prisma/migrations/<timestamp>_init/migration.sql`.
- Generates Prisma Client to `node_modules/.prisma/client`.

If migration fails (`extension … is not available`), make sure Postgres image is the one from `docker-compose.dev.yml` (alpine variant has these extensions bundled).

- [ ] **Step 4.4: Add partial unique index for `Asset.canonicalValue`**

Edit the generated `prisma/migrations/<timestamp>_init/migration.sql` — append at the end:

```sql
-- Partial unique: enforce uniqueness only among non-soft-deleted assets
CREATE UNIQUE INDEX "Asset_engagement_type_canonical_active_uq"
ON "Asset" ("engagementId", "type", "canonicalValue")
WHERE "deletedAt" IS NULL;
```

Then rebuild migration state:
```bash
pnpm prisma migrate reset --force --skip-seed
pnpm prisma migrate deploy
```

Expected: migration applied cleanly.

- [ ] **Step 4.5: Verify schema in Postgres**

Run:
```bash
docker exec autoscanner-postgres psql -U autoscanner -d autoscanner -c '\dt'
```

Expected output includes `Asset`, `Engagement`, `ScopeRule`, `Session`, `User`, `_prisma_migrations`.

```bash
docker exec autoscanner-postgres psql -U autoscanner -d autoscanner -c '\di "Asset_engagement_type_canonical_active_uq"'
```

Expected: index exists.

- [ ] **Step 4.6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): initial Prisma schema (User, Session, Engagement, ScopeRule, Asset)"
```

---

## Task 5: lib `config` — Zod env schema + ConfigService

**Files:**
- Create: `libs/config/project.json`
- Create: `libs/config/tsconfig.json`
- Create: `libs/config/tsconfig.lib.json`
- Create: `libs/config/jest.config.ts`
- Create: `libs/config/README.md`
- Create: `libs/config/src/index.ts`
- Create: `libs/config/src/env.schema.ts`
- Create: `libs/config/src/env.schema.spec.ts`
- Create: `libs/config/src/config.module.ts`
- Create: `libs/config/src/config.service.ts`

- [ ] **Step 5.1: Generate lib via Nx**

Run:
```bash
pnpm nx g @nx/nest:lib config --directory=libs/config --buildable --strict --no-interactive
```

Expected: Nx generates `libs/config/` with `project.json`, `tsconfig*.json`, `src/index.ts`, `src/lib/config.module.ts`. We will overwrite or extend the generated files.

- [ ] **Step 5.2: Add Zod dependency**

Run:
```bash
pnpm add -w zod@3.24.1
```

- [ ] **Step 5.3: Write failing test `libs/config/src/env.schema.spec.ts`**

Replace any test scaffold:

```typescript
import { EnvSchema } from './env.schema';

describe('EnvSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    API_PORT: '4000',
    API_HOST: '0.0.0.0',
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'a'.repeat(64),
    ACCESS_TOKEN_TTL_SECONDS: '900',
    REFRESH_TOKEN_TTL_SECONDS: '2592000',
    MASTER_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    MONGODB_URL: 'mongodb://localhost:27017/x',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'a',
    S3_SECRET_KEY: 'b',
    LOG_LEVEL: 'info',
    LOG_PRETTY: 'true',
    OPERATOR_EMAIL: 'admin@local',
    OPERATOR_PASSWORD: 'changeme',
    PROMETHEUS_PORT: '9091',
  };

  it('parses valid env and coerces types', () => {
    const parsed = EnvSchema.parse(validEnv);
    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.LOG_PRETTY).toBe(true);
    expect(parsed.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it('rejects when JWT_SECRET is too short', () => {
    expect(() => EnvSchema.parse({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects when MASTER_ENCRYPTION_KEY is not 32 bytes base64', () => {
    expect(() => EnvSchema.parse({ ...validEnv, MASTER_ENCRYPTION_KEY: 'abc' })).toThrow(
      /MASTER_ENCRYPTION_KEY/,
    );
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() => EnvSchema.parse({ ...validEnv, NODE_ENV: 'banana' })).toThrow();
  });

  it('rejects invalid LOG_LEVEL', () => {
    expect(() => EnvSchema.parse({ ...validEnv, LOG_LEVEL: 'shouty' })).toThrow();
  });
});
```

- [ ] **Step 5.4: Run test — expect failure**

Run:
```bash
pnpm nx test config
```

Expected: FAIL — `env.schema` module not found.

- [ ] **Step 5.5: Implement `libs/config/src/env.schema.ts`**

```typescript
import { z } from 'zod';

const numericString = (defaultValue?: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number(v)))
    .refine((v) => v !== undefined && Number.isFinite(v), {
      message: 'must be a number',
    }) as unknown as z.ZodType<number>;

const booleanString = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const base64Bytes = (length: number, field: string) =>
  z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, 'base64').length === length;
      } catch {
        return false;
      }
    },
    { message: `${field} must be ${length} bytes encoded as base64` },
  );

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),

  API_PORT: numericString(4000),
  API_HOST: z.string().default('0.0.0.0'),
  FRONTEND_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL_SECONDS: numericString(900),
  REFRESH_TOKEN_TTL_SECONDS: numericString(2_592_000),
  MASTER_ENCRYPTION_KEY: base64Bytes(32, 'MASTER_ENCRYPTION_KEY'),

  DATABASE_URL: z.string().url(),
  MONGODB_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: booleanString,

  OPERATOR_EMAIL: z.string().email(),
  OPERATOR_PASSWORD: z.string().min(8),

  PROMETHEUS_PORT: numericString(9091),
});

export type AppEnv = z.infer<typeof EnvSchema>;
```

- [ ] **Step 5.6: Run test — expect pass**

Run:
```bash
pnpm nx test config
```

Expected: PASS, 5 tests green.

- [ ] **Step 5.7: Implement `libs/config/src/config.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AppEnv, EnvSchema } from './env.schema';

@Injectable()
export class AppConfigService {
  readonly env: AppEnv;

  constructor() {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const formatted = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment variables:\n${formatted}`);
    }
    this.env = parsed.data;
  }

  get isProd(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }
}
```

- [ ] **Step 5.8: Implement `libs/config/src/config.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './config.service';

@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
```

- [ ] **Step 5.9: Rewrite `libs/config/src/index.ts`**

```typescript
export * from './config.module';
export * from './config.service';
export * from './env.schema';
```

- [ ] **Step 5.10: Add NestJS deps (used by this and subsequent libs)**

Run:
```bash
pnpm add -w @nestjs/common@11.0.0 @nestjs/core@11.0.0 reflect-metadata@0.2.2 rxjs@7.8.1
```

- [ ] **Step 5.11: Write `libs/config/README.md`**

```markdown
# @autoscanner/config

Type-safe environment configuration backed by Zod.

- `AppConfigService.env` — fully-typed env object validated at startup
- Fails fast on any missing or invalid env var with a clear diff
- Exposes `isProd`, `isTest` convenience getters

Import:
```ts
import { AppConfigModule, AppConfigService } from '@autoscanner/config';
```
```

- [ ] **Step 5.12: Lint, type-check, test**

Run:
```bash
pnpm nx run-many -t lint,type-check,test --projects=config
```

Expected: all green.

- [ ] **Step 5.13: Commit**

```bash
git add libs/config/ package.json pnpm-lock.yaml tsconfig.base.json
git commit -m "feat(config): add Zod-validated environment configuration lib"
```

---

## Task 6: lib `logging` — Pino + NestJS module

**Files:**
- Create: `libs/logging/project.json` (via generator)
- Create: `libs/logging/src/index.ts`
- Create: `libs/logging/src/logger.factory.ts`
- Create: `libs/logging/src/logger.factory.spec.ts`
- Create: `libs/logging/src/logging.module.ts`
- Create: `libs/logging/README.md`

- [ ] **Step 6.1: Generate lib**

Run:
```bash
pnpm nx g @nx/nest:lib logging --directory=libs/logging --buildable --strict --no-interactive
```

- [ ] **Step 6.2: Add deps**

Run:
```bash
pnpm add -w pino@9.5.0 pino-http@10.3.0 pino-pretty@13.0.0 nestjs-pino@4.2.0
```

- [ ] **Step 6.3: Write failing test `libs/logging/src/logger.factory.spec.ts`**

```typescript
import { buildPinoOptions } from './logger.factory';

describe('buildPinoOptions', () => {
  it('returns pretty transport in dev with LOG_PRETTY=true', () => {
    const opts = buildPinoOptions({ level: 'debug', pretty: true, env: 'development', appName: 'api-gateway' });
    expect(opts.level).toBe('debug');
    expect(opts.transport).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true, translateTime: 'SYS:standard', colorize: true },
    });
    expect(opts.base).toEqual({ app: 'api-gateway', env: 'development' });
  });

  it('omits transport in production', () => {
    const opts = buildPinoOptions({ level: 'info', pretty: false, env: 'production', appName: 'api-gateway' });
    expect(opts.transport).toBeUndefined();
    expect(opts.redact).toBeDefined();
  });

  it('redacts sensitive fields', () => {
    const opts = buildPinoOptions({ level: 'info', pretty: false, env: 'production', appName: 'x' });
    expect(opts.redact?.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.passwordHash',
        '*.refreshToken',
        '*.refreshTokenHash',
        '*.accessToken',
        '*.token',
        '*.secret',
        '*.apiKey',
      ]),
    );
  });
});
```

- [ ] **Step 6.4: Run test — expect failure**

Run:
```bash
pnpm nx test logging
```

Expected: FAIL — module not found.

- [ ] **Step 6.5: Implement `libs/logging/src/logger.factory.ts`**

```typescript
import { LoggerOptions } from 'pino';

export interface BuildPinoOptionsInput {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  pretty: boolean;
  env: string;
  appName: string;
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.refreshTokenHash',
  '*.accessToken',
  '*.token',
  '*.secret',
  '*.apiKey',
];

export function buildPinoOptions(input: BuildPinoOptionsInput): LoggerOptions {
  const opts: LoggerOptions = {
    level: input.level,
    base: { app: input.appName, env: input.env },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,
  };

  if (input.pretty) {
    opts.transport = {
      target: 'pino-pretty',
      options: { singleLine: true, translateTime: 'SYS:standard', colorize: true },
    };
  }

  return opts;
}
```

- [ ] **Step 6.6: Run test — expect pass**

Run:
```bash
pnpm nx test logging
```

Expected: PASS, 3 tests green.

- [ ] **Step 6.7: Implement `libs/logging/src/logging.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { buildPinoOptions } from './logger.factory';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        pinoHttp: {
          ...buildPinoOptions({
            level: cfg.env.LOG_LEVEL,
            pretty: cfg.env.LOG_PRETTY,
            env: cfg.env.NODE_ENV,
            appName: 'api-gateway',
          }),
          customProps: (req) => ({
            reqId: (req as { id?: string }).id ?? undefined,
          }),
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggingModule {}
```

- [ ] **Step 6.8: Rewrite `libs/logging/src/index.ts`**

```typescript
export * from './logger.factory';
export * from './logging.module';
```

- [ ] **Step 6.9: Add lib to tsconfig paths (already in step 1.9, verify)**

Verify `tsconfig.base.json` contains:
```json
"@autoscanner/logging": ["libs/logging/src/index.ts"]
```

(Already present from Task 1.)

- [ ] **Step 6.10: Write `libs/logging/README.md`**

```markdown
# @autoscanner/logging

Pino + nestjs-pino preconfigured with structured JSON output, sensitive-field redaction, pretty mode in dev.

Import `AppLoggingModule` in your app module.
```

- [ ] **Step 6.11: Lint, type-check, test**

Run:
```bash
pnpm nx run-many -t lint,type-check,test --projects=logging
```

Expected: all green.

- [ ] **Step 6.12: Commit**

```bash
git add libs/logging/ package.json pnpm-lock.yaml
git commit -m "feat(logging): add Pino-based structured logging lib"
```

---

## Task 7: lib `common` — domain errors + AES-256-GCM secret-box

**Files:**
- Create: `libs/common/` (via generator, `@nx/js:lib`)
- Create: `libs/common/src/errors/domain.errors.ts`
- Create: `libs/common/src/crypto/secret-box.ts`
- Create: `libs/common/src/crypto/secret-box.spec.ts`
- Create: `libs/common/src/index.ts`
- Create: `libs/common/README.md`

- [ ] **Step 7.1: Generate lib**

Run:
```bash
pnpm nx g @nx/js:lib common --directory=libs/common --buildable --strict --no-interactive --bundler=tsc
```

- [ ] **Step 7.2: Write `libs/common/src/errors/domain.errors.ts`**

```typescript
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, key: string | Record<string, unknown>) {
    super(
      `${entity} not found: ${typeof key === 'string' ? key : JSON.stringify(key)}`,
      'NOT_FOUND',
    );
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid credentials', 'INVALID_CREDENTIALS');
  }
}

export class SessionExpiredError extends DomainError {
  constructor() {
    super('Session expired', 'SESSION_EXPIRED');
  }
}

export class SessionRevokedError extends DomainError {
  constructor() {
    super('Session revoked', 'SESSION_REVOKED');
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly issues?: unknown) {
    super(message, 'VALIDATION');
  }
}
```

- [ ] **Step 7.3: Write failing test `libs/common/src/crypto/secret-box.spec.ts`**

```typescript
import { SecretBox } from './secret-box';

describe('SecretBox (AES-256-GCM)', () => {
  const key = Buffer.alloc(32, 1).toString('base64'); // deterministic 32-byte key for test

  it('round-trips a plaintext', () => {
    const box = new SecretBox(key);
    const plaintext = 'hello world';
    const ct = box.seal(plaintext);
    expect(ct).toBeInstanceOf(Buffer);
    expect(ct.length).toBeGreaterThan(plaintext.length); // nonce(12) + tag(16) + ct
    const out = box.open(ct);
    expect(out).toBe(plaintext);
  });

  it('round-trips a Buffer payload', () => {
    const box = new SecretBox(key);
    const plain = Buffer.from([1, 2, 3, 4]);
    const ct = box.seal(plain);
    expect(box.openRaw(ct)).toEqual(plain);
  });

  it('produces different ciphertexts for same plaintext (random nonce)', () => {
    const box = new SecretBox(key);
    const a = box.seal('same');
    const b = box.seal('same');
    expect(a.equals(b)).toBe(false);
  });

  it('throws on tampered ciphertext', () => {
    const box = new SecretBox(key);
    const ct = box.seal('payload');
    ct[ct.length - 1] ^= 0xff;
    expect(() => box.open(ct)).toThrow();
  });

  it('throws if key is not 32 bytes', () => {
    expect(() => new SecretBox(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
```

- [ ] **Step 7.4: Run test — expect failure**

Run:
```bash
pnpm nx test common
```

Expected: FAIL — `secret-box` module not found.

- [ ] **Step 7.5: Implement `libs/common/src/crypto/secret-box.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      throw new Error(`SecretBox key must be 32 bytes (got ${key.length})`);
    }
    this.key = key;
  }

  seal(plaintext: string | Buffer): Buffer {
    const plain = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, tag, ct]);
  }

  open(ciphertext: Buffer): string {
    return this.openRaw(ciphertext).toString('utf8');
  }

  openRaw(ciphertext: Buffer): Buffer {
    if (ciphertext.length < NONCE_BYTES + TAG_BYTES) {
      throw new Error('ciphertext too short');
    }
    const nonce = ciphertext.subarray(0, NONCE_BYTES);
    const tag = ciphertext.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
    const ct = ciphertext.subarray(NONCE_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}
```

- [ ] **Step 7.6: Run test — expect pass**

Run:
```bash
pnpm nx test common
```

Expected: PASS, 5 tests green.

- [ ] **Step 7.7: Rewrite `libs/common/src/index.ts`**

```typescript
export * from './errors/domain.errors';
export * from './crypto/secret-box';
```

- [ ] **Step 7.8: Write `libs/common/README.md`**

```markdown
# @autoscanner/common

Shared domain primitives reused across libs and apps.

- `DomainError` hierarchy (`NotFoundError`, `InvalidCredentialsError`, …)
- `SecretBox` — AES-256-GCM authenticated encryption (used for TOTP secrets, credential storage, notification channel configs)
```

- [ ] **Step 7.9: Lint, type-check, test**

Run:
```bash
pnpm nx run-many -t lint,type-check,test --projects=common
```

Expected: all green.

- [ ] **Step 7.10: Commit**

```bash
git add libs/common/
git commit -m "feat(common): add domain errors and AES-256-GCM SecretBox"
```

---

## Task 8: lib `database` — PrismaService + PrismaModule

**Files:**
- Create: `libs/database/` via generator
- Create: `libs/database/src/prisma.service.ts`
- Create: `libs/database/src/prisma.module.ts`
- Create: `libs/database/src/index.ts`
- Create: `libs/database/README.md`

- [ ] **Step 8.1: Generate lib**

Run:
```bash
pnpm nx g @nx/nest:lib database --directory=libs/database --buildable --strict --no-interactive
```

- [ ] **Step 8.2: Implement `libs/database/src/prisma.service.ts`**

```typescript
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
```

- [ ] **Step 8.3: Implement `libs/database/src/prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 8.4: Rewrite `libs/database/src/index.ts`**

```typescript
export * from './prisma.module';
export * from './prisma.service';
```

- [ ] **Step 8.5: Write `libs/database/README.md`**

```markdown
# @autoscanner/database

`PrismaService` extends `PrismaClient` and is wired as a global NestJS provider.

Import `PrismaModule` once in your app module; inject `PrismaService` anywhere.
```

- [ ] **Step 8.6: Smoke test via Nx**

(There's no unit test that adds value here — PrismaClient is its own integration concern. Lib will be exercised via api-gateway e2e tests.)

Run:
```bash
pnpm nx run-many -t lint,type-check --projects=database
```

Expected: green.

- [ ] **Step 8.7: Commit**

```bash
git add libs/database/
git commit -m "feat(database): add PrismaService and PrismaModule"
```

---

## Task 9: lib `auth` — password hashing (argon2id)

**Files:**
- Create: `libs/auth/` via generator
- Create: `libs/auth/src/password/password.service.ts`
- Create: `libs/auth/src/password/password.service.spec.ts`
- Create: `libs/auth/src/index.ts`
- Create: `libs/auth/README.md`

- [ ] **Step 9.1: Generate lib**

Run:
```bash
pnpm nx g @nx/js:lib auth --directory=libs/auth --buildable --strict --no-interactive --bundler=tsc
```

- [ ] **Step 9.2: Add deps**

Run:
```bash
pnpm add -w argon2@0.41.1 jsonwebtoken@9.0.2 otpauth@9.3.6
pnpm add -D -w @types/jsonwebtoken@9.0.7
```

- [ ] **Step 9.3: Write failing test `libs/auth/src/password/password.service.spec.ts`**

```typescript
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes a password and verifies it', async () => {
    const hash = await svc.hash('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await svc.verify(hash, 'correct-horse-battery-staple')).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await svc.hash('s3cret');
    expect(await svc.verify(hash, 'wrong')).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await svc.hash('same');
    const b = await svc.hash('same');
    expect(a).not.toBe(b);
  });

  it('verify returns false on garbage hash', async () => {
    expect(await svc.verify('not-a-hash', 'whatever')).toBe(false);
  });
});
```

- [ ] **Step 9.4: Run test — expect failure**

Run:
```bash
pnpm nx test auth
```

Expected: FAIL — module not found.

- [ ] **Step 9.5: Implement `libs/auth/src/password/password.service.ts`**

```typescript
import argon2 from 'argon2';

const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 9.6: Run test — expect pass**

Run:
```bash
pnpm nx test auth
```

Expected: PASS, 4 tests green. (Each hash takes ~200ms due to memoryCost, so test runtime is a few seconds. Acceptable.)

- [ ] **Step 9.7: Initialize `libs/auth/src/index.ts`**

```typescript
export * from './password/password.service';
```

- [ ] **Step 9.8: Lint + type-check**

Run:
```bash
pnpm nx run-many -t lint,type-check --projects=auth
```

Expected: green.

- [ ] **Step 9.9: Commit**

```bash
git add libs/auth/ package.json pnpm-lock.yaml
git commit -m "feat(auth): add argon2id PasswordService"
```

---

## Task 10: lib `auth` — JWT helpers

**Files:**
- Create: `libs/auth/src/jwt/jwt.helpers.ts`
- Create: `libs/auth/src/jwt/jwt.helpers.spec.ts`
- Modify: `libs/auth/src/index.ts`

- [ ] **Step 10.1: Write failing test `libs/auth/src/jwt/jwt.helpers.spec.ts`**

```typescript
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashRefreshToken } from './jwt.helpers';

describe('jwt helpers', () => {
  const secret = 'a'.repeat(64);

  describe('access tokens', () => {
    it('signs and verifies a token', () => {
      const token = signAccessToken({ sub: 'user-1', sessionId: 'sess-1' }, secret, 60);
      const payload = verifyAccessToken(token, secret);
      expect(payload.sub).toBe('user-1');
      expect(payload.sessionId).toBe('sess-1');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('rejects token signed with different secret', () => {
      const token = signAccessToken({ sub: 'u', sessionId: 's' }, secret, 60);
      expect(() => verifyAccessToken(token, 'b'.repeat(64))).toThrow();
    });

    it('rejects expired token', () => {
      const token = signAccessToken({ sub: 'u', sessionId: 's' }, secret, -1);
      expect(() => verifyAccessToken(token, secret)).toThrow(/expired/i);
    });

    it('rejects malformed token', () => {
      expect(() => verifyAccessToken('not.a.jwt', secret)).toThrow();
    });
  });

  describe('refresh tokens', () => {
    it('generates a 64-char hex string', () => {
      const t = generateRefreshToken();
      expect(t).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces a deterministic hash via SHA-256', () => {
      const t = generateRefreshToken();
      const h1 = hashRefreshToken(t);
      const h2 = hashRefreshToken(t);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('different tokens hash differently', () => {
      expect(hashRefreshToken(generateRefreshToken())).not.toBe(hashRefreshToken(generateRefreshToken()));
    });
  });
});
```

- [ ] **Step 10.2: Run test — expect failure**

Run:
```bash
pnpm nx test auth
```

Expected: FAIL — `jwt.helpers` not found.

- [ ] **Step 10.3: Implement `libs/auth/src/jwt/jwt.helpers.ts`**

```typescript
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string;        // user id
  sessionId: string;
}

export interface VerifiedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  ttlSeconds: number,
): string {
  return jwt.sign(payload, secret, {
    algorithm: 'HS512',
    expiresIn: ttlSeconds,
  });
}

export function verifyAccessToken(token: string, secret: string): VerifiedAccessToken {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS512'] });
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('invalid token shape');
  }
  return decoded as VerifiedAccessToken;
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
```

- [ ] **Step 10.4: Run test — expect pass**

Run:
```bash
pnpm nx test auth
```

Expected: PASS, all tests green (4 + 3 from prior task = 7 total in this lib so far).

- [ ] **Step 10.5: Update `libs/auth/src/index.ts`**

```typescript
export * from './password/password.service';
export * from './jwt/jwt.helpers';
```

- [ ] **Step 10.6: Lint + type-check**

Run:
```bash
pnpm nx run-many -t lint,type-check --projects=auth
```

Expected: green.

- [ ] **Step 10.7: Commit**

```bash
git add libs/auth/
git commit -m "feat(auth): add JWT access token + opaque refresh token helpers"
```

---

## Task 11: lib `auth` — TOTP helpers

**Files:**
- Create: `libs/auth/src/totp/totp.service.ts`
- Create: `libs/auth/src/totp/totp.service.spec.ts`
- Modify: `libs/auth/src/index.ts`

- [ ] **Step 11.1: Write failing test `libs/auth/src/totp/totp.service.spec.ts`**

```typescript
import { TOTP } from 'otpauth';
import { TotpService } from './totp.service';

describe('TotpService', () => {
  const svc = new TotpService();

  it('generates a secret of 20 bytes base32', () => {
    const secret = svc.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/); // 20 bytes = 32 base32 chars
  });

  it('builds an otpauth URI with issuer and label', () => {
    const secret = svc.generateSecret();
    const uri = svc.buildUri({ secret, account: 'admin@local', issuer: 'AutoScanner' });
    expect(uri).toMatch(/^otpauth:\/\/totp\/AutoScanner:admin%40local\?/);
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('issuer=AutoScanner');
  });

  it('verifies a code generated for the secret', () => {
    const secret = svc.generateSecret();
    const code = new TOTP({ secret, digits: 6, period: 30 }).generate();
    expect(svc.verify(secret, code)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = svc.generateSecret();
    expect(svc.verify(secret, '000000')).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(svc.verify(svc.generateSecret(), 'abc')).toBe(false);
    expect(svc.verify(svc.generateSecret(), '12345')).toBe(false);
  });
});
```

- [ ] **Step 11.2: Run test — expect failure**

Run:
```bash
pnpm nx test auth
```

Expected: FAIL — `totp.service` not found.

- [ ] **Step 11.3: Implement `libs/auth/src/totp/totp.service.ts`**

```typescript
import { Secret, TOTP } from 'otpauth';

export interface BuildUriInput {
  secret: string;
  account: string;
  issuer: string;
}

export class TotpService {
  generateSecret(): string {
    return new Secret({ size: 20 }).base32;
  }

  buildUri(input: BuildUriInput): string {
    return new TOTP({
      issuer: input.issuer,
      label: input.account,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: input.secret,
    }).toString();
  }

  verify(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const delta = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    }).validate({ token: code, window: 1 });
    return delta !== null;
  }
}
```

- [ ] **Step 11.4: Run test — expect pass**

Run:
```bash
pnpm nx test auth
```

Expected: PASS, 5 new TOTP tests + the previous 7 = 12 green.

- [ ] **Step 11.5: Update `libs/auth/src/index.ts`**

```typescript
export * from './password/password.service';
export * from './jwt/jwt.helpers';
export * from './totp/totp.service';
```

- [ ] **Step 11.6: Lint + type-check**

Run:
```bash
pnpm nx run-many -t lint,type-check --projects=auth
```

Expected: green.

- [ ] **Step 11.7: Write `libs/auth/README.md`**

```markdown
# @autoscanner/auth

Pure helpers (no Nest dependency) used by api-gateway's auth module.

- `PasswordService` — argon2id hash/verify
- `signAccessToken` / `verifyAccessToken` — short-lived JWT (HS512)
- `generateRefreshToken` / `hashRefreshToken` — opaque 64-hex refresh tokens, stored SHA-256-hashed
- `TotpService` — secret generation, otpauth URI, code verification (Phase 0: helpers only, not wired into a flow)
```

- [ ] **Step 11.8: Commit**

```bash
git add libs/auth/
git commit -m "feat(auth): add TOTP helpers (otpauth-based)"
```

---

## Task 12: Scaffold `api-gateway` NestJS app

**Files:**
- Create: `apps/api-gateway/` (via generator)
- Modify: `apps/api-gateway/src/main.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`
- Delete: generator's stub controller/service if present

- [ ] **Step 12.1: Generate app**

Run:
```bash
pnpm nx g @nx/nest:app api-gateway --directory=apps/api-gateway --strict --no-interactive
```

Expected: Nx generates `apps/api-gateway/` with sensible defaults (main.ts on port 3000, app.module.ts, an AppController, an AppService, e2e project).

- [ ] **Step 12.2: Add NestJS runtime deps**

Run:
```bash
pnpm add -w @nestjs/platform-express@11.0.0 @nestjs/config@4.0.0
```

(NestJS 11 ships its own `@nestjs/common` and `@nestjs/core` already pinned via Task 5.)

- [ ] **Step 12.3: Replace `apps/api-gateway/src/main.ts`**

```typescript
import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from '@autoscanner/config';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const cfg = app.get(AppConfigService);
  app.enableCors({ origin: cfg.env.FRONTEND_URL, credentials: true });

  app.enableShutdownHooks();

  await app.listen(cfg.env.API_PORT, cfg.env.API_HOST);
  // eslint-disable-next-line no-console
  console.log(`api-gateway listening on http://${cfg.env.API_HOST}:${cfg.env.API_PORT}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
```

- [ ] **Step 12.4: Delete generator-default controller/service**

Run:
```bash
rm -f apps/api-gateway/src/app/app.controller.ts \
      apps/api-gateway/src/app/app.controller.spec.ts \
      apps/api-gateway/src/app/app.service.ts \
      apps/api-gateway/src/app/app.service.spec.ts
```

- [ ] **Step 12.5: Rewrite `apps/api-gateway/src/app/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule],
})
export class AppModule {}
```

- [ ] **Step 12.6: Add env-loading at process start**

Edit `apps/api-gateway/src/main.ts` — at the very top, before any other import:

```typescript
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();
```

Add dotenv:
```bash
pnpm add -w dotenv@16.4.7
```

(Note: The first two import statements MUST stay at the very top to load env before any module that reads `process.env`.)

- [ ] **Step 12.7: Build the app**

Run:
```bash
pnpm nx build api-gateway
```

Expected: build succeeds, output in `dist/apps/api-gateway/`.

- [ ] **Step 12.8: Serve and smoke-check**

Run (in one terminal):
```bash
pnpm nx serve api-gateway
```

Expected: prints `api-gateway listening on http://0.0.0.0:4000`. Pino logs structured/pretty (since LOG_PRETTY=true in `.env`).

In another terminal:
```bash
curl -i http://localhost:4000/
```

Expected: 404 (no routes yet). That's fine — proves the server is up.

Stop with Ctrl+C.

- [ ] **Step 12.9: Commit**

```bash
git add apps/api-gateway/ package.json pnpm-lock.yaml
git commit -m "feat(api-gateway): scaffold NestJS app with config, logging, prisma wiring"
```

---

## Task 13: Health module (`/health`, `/ready`)

**Files:**
- Create: `apps/api-gateway/src/app/health/health.module.ts`
- Create: `apps/api-gateway/src/app/health/health.controller.ts`
- Create: `apps/api-gateway/src/app/health/readiness.service.ts`
- Create: `apps/api-gateway/test/health.e2e-spec.ts`
- Create: `apps/api-gateway/test/jest-e2e.config.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`
- Modify: `apps/api-gateway/project.json` (add `e2e` target)

- [ ] **Step 13.1: Add deps for readiness probes**

Run:
```bash
pnpm add -w ioredis@5.4.2 @aws-sdk/client-s3@3.717.0
```

- [ ] **Step 13.2: Write e2e test scaffold + first failing test**

Create `apps/api-gateway/test/jest-e2e.config.ts`:

```typescript
export default {
  displayName: 'api-gateway-e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.e2e-spec.ts'],
  rootDir: '.',
  setupFiles: ['<rootDir>/setup-env.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.app.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  testTimeout: 30000,
};
```

Create `apps/api-gateway/test/setup-env.ts`:

```typescript
import { config as loadEnv } from 'dotenv';
loadEnv();
```

Create `apps/api-gateway/test/health.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready returns 200 with all deps ok', async () => {
    const res = await request(app.getHttpServer()).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.redis).toBe('ok');
    expect(res.body.s3).toBe('ok');
  });
});
```

Add supertest:
```bash
pnpm add -D -w supertest@7.0.0 @types/supertest@6.0.2
```

- [ ] **Step 13.3: Add e2e target to `apps/api-gateway/project.json`**

Open `apps/api-gateway/project.json` and add inside the `targets` object:

```json
    "e2e": {
      "executor": "@nx/jest:jest",
      "options": {
        "jestConfig": "apps/api-gateway/test/jest-e2e.config.ts",
        "passWithNoTests": true
      },
      "inputs": ["default", "^production"],
      "cache": false
    }
```

- [ ] **Step 13.4: Run e2e — expect failure**

Run:
```bash
docker compose -f docker/docker-compose.dev.yml up -d   # ensure stack up
pnpm nx e2e api-gateway
```

Expected: FAIL — `/health` returns 404 because the controller doesn't exist yet.

- [ ] **Step 13.5: Implement `apps/api-gateway/src/app/health/health.controller.ts`**

```typescript
import { Controller, Get, HttpCode } from '@nestjs/common';
import { ReadinessService } from './readiness.service';

@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('health')
  @HttpCode(200)
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async readinessProbe(): Promise<Record<string, string>> {
    return this.readiness.check();
  }
}
```

- [ ] **Step 13.6: Implement `apps/api-gateway/src/app/health/readiness.service.ts`**

```typescript
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import { AppConfigService } from '@autoscanner/config';
import { PrismaService } from '@autoscanner/database';

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);
  private readonly redis: Redis;
  private readonly s3: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfigService,
  ) {
    this.redis = new Redis(cfg.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.s3 = new S3Client({
      endpoint: cfg.env.S3_ENDPOINT,
      region: cfg.env.S3_REGION,
      credentials: {
        accessKeyId: cfg.env.S3_ACCESS_KEY,
        secretAccessKey: cfg.env.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }

  async check(): Promise<Record<string, string>> {
    const [db, redis, s3] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
      this.checkS3(),
    ]);
    const result = { db, redis, s3 };
    const failing = Object.entries(result).filter(([, v]) => v !== 'ok');
    if (failing.length > 0) {
      throw new HttpException(result, 503);
    }
    return result;
  }

  private async checkDb(): Promise<string> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (err) {
      this.logger.warn(`DB readiness failed: ${(err as Error).message}`);
      return 'fail';
    }
  }

  private async checkRedis(): Promise<string> {
    try {
      if (this.redis.status === 'end' || this.redis.status === 'wait') {
        await this.redis.connect();
      }
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'fail';
    } catch (err) {
      this.logger.warn(`Redis readiness failed: ${(err as Error).message}`);
      return 'fail';
    }
  }

  private async checkS3(): Promise<string> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: 'raw-outputs' }));
      return 'ok';
    } catch (err) {
      this.logger.warn(`S3 readiness failed: ${(err as Error).message}`);
      return 'fail';
    }
  }
}
```

- [ ] **Step 13.7: Implement `apps/api-gateway/src/app/health/health.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';

@Module({
  controllers: [HealthController],
  providers: [ReadinessService],
})
export class HealthModule {}
```

- [ ] **Step 13.8: Wire `HealthModule` into `AppModule`**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 13.9: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: PASS — both `/health` and `/ready` tests green. (Requires docker-compose dev stack running.)

- [ ] **Step 13.10: Commit**

```bash
git add apps/api-gateway/ package.json pnpm-lock.yaml
git commit -m "feat(api-gateway): add /health (liveness) and /ready (db+redis+s3) endpoints"
```

---

## Task 14: Prometheus metrics (`/metrics`)

**Files:**
- Create: `apps/api-gateway/src/app/metrics/metrics.module.ts`
- Create: `apps/api-gateway/src/app/metrics/metrics.controller.ts`
- Create: `apps/api-gateway/src/app/metrics/metrics.service.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`

- [ ] **Step 14.1: Add deps**

Run:
```bash
pnpm add -w prom-client@15.1.3
```

- [ ] **Step 14.2: Add a failing e2e test**

Append to `apps/api-gateway/test/health.e2e-spec.ts` (inside the existing `describe`) — actually create a new file `apps/api-gateway/test/metrics.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('Metrics (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics exposes prometheus text exposition', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('process_cpu_user_seconds_total');
    expect(res.text).toContain('nodejs_eventloop_lag_seconds');
  });
});
```

- [ ] **Step 14.3: Run e2e — expect failure on metrics test**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: `/metrics` test fails (404).

- [ ] **Step 14.4: Implement `apps/api-gateway/src/app/metrics/metrics.service.ts`**

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  onModuleInit(): void {
    this.registry.setDefaultLabels({ app: 'api-gateway' });
    collectDefaultMetrics({ register: this.registry });
  }
}
```

- [ ] **Step 14.5: Implement `apps/api-gateway/src/app/metrics/metrics.controller.ts`**

```typescript
import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async expose(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
```

- [ ] **Step 14.6: Implement `apps/api-gateway/src/app/metrics/metrics.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
```

- [ ] **Step 14.7: Wire into `AppModule`**

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, HealthModule, MetricsModule],
})
export class AppModule {}
```

- [ ] **Step 14.8: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: all tests PASS (3 health + 1 metrics).

- [ ] **Step 14.9: Commit**

```bash
git add apps/api-gateway/ package.json pnpm-lock.yaml
git commit -m "feat(api-gateway): expose Prometheus metrics on /metrics"
```

---

## Task 15: GraphQL Apollo setup (code-first) with a dummy `version` query

**Files:**
- Create: `apps/api-gateway/src/app/users/users.module.ts` (placeholder for now — refined in Task 16)
- Create: `apps/api-gateway/src/app/users/users.resolver.ts` (just a `version` query to validate setup)
- Modify: `apps/api-gateway/src/app/app.module.ts`

- [ ] **Step 15.1: Add deps**

Run:
```bash
pnpm add -w @nestjs/graphql@13.0.0 @nestjs/apollo@13.0.0 \
  @apollo/server@4.11.2 graphql@16.10.0 graphql-tag@2.12.6
```

- [ ] **Step 15.2: Write failing e2e test `apps/api-gateway/test/graphql-me.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('GraphQL (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes /graphql and answers a version query', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ version }' });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toMatch(/^autoscanner-api-gateway@/);
  });
});
```

- [ ] **Step 15.3: Run e2e — expect failure**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: GraphQL test fails (404 or no resolver).

- [ ] **Step 15.4: Create temporary `version` resolver** (will be removed in Task 16 once users module is real)

Create `apps/api-gateway/src/app/system/system.resolver.ts`:

```typescript
import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class SystemResolver {
  @Query(() => String)
  version(): string {
    return 'autoscanner-api-gateway@0.0.0';
  }
}
```

- [ ] **Step 15.5: Create `apps/api-gateway/src/app/system/system.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SystemResolver } from './system.resolver';

@Module({
  providers: [SystemResolver],
})
export class SystemModule {}
```

- [ ] **Step 15.6: Create GraphQL error formatter `apps/api-gateway/src/app/graphql-error.formatter.ts`**

Apollo Server 4 tags unknown errors with `extensions.code = "INTERNAL_SERVER_ERROR"`. Nest's `UnauthorizedException` (used by the JWT guard in Task 18) doesn't get the `UNAUTHENTICATED` tag by default. Map common HTTP-style errors here so guard/validation behavior is predictable from clients (and so the e2e tests in Tasks 18 and 21 can assert codes).

```typescript
import { GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { HttpException } from '@nestjs/common';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_USER_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BAD_USER_INPUT',
};

export function formatGraphqlError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error);
  if (original instanceof HttpException) {
    const code = STATUS_TO_CODE[original.getStatus()] ?? 'INTERNAL_SERVER_ERROR';
    return {
      ...formatted,
      message: original.message,
      extensions: { ...formatted.extensions, code },
    };
  }
  return formatted;
}
```

- [ ] **Step 15.7: Configure GraphQL in `app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'node:path';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';

import { formatGraphqlError } from './graphql-error.formatter';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { SystemModule } from './system/system.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        autoSchemaFile: join(process.cwd(), 'apps/api-gateway/src/schema.gql'),
        sortSchema: true,
        playground: false,
        introspection: !cfg.isProd,
        path: '/graphql',
        context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
        formatError: formatGraphqlError,
      }),
    }),
    HealthModule,
    MetricsModule,
    SystemModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 15.8: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: PASS, all e2e tests green (4 prior + 1 new).

Verify schema generation:
```bash
ls -la apps/api-gateway/src/schema.gql
```

Expected: file exists with `type Query { version: String! }`.

- [ ] **Step 15.9: Commit**

```bash
git add apps/api-gateway/ package.json pnpm-lock.yaml
git commit -m "feat(api-gateway): wire GraphQL Apollo (code-first) with version query + HttpException → GraphQL code formatter"
```

---

## Task 16: Users module (`me` query, behind auth)

**Files:**
- Create: `apps/api-gateway/src/app/users/users.module.ts`
- Create: `apps/api-gateway/src/app/users/users.service.ts`
- Create: `apps/api-gateway/src/app/users/users.resolver.ts`
- Create: `apps/api-gateway/src/app/users/dto/user.object.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`

Note: this task creates the `me` resolver and the User GraphQL type, but `me` will return null until Task 17 wires JwtAuthGuard. The resolver intentionally returns the currently authenticated user from the request context — for now, with no guard, the request has no user, so `me` resolves to null. The e2e test in this task only asserts schema shape.

- [ ] **Step 16.1: Write `apps/api-gateway/src/app/users/dto/user.object.ts`**

```typescript
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('User')
export class UserObject {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field()
  isActive!: boolean;

  @Field()
  totpEnabled!: boolean;

  @Field()
  createdAt!: Date;
}
```

- [ ] **Step 16.2: Write `apps/api-gateway/src/app/users/users.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundError('User', id);
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }
}
```

- [ ] **Step 16.3: Write `apps/api-gateway/src/app/users/users.resolver.ts`**

```typescript
import { Query, Resolver } from '@nestjs/graphql';
import { UserObject } from './dto/user.object';

@Resolver(() => UserObject)
export class UsersResolver {
  @Query(() => UserObject, { nullable: true })
  me(): UserObject | null {
    // Wired with JwtAuthGuard + @CurrentUser in Task 17.
    return null;
  }
}
```

- [ ] **Step 16.4: Write `apps/api-gateway/src/app/users/users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersResolver } from './users.resolver';

@Module({
  providers: [UsersService, UsersResolver],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 16.5: Replace SystemModule with UsersModule in AppModule**

Edit `apps/api-gateway/src/app/app.module.ts` — remove `SystemModule` import, add `UsersModule`:

```typescript
// remove:
//   import { SystemModule } from './system/system.module';
//   ... SystemModule,
// add:
import { UsersModule } from './users/users.module';
// ... include UsersModule in imports
```

Then delete the now-unused system module:
```bash
rm -rf apps/api-gateway/src/app/system
```

- [ ] **Step 16.6: Update the e2e GraphQL test to validate `me` schema**

Replace `apps/api-gateway/test/graphql-me.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('GraphQL me query (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('me resolves to null when not authenticated', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ me { id email } }' });
    expect(res.status).toBe(200);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.me).toBeNull();
  });

  it('introspection exposes User type', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __type(name: "User") { name fields { name } } }' });
    expect(res.body.data.__type.name).toBe('User');
    const names = res.body.data.__type.fields.map((f: { name: string }) => f.name);
    expect(names).toEqual(expect.arrayContaining(['id', 'email', 'displayName', 'isActive', 'totpEnabled', 'createdAt']));
  });
});
```

- [ ] **Step 16.7: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: PASS, all e2e tests green.

- [ ] **Step 16.8: Commit**

```bash
git add apps/api-gateway/
git commit -m "feat(api-gateway): add Users module with User GraphQL type and stub me query"
```

---

## Task 17: Auth module — `POST /auth/login` REST endpoint

**Files:**
- Create: `apps/api-gateway/src/app/auth/auth.module.ts`
- Create: `apps/api-gateway/src/app/auth/auth.service.ts`
- Create: `apps/api-gateway/src/app/auth/auth.controller.ts`
- Create: `apps/api-gateway/src/app/auth/dto/login.dto.ts`
- Create: `apps/api-gateway/test/auth.e2e-spec.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`

This is the first task that needs a seeded user. The e2e test seeds inline via Prisma.

- [ ] **Step 17.1: Add deps**

Run:
```bash
pnpm add -w class-validator@0.14.1 class-transformer@0.5.1
```

- [ ] **Step 17.2: Write `apps/api-gateway/src/app/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
```

- [ ] **Step 17.3: Write failing e2e test `apps/api-gateway/test/auth.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import argon2 from 'argon2';
import { PrismaService } from '@autoscanner/database';
import { AppModule } from '../src/app/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-${Date.now()}@local`;
  const testPassword = 'correct-horse-battery-staple';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(testPassword, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: testEmail, passwordHash, displayName: 'E2E User' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns access + refresh tokens for valid creds', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toMatch(/^eyJ/);                   // JWT header
      expect(res.body.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.expiresIn).toBeGreaterThan(0);
    });

    it('rejects wrong password with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('rejects unknown user with 401 (same error to prevent enum)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'noone@local', password: 'any' });
      expect(res.status).toBe(401);
    });

    it('rejects malformed body with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: '' });
      expect(res.status).toBe(400);
    });
  });
});
```

- [ ] **Step 17.4: Run e2e — expect failure**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: FAIL — `/auth/login` returns 404.

- [ ] **Step 17.5: Implement `apps/api-gateway/src/app/auth/auth.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { addSeconds } from 'date-fns';
import {
  PasswordService,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '@autoscanner/auth';
import { InvalidCredentialsError } from '@autoscanner/common';
import { AppConfigService } from '@autoscanner/config';
import { PrismaService } from '@autoscanner/database';
import type { AuthPayload } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly passwordService = new PasswordService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AppConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<AuthPayload> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, isActive: true },
    });
    // Always perform a hash to keep response time roughly constant whether or not the user exists.
    const referenceHash =
      user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const ok = await this.passwordService.verify(referenceHash, password);

    if (!user || !ok) {
      throw new InvalidCredentialsError();
    }

    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
        expiresAt: addSeconds(new Date(), this.cfg.env.REFRESH_TOKEN_TTL_SECONDS),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = signAccessToken(
      { sub: user.id, sessionId: session.id },
      this.cfg.env.JWT_SECRET,
      this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
```

Install date-fns:
```bash
pnpm add -w date-fns@4.1.0
```

- [ ] **Step 17.6: Implement `apps/api-gateway/src/app/auth/auth.controller.ts`**

```typescript
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { InvalidCredentialsError } from '@autoscanner/common';
import { AuthService } from './auth.service';
import { AuthPayload, LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthPayload> {
    try {
      return await this.auth.login(dto.email, dto.password, {
        userAgent: req.headers['user-agent'] as string | undefined,
        ip,
      });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new HttpException({ code: err.code, message: err.message }, 401);
      }
      throw err;
    }
  }
}
```

- [ ] **Step 17.7: Implement `apps/api-gateway/src/app/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 17.8: Wire into AppModule**

```typescript
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'node:path';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';

import { formatGraphqlError } from './graphql-error.formatter';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        autoSchemaFile: join(process.cwd(), 'apps/api-gateway/src/schema.gql'),
        sortSchema: true,
        playground: false,
        introspection: !cfg.isProd,
        path: '/graphql',
        context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
        formatError: formatGraphqlError,
      }),
    }),
    AuthModule,
    HealthModule,
    MetricsModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 17.9: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: PASS, all auth login tests green.

- [ ] **Step 17.10: Commit**

```bash
git add apps/api-gateway/ package.json pnpm-lock.yaml
git commit -m "feat(api-gateway): add POST /auth/login with JWT + opaque refresh issuance"
```

---

## Task 18: JwtAuthGuard, CurrentUser decorator, and authenticated `me` query

**Files:**
- Create: `apps/api-gateway/src/app/auth/strategies/jwt.strategy.ts`
- Create: `apps/api-gateway/src/app/auth/guards/jwt-auth.guard.ts`
- Create: `apps/api-gateway/src/app/auth/decorators/current-user.decorator.ts`
- Create: `apps/api-gateway/src/app/auth/decorators/public.decorator.ts`
- Modify: `apps/api-gateway/src/app/users/users.resolver.ts` (wire `@CurrentUser` + `@UseGuards`)
- Modify: `apps/api-gateway/src/app/auth/auth.module.ts`
- Modify: `apps/api-gateway/test/auth.e2e-spec.ts` (add `me` test after login)

- [ ] **Step 18.1: Add deps**

Run:
```bash
pnpm add -w @nestjs/passport@11.0.5 passport@0.7.0 passport-jwt@4.0.1
pnpm add -D -w @types/passport-jwt@4.0.1
```

- [ ] **Step 18.2: Add `me` flow to the auth e2e test**

Append inside the `describe('Auth (e2e)')` block of `apps/api-gateway/test/auth.e2e-spec.ts`:

```typescript
  describe('GraphQL me with bearer', () => {
    let accessToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      accessToken = res.body.accessToken;
    });

    it('returns the current user when bearer is valid', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ query: '{ me { id email displayName } }' });
      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.me).not.toBeNull();
      expect(res.body.data.me.email).toBe(testEmail);
      expect(res.body.data.me.displayName).toBe('E2E User');
    });

    it('returns errors when bearer is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: '{ me { id email } }' });
      expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    });

    it('returns errors when bearer is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/graphql')
        .set('authorization', 'Bearer not-a-real-token')
        .send({ query: '{ me { id email } }' });
      expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    });
  });
```

- [ ] **Step 18.3: Run e2e — expect failure**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: FAIL — `me` returns null (Task 16 stub), guard does not exist.

- [ ] **Step 18.4: Implement `apps/api-gateway/src/app/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '@autoscanner/config';
import { PrismaService } from '@autoscanner/database';
import type { User } from '@prisma/client';

interface JwtPayload {
  sub: string;
  sessionId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.env.JWT_SECRET,
      algorithms: ['HS512'],
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const [session, user] = await Promise.all([
      this.prisma.session.findUnique({ where: { id: payload.sessionId } }),
      this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, isActive: true },
      }),
    ]);

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('session not active');
    }
    if (!user) {
      throw new UnauthorizedException('user not found');
    }

    return user;
  }
}
```

- [ ] **Step 18.5: Implement `apps/api-gateway/src/app/auth/guards/jwt-auth.guard.ts`**

```typescript
import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    if (context.getType<'graphql' | 'http' | 'ws'>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      return gqlCtx.getContext().req;
    }
    return context.switchToHttp().getRequest();
  }
}
```

- [ ] **Step 18.6: Implement `apps/api-gateway/src/app/auth/decorators/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { User } from '@prisma/client';

export const CurrentUser = createParamDecorator<unknown, ExecutionContext, User>(
  (_data, context) => {
    if (context.getType<'graphql' | 'http' | 'ws'>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      return gqlCtx.getContext().req.user as User;
    }
    return context.switchToHttp().getRequest().user as User;
  },
);
```

- [ ] **Step 18.7: Implement `apps/api-gateway/src/app/auth/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 18.8: Update `auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
```

- [ ] **Step 18.9: Update `users.resolver.ts` to use guard + decorator**

```typescript
import { UseGuards } from '@nestjs/common';
import { Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserObject } from './dto/user.object';

@Resolver(() => UserObject)
export class UsersResolver {
  @Query(() => UserObject)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User): UserObject {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName ?? undefined,
      isActive: user.isActive,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
    };
  }
}
```

- [ ] **Step 18.10: Update earlier graphql-me test (no-auth case)**

The previous test in `apps/api-gateway/test/graphql-me.e2e-spec.ts` expected `me` to return `null` when not authenticated. Now `me` is guarded — it returns an UNAUTHENTICATED error instead. Update:

Replace the first `it(...)` block in `apps/api-gateway/test/graphql-me.e2e-spec.ts`:

```typescript
  it('me returns UNAUTHENTICATED when no bearer is provided', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ me { id email } }' });
    expect(res.status).toBe(200);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });
```

- [ ] **Step 18.11: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: all tests green (health, metrics, graphql introspection, auth login, me with bearer, me without bearer rejected).

- [ ] **Step 18.12: Commit**

```bash
git add apps/api-gateway/ package.json pnpm-lock.yaml
git commit -m "feat(api-gateway): add JwtAuthGuard, CurrentUser decorator, and authenticated me query"
```

---

## Task 19: Auth — `POST /auth/refresh` (rotation)

**Files:**
- Modify: `apps/api-gateway/src/app/auth/dto/login.dto.ts` → add `RefreshDto`
- Modify: `apps/api-gateway/src/app/auth/auth.service.ts` → add `refresh()`
- Modify: `apps/api-gateway/src/app/auth/auth.controller.ts` → add `POST /auth/refresh`
- Modify: `apps/api-gateway/test/auth.e2e-spec.ts` → add refresh flow tests

- [ ] **Step 19.1: Add failing test cases to `auth.e2e-spec.ts`**

Append a new `describe` inside the existing top-level `describe('Auth (e2e)')`:

```typescript
  describe('POST /auth/refresh', () => {
    let loginPayload: { accessToken: string; refreshToken: string };

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      loginPayload = res.body;
    });

    it('returns new tokens and rotates (old refresh becomes invalid)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginPayload.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toMatch(/^eyJ/);
      expect(res.body.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.refreshToken).not.toBe(loginPayload.refreshToken);

      // The old refresh must be rejected now.
      const replay = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginPayload.refreshToken });
      expect(replay.status).toBe(401);
    });

    it('rejects an unknown refresh token with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'f'.repeat(64) });
      expect(res.status).toBe(401);
    });

    it('rejects a malformed refresh token with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'bad' });
      expect(res.status).toBe(400);
    });
  });
```

- [ ] **Step 19.2: Run e2e — expect failure**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: refresh tests fail (404 / no endpoint).

- [ ] **Step 19.3: Add `RefreshDto` to `apps/api-gateway/src/app/auth/dto/login.dto.ts`**

Append:

```typescript
import { Matches } from 'class-validator';

export class RefreshDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'refreshToken must be 64-hex string' })
  refreshToken!: string;
}
```

(The existing `IsString` import is already present from `LoginDto`. Add `Matches` to the same import line.)

- [ ] **Step 19.4: Add `refresh()` to `auth.service.ts`**

Add the following method (and the `hashRefreshToken` import if not already present):

```typescript
  async refresh(
    refreshToken: string,
    ctx: { userAgent?: string; ip?: string },
  ): Promise<AuthPayload> {
    const hash = hashRefreshToken(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.user.isActive ||
      session.user.deletedAt !== null
    ) {
      throw new InvalidCredentialsError();
    }

    const newRefresh = generateRefreshToken();
    const newSession = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      return tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: hashRefreshToken(newRefresh),
          userAgent: ctx.userAgent ?? null,
          ip: ctx.ip ?? null,
          expiresAt: addSeconds(new Date(), this.cfg.env.REFRESH_TOKEN_TTL_SECONDS),
        },
      });
    });

    const accessToken = signAccessToken(
      { sub: session.userId, sessionId: newSession.id },
      this.cfg.env.JWT_SECRET,
      this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      refreshToken: newRefresh,
      expiresIn: this.cfg.env.ACCESS_TOKEN_TTL_SECONDS,
    };
  }
```

(Ensure `hashRefreshToken` is in the imports from `@autoscanner/auth`.)

- [ ] **Step 19.5: Add `POST /auth/refresh` to `auth.controller.ts`**

```typescript
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Ip() ip: string,
  ): Promise<AuthPayload> {
    try {
      return await this.auth.refresh(dto.refreshToken, {
        userAgent: req.headers['user-agent'] as string | undefined,
        ip,
      });
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new HttpException({ code: err.code, message: err.message }, 401);
      }
      throw err;
    }
  }
```

Add `RefreshDto` to the import line from `./dto/login.dto`.

- [ ] **Step 19.6: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: all refresh tests green; previous tests still green.

- [ ] **Step 19.7: Commit**

```bash
git add apps/api-gateway/
git commit -m "feat(api-gateway): add POST /auth/refresh with token rotation"
```

---

## Task 20: Auth — `POST /auth/logout`

**Files:**
- Modify: `apps/api-gateway/src/app/auth/auth.service.ts` → add `logout()`
- Modify: `apps/api-gateway/src/app/auth/auth.controller.ts` → add `POST /auth/logout` (guarded)
- Modify: `apps/api-gateway/test/auth.e2e-spec.ts` → add logout tests

- [ ] **Step 20.1: Add failing test cases**

Append inside the top-level `describe('Auth (e2e)')`:

```typescript
  describe('POST /auth/logout', () => {
    it('revokes the current session (subsequent access token rejected)', async () => {
      // Fresh login.
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testEmail, password: testPassword });
      const { accessToken, refreshToken } = login.body;

      // Logout.
      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('authorization', `Bearer ${accessToken}`)
        .send();
      expect(logoutRes.status).toBe(204);

      // The access token's sessionId is now revoked → me must be rejected.
      const meRes = await request(app.getHttpServer())
        .post('/graphql')
        .set('authorization', `Bearer ${accessToken}`)
        .send({ query: '{ me { id } }' });
      expect(meRes.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');

      // And the refresh token must be invalid too.
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });

    it('returns 401 if no bearer is provided', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout').send();
      expect(res.status).toBe(401);
    });
  });
```

- [ ] **Step 20.2: Run e2e — expect failure**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: logout tests fail (404).

- [ ] **Step 20.3: Add `logout()` to `auth.service.ts`**

```typescript
  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
```

- [ ] **Step 20.4: Add controller route**

Edit `apps/api-gateway/src/app/auth/auth.controller.ts` — add imports and method:

```typescript
import { HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// inside class AuthController:
  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request): Promise<void> {
    // JwtStrategy.validate attaches user; we also need sessionId from the JWT.
    // The cleanest way is to parse the token ourselves; instead, we read the
    // `sessionId` we stashed into req.user via the strategy.
    const sessionId = (req as Request & { sessionId?: string }).sessionId;
    if (!sessionId) {
      // Fallback: derive from auth header (defense in depth — should never hit).
      throw new HttpException('missing session context', 401);
    }
    await this.auth.logout(sessionId);
  }
```

For the strategy to expose `sessionId` on the request, we need a small change. Edit `jwt.strategy.ts` — change the `validate` to also stash sessionId:

```typescript
import type { Request } from 'express';

// constructor stays as-is; add `passReqToCallback: true` to super() options:
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.env.JWT_SECRET,
      algorithms: ['HS512'],
      passReqToCallback: true,
    });

  async validate(req: Request, payload: JwtPayload): Promise<User> {
    // ... existing checks ...

    (req as Request & { sessionId?: string }).sessionId = payload.sessionId;
    return user;
  }
```

(Order of params changes because of `passReqToCallback: true`.)

- [ ] **Step 20.5: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: all logout tests green; previous tests still green (login, refresh, me with bearer).

- [ ] **Step 20.6: Commit**

```bash
git add apps/api-gateway/
git commit -m "feat(api-gateway): add POST /auth/logout (revokes current session)"
```

---

## Task 21: Engagements module — minimal CRUD via GraphQL

**Files:**
- Create: `apps/api-gateway/src/app/engagements/engagements.module.ts`
- Create: `apps/api-gateway/src/app/engagements/engagements.service.ts`
- Create: `apps/api-gateway/src/app/engagements/engagements.resolver.ts`
- Create: `apps/api-gateway/src/app/engagements/dto/engagement.object.ts`
- Create: `apps/api-gateway/src/app/engagements/dto/engagement-status.enum.ts`
- Create: `apps/api-gateway/src/app/engagements/dto/create-engagement.input.ts`
- Create: `apps/api-gateway/test/engagements.e2e-spec.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`

- [ ] **Step 21.1: Write failing e2e test `apps/api-gateway/test/engagements.e2e-spec.ts`**

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import argon2 from 'argon2';
import { PrismaService } from '@autoscanner/database';
import { AppModule } from '../src/app/app.module';

describe('Engagements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const testEmail = `eng-${Date.now()}@local`;
  const testPassword = 'p@ssw0rd-eng';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(testPassword, { type: argon2.argon2id });
    await prisma.user.create({ data: { email: testEmail, passwordHash } });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword });
    accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.engagement.deleteMany({ where: { clientName: 'Acme' } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it('createEngagement → engagements → engagement(id)', async () => {
    const create = await request(app.getHttpServer())
      .post('/graphql')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        query: `mutation($input: CreateEngagementInput!) {
          createEngagement(input: $input) { id name clientName status }
        }`,
        variables: { input: { name: 'Recon Q2', clientName: 'Acme' } },
      });
    expect(create.body.errors).toBeUndefined();
    expect(create.body.data.createEngagement.name).toBe('Recon Q2');
    expect(create.body.data.createEngagement.status).toBe('DRAFT');
    const engagementId = create.body.data.createEngagement.id;

    const list = await request(app.getHttpServer())
      .post('/graphql')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ query: '{ engagements { id name clientName } }' });
    expect(list.body.data.engagements.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data.engagements.find((e: { id: string }) => e.id === engagementId)).toBeDefined();

    const one = await request(app.getHttpServer())
      .post('/graphql')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        query: `query($id: ID!) { engagement(id: $id) { id name clientName status } }`,
        variables: { id: engagementId },
      });
    expect(one.body.data.engagement.id).toBe(engagementId);
  });

  it('rejects engagements query without auth', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ engagements { id } }' });
    expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  });
});
```

- [ ] **Step 21.2: Run e2e — expect failure**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: engagement queries fail (resolvers not defined).

- [ ] **Step 21.3: Write `apps/api-gateway/src/app/engagements/dto/engagement-status.enum.ts`**

```typescript
import { registerEnumType } from '@nestjs/graphql';
import { EngagementStatus } from '@prisma/client';

registerEnumType(EngagementStatus, { name: 'EngagementStatus' });

export { EngagementStatus };
```

- [ ] **Step 21.4: Write `apps/api-gateway/src/app/engagements/dto/engagement.object.ts`**

```typescript
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { EngagementStatus } from './engagement-status.enum';

@ObjectType('Engagement')
export class EngagementObject {
  @Field(() => ID)
  id!: string;

  @Field()
  ownerId!: string;

  @Field()
  name!: string;

  @Field()
  clientName!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  scopeText?: string;

  @Field({ nullable: true })
  startDate?: Date;

  @Field({ nullable: true })
  endDate?: Date;

  @Field(() => EngagementStatus)
  status!: EngagementStatus;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
```

- [ ] **Step 21.5: Write `apps/api-gateway/src/app/engagements/dto/create-engagement.input.ts`**

```typescript
import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class CreateEngagementInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientName!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  scopeText?: string;
}
```

- [ ] **Step 21.6: Write `apps/api-gateway/src/app/engagements/engagements.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { Engagement } from '@prisma/client';
import { CreateEngagementInput } from './dto/create-engagement.input';

@Injectable()
export class EngagementsService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, input: CreateEngagementInput): Promise<Engagement> {
    return this.prisma.engagement.create({
      data: {
        ownerId,
        name: input.name,
        clientName: input.clientName,
        description: input.description ?? null,
        scopeText: input.scopeText ?? null,
      },
    });
  }

  listForOwner(ownerId: string): Promise<Engagement[]> {
    return this.prisma.engagement.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdForOwner(ownerId: string, id: string): Promise<Engagement> {
    const found = await this.prisma.engagement.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (!found) throw new NotFoundError('Engagement', id);
    return found;
  }
}
```

- [ ] **Step 21.7: Write `apps/api-gateway/src/app/engagements/engagements.resolver.ts`**

```typescript
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEngagementInput } from './dto/create-engagement.input';
import { EngagementObject } from './dto/engagement.object';
import { EngagementsService } from './engagements.service';

@Resolver(() => EngagementObject)
@UseGuards(JwtAuthGuard)
export class EngagementsResolver {
  constructor(private readonly engagements: EngagementsService) {}

  @Mutation(() => EngagementObject)
  createEngagement(
    @CurrentUser() user: User,
    @Args('input') input: CreateEngagementInput,
  ): Promise<EngagementObject> {
    return this.engagements.create(user.id, input) as Promise<EngagementObject>;
  }

  @Query(() => [EngagementObject])
  engagements(@CurrentUser() user: User): Promise<EngagementObject[]> {
    return this.engagements.listForOwner(user.id) as Promise<EngagementObject[]>;
  }

  @Query(() => EngagementObject)
  engagement(
    @CurrentUser() user: User,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<EngagementObject> {
    return this.engagements.getByIdForOwner(user.id, id) as Promise<EngagementObject>;
  }
}
```

- [ ] **Step 21.8: Write `apps/api-gateway/src/app/engagements/engagements.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EngagementsResolver } from './engagements.resolver';
import { EngagementsService } from './engagements.service';

@Module({
  imports: [AuthModule],
  providers: [EngagementsService, EngagementsResolver],
})
export class EngagementsModule {}
```

- [ ] **Step 21.9: Wire into AppModule**

Add `EngagementsModule` to imports in `apps/api-gateway/src/app/app.module.ts`:

```typescript
import { EngagementsModule } from './engagements/engagements.module';

// imports: [..., EngagementsModule],
```

- [ ] **Step 21.10: Run e2e — expect pass**

Run:
```bash
pnpm nx e2e api-gateway
```

Expected: all tests green (health, metrics, graphql, auth login/refresh/logout, me, engagements CRUD).

- [ ] **Step 21.11: Commit**

```bash
git add apps/api-gateway/
git commit -m "feat(api-gateway): add minimal Engagements GraphQL module (create/list/get)"
```

---

## Task 22: Prisma seed (operator user)

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (already has `seed` script from Task 1 — confirm)

- [ ] **Step 22.1: Write `prisma/seed.ts`**

```typescript
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const email = process.env.OPERATOR_EMAIL;
  const password = process.env.OPERATOR_PASSWORD;
  if (!email || !password) {
    throw new Error('OPERATOR_EMAIL and OPERATOR_PASSWORD must be set in .env');
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`[seed] operator user already exists: ${email}`);
      return;
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: 'Operator' },
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] created operator user: ${user.email} (id=${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 22.2: Run seed — first run creates user**

Run:
```bash
pnpm seed
```

Expected: `[seed] created operator user: admin@local (id=<cuid>)`.

- [ ] **Step 22.3: Run seed again — idempotent**

Run:
```bash
pnpm seed
```

Expected: `[seed] operator user already exists: admin@local`.

- [ ] **Step 22.4: Verify login with operator account**

Start the API:
```bash
pnpm nx serve api-gateway &
sleep 5
```

Then:
```bash
curl -sS -X POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$(grep OPERATOR_EMAIL .env | cut -d= -f2)\",\"password\":\"$(grep OPERATOR_PASSWORD .env | cut -d= -f2)\"}"
```

Expected: JSON with `accessToken`, `refreshToken`, `expiresIn`.

Then kill the dev server: `kill %1`.

- [ ] **Step 22.5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): create operator user from env on first run, idempotent"
```

---

## Task 23: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 23.1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  lint-test-build:
    runs-on: ubuntu-latest
    timeout-minutes: 25

    env:
      NODE_ENV: test
      API_PORT: 4000
      API_HOST: 0.0.0.0
      FRONTEND_URL: http://localhost:5173
      JWT_SECRET: ${{ secrets.CI_JWT_SECRET || 'a-test-secret-not-secure-only-for-ci-a-test-secret' }}
      ACCESS_TOKEN_TTL_SECONDS: 900
      REFRESH_TOKEN_TTL_SECONDS: 2592000
      MASTER_ENCRYPTION_KEY: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
      DATABASE_URL: postgresql://autoscanner:dev@localhost:5432/autoscanner
      MONGODB_URL: mongodb://localhost:27017/autoscanner
      REDIS_URL: redis://localhost:6379
      S3_ENDPOINT: http://localhost:9000
      S3_REGION: us-east-1
      S3_ACCESS_KEY: autoscanner
      S3_SECRET_KEY: devpassword
      LOG_LEVEL: info
      LOG_PRETTY: 'false'
      OPERATOR_EMAIL: admin@local
      OPERATOR_PASSWORD: changeme
      PROMETHEUS_PORT: 9091

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: autoscanner
          POSTGRES_PASSWORD: dev
          POSTGRES_DB: autoscanner
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U autoscanner"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 20
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
      minio:
        image: bitnami/minio:latest
        env:
          MINIO_ROOT_USER: autoscanner
          MINIO_ROOT_PASSWORD: devpassword
          MINIO_DEFAULT_BUCKETS: raw-outputs,reports,uploads,pcap,screenshots,backups,cve-mirror
        ports: ['9000:9000']
        options: >-
          --health-cmd "curl -f http://localhost:9000/minio/health/live"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Set nx base for affected
        uses: nrwl/nx-set-shas@v4

      - name: Prisma generate
        run: pnpm prisma generate

      - name: Prisma migrate deploy
        run: pnpm prisma migrate deploy

      - name: Lint
        run: pnpm nx affected -t lint --parallel=3

      - name: Type check
        run: pnpm nx affected -t type-check --parallel=3

      - name: Unit test
        run: pnpm nx affected -t test --parallel=3 --ci

      - name: Build
        run: pnpm nx affected -t build --parallel=3

      - name: E2E (api-gateway)
        run: pnpm nx run api-gateway:e2e
```

- [ ] **Step 23.2: Add `type-check` target everywhere it's missing**

Each `project.json` Nx generated does NOT include a `type-check` target by default. Add it to root via `nx.json` task pipeline OR add per project.

Simplest: edit `nx.json` to add `type-check` as an inferred target. Update the `targetDefaults` block and add at the top of `nx.json` an inferred target via the `@nx/js/typescript` plugin:

Add to `nx.json` plugins array:

```json
    {
      "plugin": "@nx/js/typescript",
      "options": {
        "typecheck": { "targetName": "type-check" }
      }
    }
```

Also add `@nx/js/typescript` is installed via `@nx/js` (already a dep — verify):
```bash
pnpm list -w @nx/js
```

- [ ] **Step 23.3: Verify lint, type-check, test, build, e2e all green locally before commit**

Run:
```bash
docker compose -f docker/docker-compose.dev.yml up -d
pnpm prisma migrate deploy
pnpm nx run-many -t lint,type-check,test,build
pnpm nx run api-gateway:e2e
```

Expected: ALL green. Fix any issues now.

- [ ] **Step 23.4: Commit**

```bash
git add .github/workflows/ci.yml nx.json
git commit -m "ci: add GitHub Actions workflow (lint, type-check, test, build, e2e)"
```

---

## Task 24: README + final verification

**Files:**
- Create / replace: `README.md`

- [ ] **Step 24.1: Write `README.md`**

```markdown
# AutoScanner

Single-operator pentest / red-team platform: asset discovery, sandboxed orchestration of Kali tools, finding correlation, reporting.

> **Phase 0** is the foundation: monorepo, dev stack, auth, Prisma. Scanner orchestration, parsers, correlation, and frontend land in subsequent phases. See `docs/superpowers/specs/` for the full design and `docs/superpowers/plans/` for phase plans.

## Stack

Nx 20 monorepo · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7 · MongoDB 7 · MinIO · TypeScript 5.7 · GraphQL (Apollo, code-first) · Pino · Prometheus.

## Quickstart (Phase 0)

Prerequisites: Node 22 (`nvm use`), pnpm 9, Docker Desktop / Docker Engine v25+.

```bash
git clone <repo> && cd autoscanner
pnpm install
cp .env.example .env
# Generate secure secrets and paste into .env:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('MASTER_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"

# Bring up dev dependencies:
pnpm dev:up                  # postgres + redis + mongo + minio
pnpm prisma migrate deploy
pnpm seed                    # creates operator user from OPERATOR_EMAIL/PASSWORD

# Run the API:
pnpm nx serve api-gateway
```

In another terminal:

```bash
# Login (REST):
curl -sX POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@local","password":"changeme"}'

# Use the accessToken with GraphQL:
curl -sX POST http://localhost:4000/graphql \
  -H 'content-type: application/json' \
  -H "authorization: Bearer <accessToken>" \
  -d '{"query":"{ me { id email } }"}'
```

## Routes (Phase 0)

| Verb | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | `{email, password}` → `{accessToken, refreshToken, expiresIn}` |
| `POST` | `/auth/refresh` | `{refreshToken}` → new tokens (rotation) |
| `POST` | `/auth/logout` | guarded; revokes current session |
| `POST` | `/graphql` | GraphQL Apollo, includes `me`, `engagements`, `createEngagement` |
| `GET`  | `/health` | liveness |
| `GET`  | `/ready` | readiness (DB + Redis + S3) |
| `GET`  | `/metrics` | Prometheus exposition |

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev:up` | bring up the dev stack (Docker Compose) |
| `pnpm dev:down` | tear down the dev stack |
| `pnpm prisma:migrate:dev` | create + apply new migration |
| `pnpm prisma:migrate:deploy` | apply pending migrations |
| `pnpm prisma:studio` | open Prisma Studio |
| `pnpm seed` | seed operator user (idempotent) |
| `pnpm nx serve api-gateway` | run the API |
| `pnpm nx test <project>` | unit tests |
| `pnpm nx e2e api-gateway` | end-to-end tests (requires dev stack) |
| `pnpm format` | Prettier on all files |
| `pnpm lint` | ESLint across projects |

## Layout

```
apps/api-gateway/       NestJS HTTP + GraphQL
libs/auth/              Password, JWT, TOTP helpers
libs/common/            Domain errors + AES-GCM SecretBox
libs/config/            Zod-validated env config
libs/database/          PrismaService + PrismaModule
libs/logging/           Pino-based structured logging
prisma/                 Schema + migrations + seed
docker/                 docker-compose dev stack
docs/superpowers/       Specs and phase plans
```

## CI

GitHub Actions runs `lint`, `type-check`, `test`, `build`, and `e2e` against Postgres / Redis / MinIO services. See `.github/workflows/ci.yml`.

## License

Internal — not open source at this stage.
```

- [ ] **Step 24.2: Full end-to-end manual verification**

From a clean shell:

```bash
# 1. Fresh stack
pnpm dev:down
pnpm dev:up
sleep 10                    # wait for healthchecks

# 2. Reset DB and reseed
pnpm prisma migrate reset --force
pnpm seed

# 3. Start API
pnpm nx serve api-gateway &
APP_PID=$!
sleep 8

# 4. Test login
TOKENS=$(curl -sX POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@local","password":"changeme"}')
echo "$TOKENS"
ACCESS=$(echo "$TOKENS" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).accessToken))")
REFRESH=$(echo "$TOKENS" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).refreshToken))")
[ -n "$ACCESS" ] || { echo "login failed"; kill $APP_PID; exit 1; }

# 5. me
ME=$(curl -sX POST http://localhost:4000/graphql \
  -H "authorization: Bearer $ACCESS" \
  -H 'content-type: application/json' \
  -d '{"query":"{ me { id email } }"}')
echo "$ME" | grep -q 'admin@local' || { echo "me failed"; kill $APP_PID; exit 1; }

# 6. createEngagement
CREATE=$(curl -sX POST http://localhost:4000/graphql \
  -H "authorization: Bearer $ACCESS" \
  -H 'content-type: application/json' \
  -d '{"query":"mutation { createEngagement(input: { name: \"Smoke\", clientName: \"Acme\" }) { id name } }"}')
echo "$CREATE" | grep -q '"name":"Smoke"' || { echo "create failed"; kill $APP_PID; exit 1; }

# 7. refresh
REF=$(curl -sX POST http://localhost:4000/auth/refresh \
  -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}")
echo "$REF" | grep -q accessToken || { echo "refresh failed"; kill $APP_PID; exit 1; }

# 8. health / ready / metrics
curl -sf http://localhost:4000/health  >/dev/null
curl -sf http://localhost:4000/ready   >/dev/null
curl -sf http://localhost:4000/metrics | head -5

kill $APP_PID
echo "ALL PHASE-0 ACCEPTANCE CRITERIA: OK"
```

Expected last line: `ALL PHASE-0 ACCEPTANCE CRITERIA: OK`.

- [ ] **Step 24.3: Final commit**

```bash
git add README.md
git commit -m "docs: add Phase 0 README quickstart"
```

- [ ] **Step 24.4: Verify clean state**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean`.

Run:
```bash
git log --oneline
```

Expected: chronological list of ~24 commits documenting each step of Phase 0.

---

## Phase 0 acceptance summary

After all tasks complete, the following must be true (re-verifies the spec's Phase 0 criteria):

- [x] Nx 20 monorepo bootstraps via `pnpm install`.
- [x] `pnpm dev:up` brings up Postgres + Redis + MinIO + Mongo (Mongo unused but ready for Phase 1).
- [x] `pnpm prisma migrate deploy` applies the initial schema (User, Session, Engagement, ScopeRule, Asset).
- [x] `pnpm seed` creates the operator user from env (idempotent).
- [x] `pnpm nx serve api-gateway` starts the API on port 4000.
- [x] `POST /auth/login` returns access + refresh tokens.
- [x] `POST /auth/refresh` rotates tokens; old refresh becomes invalid.
- [x] `POST /auth/logout` revokes the current session.
- [x] GraphQL `{ me { id email } }` works with `Authorization: Bearer <token>`.
- [x] GraphQL `mutation createEngagement`, query `engagements`, query `engagement(id)` work (guarded).
- [x] `/health` returns 200. `/ready` checks DB+Redis+S3. `/metrics` exposes Prometheus text.
- [x] Logs are JSON Pino with sensitive fields redacted; pretty-printed in dev.
- [x] All unit tests (config, logging, common, auth) and e2e tests (api-gateway) pass.
- [x] GitHub Actions CI is green on PR (lint, type-check, test, build, e2e).
- [x] README documents the full quickstart.

**Done.** Ready to draft the Phase 1 plan (first scan E2E with nmap).
