# AutoScanner — Plateforme de Cyber Reconnaissance & Vulnerability Management

**Date :** 2026-05-24
**Auteur :** Architecte (brainstorming session)
**Statut :** Spec V1 — en attente de revue
**Cycle :** Brainstorming → **Spec (ce document)** → Plan d'implémentation → Code

---

## 0. Synthèse exécutive

AutoScanner est une plateforme **mono-opérateur** de pentest / red team orientée :
- découverte automatisée d'assets (domaines, sous-domaines, IPs, ports, services, technos)
- orchestration sandboxée de ~80 outils Kali Linux
- corrélation et déduplication des findings
- génération de rapports livrables clients
- exécution distribuée (VPS central + laptop agent via VPN client)

Elle s'appuie sur un monorepo **Nx**, un backend **NestJS + GraphQL (Apollo) + REST**, une persistance **PostgreSQL/Prisma** complétée par **MongoDB** pour les outputs bruts volumineux, des files **BullMQ/Redis**, du stockage objet **MinIO**, et un frontend **React + TypeScript + Tailwind + Apollo Client** doublé d'une **CLI**.

Le mode de déploiement initial vise un **mono-host VPS** plus un **agent local sur laptop** pour les segments internes accessibles par VPN client. L'architecture est **Kubernetes-ready** pour scaling futur.

### Décisions de cadrage actées

| Sujet | Décision | Conséquence |
|---|---|---|
| Use case | Pentest / red team sur engagements autorisés | Modèle `Engagement` central, pas multi-tenant SaaS |
| Équipe | Solo | Auth minimale (1 compte + TOTP optionnel), pas de RBAC complexe Phase 0 |
| Topologie | Mono-host VPS + laptop agent | Concept d'agent distribué dès Phase 1 (light) |
| Enforcement scope | Informationnel | Pas de validation hard du scope dans l'orchestrator, opérateur responsable |
| Monorepo | Nx | apps + libs, generators, cache distribué, `nx affected` en CI |
| Couverture scanners | Catalogue exhaustif (~80) | Spec liste tous les outils, implémentation phasée par batch |
| Frontend & CLI | Dès Phase 1 | API GraphQL stabilisée tôt, 2 interfaces alignées |
| Images Docker | Hybride (officielles + slim custom + fallback kali-runner) | Compromis maintenance/vitesse |

---

## 1. Plan de phasage

Le projet est trop large pour un seul cycle. Décomposition en 7 phases livrables séparément. **Cette spec couvre l'intégralité du périmètre cible** — chaque phase fera l'objet d'un plan d'implémentation séparé issu de cette spec.

### Phase 0 — Fondations (1-2 semaines)
**Livrables :**
- Monorepo Nx initialisé (apps + libs squelettes)
- `docker-compose.dev.yml` : Postgres 16, Redis 7, MinIO, MongoDB 7
- Prisma schema initial (User, Session, Engagement, Asset minimal)
- `api-gateway` NestJS avec GraphQL Apollo + healthcheck + Pino logger
- Auth : JWT + refresh token + (optionnel) TOTP, route `/auth/login`, `/auth/refresh`, `/auth/me`
- Seed CLI (`pnpm seed`) qui crée le compte opérateur
- CI GitHub Actions : lint, type-check, test, `nx affected:build`
- README + scripts setup

**Critère "done" :** `docker compose up`, `pnpm dev`, login via GraphQL Sandbox, requête `me { id email }` réussie.

### Phase 1 — Premier scan E2E (2-3 semaines)
**Livrables :**
- Apps `scan-worker`, `parser-worker` (BullMQ consumers)
- Lib `@autoscanner/queues` (job types, file names, helpers)
- Lib `@autoscanner/docker-runner` (lance container sandboxé, capture stdout/stderr, timeout, limits)
- Lib `@autoscanner/scanner-sdk` (interface `Scanner`, base class, registry)
- **Premier scanner intégré : `nmap`** (image `instrumentisto/nmap`, output XML)
- Lib `@autoscanner/parsers` avec `NmapXmlParser`
- Persistance Asset / Port / Service à partir du parse
- Stream live des logs via GraphQL subscription `scanJobLogs(jobId)`
- Upload du raw output XML sur MinIO
- CLI minimale (`autoscanner scan run --engagement <id> --target <ip>`)
- Frontend minimal : login, liste engagements, page scan (formulaire target, bouton run, logs live, table findings)

**Critère "done" :** depuis la CLI **et** depuis l'UI, lancer un scan nmap sur une cible, voir les logs s'afficher en temps réel, retrouver les ports/services en base et le XML sur MinIO.

### Phase 2 — Chaîne recon "ProjectDiscovery" (2-3 semaines)
**Livrables :**
- Scanners ajoutés : `subfinder`, `dnsx`, `httpx`, `naabu`, `nuclei`
- Parsers JSON associés
- Notion de `ScanTemplate` : une suite ordonnée d'étapes (recon chain)
- Templates seedés : `recon-passive`, `recon-active`, `web-quick`, `web-deep`
- Orchestrator : exécution en pipeline d'un template (output étape N = input étape N+1)
- Modèles `Domain`, `Subdomain`, `IpAddress`, `Technology`, `DnsRecord`
- Première version du **correlation engine** : fusion d'assets (un même `ip:port` n'a qu'une entrée), dédup findings par hash

**Critère "done" :** un seul scan lance la chaîne complète sur `client.com`, populate sous-domaines + IPs + ports + technos + vulns, le tout corrélé sur les bons assets.

### Phase 3 — Scanner SDK généralisé & vagues d'outils (4-6 semaines)
**Livrables :**
- Scanner SDK consolidé (lifecycle hooks, schémas Zod par scanner, validation args, capabilities declaration)
- Système d'images Docker hybride (officielles + builds custom dans `tools/scanner-images/`)
- Intégration par vagues batch (~10 outils par PR) :
  - Vague 1 : DNS/subdomain (amass, assetfinder, fierce, dnsrecon, dnsenum)
  - Vague 2 : ports/network (masscan, rustscan, zmap, arp-scan, fping, netdiscover)
  - Vague 3 : web enum (nikto, dirsearch, gobuster, feroxbuster, ffuf)
  - Vague 4 : vuln scanners (sqlmap, XSStrike, Dalfox, Commix, OpenVAS via greenbone-openvasd)
  - Vague 5 : SSL/TLS (testssl.sh, sslscan, sslyze)
  - Vague 6 : SMB/Windows (enum4linux, crackmapexec, smbclient, rpcclient)
  - Vague 7 : AD (BloodHound CE, ldapdomaindump, kerbrute)
  - Vague 8 : cloud (ScoutSuite, Prowler, CloudBrute)
  - Vague 9 : containers/k8s (Trivy, kube-bench, kube-hunter, Dockle)
  - Vague 10 : OSINT (theHarvester, SpiderFoot, Recon-ng)
  - Vague 11 : SMTP/SNMP (smtp-user-enum, swaks, snmpwalk, onesixtyone)
  - Vague 12 : password/auth (Hydra, Medusa, John, Hashcat) — usage manuel/scripté seulement
  - Vague 13 : WiFi (Aircrack-ng, Kismet, hcxdumptool) — laptop agent uniquement
  - Vague 14 : network analysis (tcpdump, Zeek, Suricata) — captures passives
  - Vague 15 : IoT/ICS (RouterSploit, ModbusPal) — opt-in, sandbox renforcé
  - Vague 16 : API security (Kiterunner, nuclei templates API)
  - Vague 17 : import-only (Burp Suite export, OWASP ZAP export, Nessus import, SARIF import)

**Critère "done" :** ~80 outils accessibles, catalogue versionné, chaque scanner dispose de son adapter + parser + image Docker enregistrée.

### Phase 4 — Correlation engine v2 + reporting (2-3 semaines)
**Livrables :**
- Risk scoring asset (somme pondérée des CVSS + facteurs d'exposition)
- Mapping CVE depuis CPE détectés (lib `@autoscanner/cve-db`, mirror NVD)
- Déduplication finding cross-scanner (hash structurel)
- Détection de doublons d'assets (canonicalisation domains, dedup IPs publiques/privées)
- Reporting : moteur de templates (Handlebars / Nunjucks pour HTML, puppeteer pour PDF, csv-stringify pour CSV)
- Templates par défaut : `executive-summary.pdf`, `technical-detailed.pdf`, `csv-findings.csv`, `json-export.json`, `sarif-export.sarif`
- Endpoint REST `/reports/:id/download` (streaming depuis MinIO)

**Critère "done" :** depuis un engagement, générer un rapport PDF exécutif et un export CSV, téléchargeables.

### Phase 5 — Scheduler, notifications, agent distribué (2-3 semaines)
**Livrables :**
- App `scheduler` (BullMQ repeatable jobs depuis table `Schedule`)
- App `notification-worker` (envoie email/Slack/Discord/webhook sur events)
- Channels notifications configurables par opérateur
- **Agent distribué v1** :
  - Binaire CLI `autoscanner-agent` (Node.js packagé via `pkg` ou `bun build --compile`)
  - Enrôlement via token one-time (`autoscanner-agent register --server https://... --token XXX`)
  - Connexion sortante au serveur (pas d'inbound — l'agent pull les jobs depuis Redis via tunnel TLS ou via API GraphQL longpoll)
  - Heartbeat périodique, capabilities (OS, outils dispo, network)
  - Le scheduler peut router un job vers un agent spécifique (`agentId` sur `ScanJob`)
- Webhook entrant (`POST /webhooks/burp`, `/webhooks/zap`, `/webhooks/generic`) pour ingest manuel

**Critère "done" :** enregistrer un schedule "scan nightly de `client.com`", recevoir email à fin de scan ; enrôler le laptop comme agent et lancer un scan qui s'exécute depuis le laptop.

### Phase 6 — Hardening production (3-4 semaines)
**Livrables :**
- Manifests Kubernetes (Helm chart `charts/autoscanner/`)
- Observabilité complète : OpenTelemetry traces, Prometheus metrics, dashboards Grafana fournis, logs JSON Loki-compatible
- Audit logs systématiques (mutations GraphQL + actions sensibles)
- Secret management : intégration optionnelle Vault / SOPS
- Rate limiting global API (`@nestjs/throttler`)
- Backup automatisé (`pg_dump` planifié vers MinIO chiffré)
- Documentation utilisateur complète (`docs/`)
- Tests E2E (Playwright sur frontend, supertest sur API)
- Pen test interne de la plateforme elle-même (l'outil sur l'outil)

**Critère "done" :** déploiement Helm sur un cluster K8s, dashboards Grafana populés, tests E2E verts en CI.

---

## 2. Architecture globale

### 2.1 Vue système

```
                                  ┌───────────────────────────────┐
                                  │            FRONTEND           │
                                  │  React + TS + Tailwind +      │
                                  │  Apollo Client + Zustand      │
                                  └───────────────┬───────────────┘
                                                  │ GraphQL HTTP/WS
                                                  │
   ┌─────────┐                       ┌────────────▼────────────┐
   │   CLI   │  ── GraphQL/HTTPS ──▶ │       api-gateway       │
   │ (oclif) │                       │  NestJS                 │
   └─────────┘                       │  - GraphQL Apollo       │
                                     │  - REST (upload/dl/wh)  │
   ┌─────────┐                       │  - WS gateway           │
   │ Webhook │  ── HTTPS ──────────▶ │  - Auth (JWT)           │
   │  caller │                       │  - Rate limit           │
   └─────────┘                       └────┬─────────┬──────────┘
                                          │         │
                            ┌─────────────┴──┐   ┌──┴────────────┐
                            │   PostgreSQL   │   │     Redis     │
                            │  + Prisma ORM  │   │   + BullMQ    │
                            └────────────────┘   └──┬──┬──┬──┬───┘
                                                    │  │  │  │
              ┌─────────────────┬───────────────────┘  │  │  │
              │                 │                      │  │  │
   ┌──────────▼──┐   ┌──────────▼─────┐   ┌────────────▼──▼──▼────────┐
   │ scan-worker │   │ parser-worker  │   │  scheduler / notif-worker │
   │ + docker SDK│   │  (XML/JSON/…)  │   │  (cron / outbound)        │
   └──────┬──────┘   └────────┬───────┘   └────────────┬──────────────┘
          │                   │                        │
          │ exec              │ stores                 │ writes
          ▼                   ▼                        ▼
   ┌──────────────┐   ┌──────────────┐         ┌──────────────┐
   │  docker.sock │   │    MinIO     │         │  MongoDB     │
   │  (scanner    │   │ (raw outputs,│         │  (massive    │
   │   containers)│   │  reports,    │         │   raw logs,  │
   │              │   │  uploads)    │         │   PCAP meta) │
   └──────────────┘   └──────────────┘         └──────────────┘

                                ╔═══════════════════════════╗
                                ║      DISTRIBUTED AGENT    ║
                                ║   (laptop, VPN client)    ║
                                ║                           ║
                                ║   autoscanner-agent       ║
                                ║   ├─ pull jobs (TLS)      ║
                                ║   ├─ docker runner local  ║
                                ║   └─ push results         ║
                                ╚═══════════════════════════╝
```

### 2.2 Flux d'exécution d'un scan

1. **Création** : opérateur (UI/CLI) crée un `Scan` (template + targets + engagement).
2. **Expansion** : `api-gateway` matérialise `ScanJob[]` (une par couple `scanner × target`).
3. **Enqueue** : chaque `ScanJob` est poussé dans la queue BullMQ `scan-jobs` avec routing key éventuel (agent spécifique).
4. **Exécution** : `scan-worker` (ou agent) consomme le job, prépare l'environnement Docker (volumes, network, caps, limits), lance le container scanner, stream stdout/stderr.
5. **Streaming live** : chaque ligne stdout/stderr est publiée sur Redis pub/sub `scanjob:logs:<id>` ; l'`api-gateway` la relaye via GraphQL subscription aux clients abonnés.
6. **Capture** : à la fin, exit code + raw output (XML/JSON) sont uploadés sur MinIO. Métadonnées (`RawOutput`) écrites en Postgres.
7. **Parsing** : job `parse-output` enqueué dans `parse-jobs`. `parser-worker` charge le raw depuis MinIO, parse, normalise, écrit `Asset`/`Port`/`Service`/`Finding`.
8. **Correlation** : job `correlate-scan` enqueué après dernière parse. `correlation-worker` fusionne, dédup, recalcule risk scores.
9. **Notifications** : event `scan.completed` → `notification-worker` envoie selon channels configurés.
10. **Reporting** (optionnel) : si template configuré sur le scan, un `report-job` est enqueué dans `report-jobs`.

### 2.3 Découpage Apps / Libs

```
autoscanner/
├── apps/
│   ├── api-gateway/           # NestJS HTTP + GraphQL + WS + REST
│   ├── scan-worker/           # BullMQ consumer "scan-jobs"
│   ├── parser-worker/         # BullMQ consumer "parse-jobs"
│   ├── correlation-worker/    # BullMQ consumer "correlate-jobs"
│   ├── scheduler/             # BullMQ producer (repeatable jobs)
│   ├── notification-worker/   # BullMQ consumer "notif-jobs"
│   ├── report-worker/         # BullMQ consumer "report-jobs"
│   ├── frontend/              # React + Vite + Tailwind + Apollo
│   ├── cli/                   # oclif CLI
│   └── agent/                 # binaire distribué (laptop)
│
├── libs/
│   ├── auth/                  # JWT, refresh, TOTP, guards, decorators
│   ├── database/              # Prisma client, repositories, transactions
│   ├── storage/               # MinIO client wrapper (presigned URLs, multipart)
│   ├── scanner-sdk/           # Scanner interface + base classes + registry
│   ├── scanners/              # adapters concrets (1 sous-dossier par tool)
│   │   ├── nmap/
│   │   ├── nuclei/
│   │   ├── subfinder/
│   │   ├── …
│   ├── parsers/               # 1 sous-dossier par format/outil
│   │   ├── nmap-xml/
│   │   ├── nuclei-json/
│   │   ├── nessus-xml/
│   │   ├── sarif/
│   │   ├── …
│   ├── correlation/           # engine (dedup, risk score, CVE mapping)
│   ├── cve-db/                # mirror NVD, CPE matching
│   ├── graphql/               # codegen, scalars, base types, pagination
│   ├── queues/                # BullMQ types, helpers, job factories
│   ├── docker-runner/         # Docker SDK wrapper, sandbox, limits
│   ├── reporting/             # template engine, PDF, exports
│   ├── notifications/         # channels (email, slack, discord, webhook)
│   ├── common/                # DTOs, errors, validators, utils
│   ├── logging/               # Pino setup (JSON, redact, ctx)
│   ├── telemetry/             # OpenTelemetry, Prometheus metrics
│   └── config/                # Zod schema env vars, ConfigModule wrapper
│
├── tools/
│   ├── docker-images/
│   │   └── kali-runner/       # fallback mega-image
│   └── scanner-images/        # Dockerfiles slim custom (pour outils sans image officielle)
│       ├── enum4linux/
│       ├── theharvester/
│       ├── kerbrute/
│       ├── …
│
├── charts/
│   └── autoscanner/           # Helm chart Kubernetes
│
├── docker/
│   ├── docker-compose.dev.yml
│   ├── docker-compose.prod.yml
│   └── Dockerfiles per app    # apps/api-gateway/Dockerfile, etc.
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── docs/
│   ├── superpowers/specs/
│   ├── architecture/
│   ├── scanners/              # 1 .md par scanner
│   └── operator-guide/
│
├── .github/workflows/         # CI/CD
├── nx.json
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 3. Stack technique détaillée

| Couche | Choix | Version cible |
|---|---|---|
| Runtime | Node.js LTS | 22.x |
| Package manager | pnpm | 9.x |
| Monorepo | Nx | 19.x |
| Backend framework | NestJS | 11.x |
| GraphQL | Apollo Server + `@nestjs/graphql` (code-first) | latest |
| ORM | Prisma | 5.x |
| Database (relationnel) | PostgreSQL | 16 |
| Database (raw/large) | MongoDB | 7 |
| Cache + Queue | Redis + BullMQ | Redis 7, BullMQ 5 |
| Object storage | MinIO | latest (S3-compatible) |
| Auth | Passport JWT, `@nestjs/jwt`, `argon2`, `otpauth` | latest |
| Logging | Pino | latest |
| Telemetry | OpenTelemetry + `prom-client` | latest |
| Docker SDK | `dockerode` | latest |
| Validation | Zod | latest |
| Tests | Jest + Supertest + Testcontainers + Playwright | latest |
| Frontend | React + Vite + TypeScript + Tailwind + Apollo Client + Zustand + React Router + react-hook-form + tanstack-table | React 19 |
| CLI | oclif + ink (pour vues riches) | latest |
| Reports | Handlebars + Puppeteer + csv-stringify + sarif-builder | latest |
| Lint/Format | ESLint + Prettier + commitlint + husky | latest |
| CI | GitHub Actions | — |
| Container build | Docker BuildKit, multi-stage, distroless when possible | — |

---

## 4. Modèle de données — Prisma schema

Schéma complet. Conventions :
- IDs `cuid()` (12-30 chars, sortables, URL-safe).
- Timestamps : `createdAt`, `updatedAt` partout.
- Soft delete : `deletedAt` nullable + index partiel `WHERE deletedAt IS NULL`.
- JSONB pour structures variables (config scanner, raw findings).
- Enums Prisma natifs (mappés à Postgres enums).

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearchPostgres", "postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto, citext, pg_trgm]
}

// =====================================================================
// AUTH & TENANCY
// =====================================================================

model User {
  id              String       @id @default(cuid())
  email           String       @unique
  passwordHash    String
  totpSecretEnc   Bytes?       // AES-256-GCM, clé MASTER_ENCRYPTION_KEY
  totpEnabled     Boolean      @default(false)
  displayName     String?
  isActive        Boolean      @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  deletedAt       DateTime?

  sessions        Session[]
  apiKeys         ApiKey[]
  engagements     Engagement[]
  notificationChannels NotificationChannel[]
  reports         Report[]
  uploadedFiles   UploadedFile[]
  auditLogs       AuditLog[]

  @@index([deletedAt])
}

model Session {
  id                String   @id @default(cuid())
  userId            String
  refreshTokenHash  String   @unique
  userAgent         String?
  ip                String?
  expiresAt         DateTime
  revokedAt         DateTime?
  createdAt         DateTime @default(now())

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model ApiKey {
  id              String    @id @default(cuid())
  userId          String
  name            String
  hashedKey       String    @unique
  prefix          String    // 8 premiers chars pour identification UX
  scopes          String[]  // ex: ["scan:read", "scan:write", "report:read"]
  expiresAt       DateTime?
  lastUsedAt      DateTime?
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([prefix])
}

// =====================================================================
// ENGAGEMENTS & SCOPE
// =====================================================================

enum EngagementStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
  ARCHIVED
}

model Engagement {
  id              String           @id @default(cuid())
  ownerId         String
  name            String
  clientName      String
  description     String?
  scopeText       String?          // ROE en texte libre (informationnel)
  startDate       DateTime?
  endDate         DateTime?
  status          EngagementStatus @default(DRAFT)
  metadata        Json?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  deletedAt       DateTime?

  owner           User             @relation(fields: [ownerId], references: [id])
  scopeRules      ScopeRule[]
  assets          Asset[]
  scans           Scan[]
  schedules       Schedule[]
  reports         Report[]
  credentials     Credential[]
  uploadedFiles   UploadedFile[]
  tags            EngagementTag[]

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
  id              String           @id @default(cuid())
  engagementId    String
  ruleType        ScopeRuleType
  targetType      ScopeRuleTarget
  value           String           // ex: "10.0.0.0/24" ou "*.client.com"
  notes           String?
  createdAt       DateTime         @default(now())

  engagement      Engagement       @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  @@index([engagementId])
}

// =====================================================================
// ASSETS & INVENTORY
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
  id              String        @id @default(cuid())
  engagementId    String
  type            AssetType
  value           String        // "client.com", "1.2.3.4", "https://app.client.com"
  canonicalValue  String        // normalisé pour dedup (lowercase, sans port par défaut, etc.)
  firstSeenAt     DateTime      @default(now())
  lastSeenAt      DateTime      @default(now())
  riskScore       Float         @default(0)  // 0-10
  exposureLevel   String?       // "INTERNAL" | "EXTERNAL" | "PERIMETER"
  metadata        Json?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  deletedAt       DateTime?

  engagement      Engagement    @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  ports           Port[]
  technologies    AssetTechnology[]
  findings        Finding[]
  dnsRecords      DnsRecord[]    @relation("AssetDnsRecords")
  tags            AssetTag[]
  parentAssetId   String?
  parentAsset     Asset?         @relation("AssetHierarchy", fields: [parentAssetId], references: [id])
  childAssets     Asset[]        @relation("AssetHierarchy")
  domainInfo      DomainInfo?
  ipInfo          IpInfo?

  // Note: l'unicité réelle est `(engagementId, type, canonicalValue) WHERE deletedAt IS NULL`
  // → créée via migration SQL custom (partial unique index). Prisma ne supporte pas
  //   nativement les partial indexes ; un @@unique strict bloquerait le ré-import après soft-delete.
  @@index([engagementId, type, canonicalValue])
  @@index([engagementId])
  @@index([type])
  @@index([riskScore])
  @@index([deletedAt])
}

model DomainInfo {
  id              String        @id @default(cuid())
  assetId         String        @unique
  registrar       String?
  registrantOrg   String?
  whoisData       Json?
  registeredAt    DateTime?
  expiresAt       DateTime?
  nameservers     String[]
  updatedAt       DateTime      @updatedAt

  asset           Asset         @relation(fields: [assetId], references: [id], onDelete: Cascade)
}

model IpInfo {
  id              String        @id @default(cuid())
  assetId         String        @unique
  asn             Int?
  asnOrg          String?
  isp             String?
  country         String?       // ISO-2
  city            String?
  latitude        Float?
  longitude       Float?
  isCloud         Boolean       @default(false)
  cloudProvider   String?       // "AWS" | "GCP" | "AZURE" | "DO" | …
  reverseDns      String?
  updatedAt       DateTime      @updatedAt

  asset           Asset         @relation(fields: [assetId], references: [id], onDelete: Cascade)
}

model DnsRecord {
  id              String        @id @default(cuid())
  assetId         String
  type            String        // "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA" | "SRV" | "PTR" | …
  value           String
  ttl             Int?
  firstSeenAt     DateTime      @default(now())
  lastSeenAt      DateTime      @default(now())

  asset           Asset         @relation("AssetDnsRecords", fields: [assetId], references: [id], onDelete: Cascade)

  @@unique([assetId, type, value])
  @@index([assetId])
}

enum PortState {
  OPEN
  CLOSED
  FILTERED
  OPEN_FILTERED
  UNKNOWN
}

enum L4Proto {
  TCP
  UDP
  SCTP
}

model Port {
  id              String        @id @default(cuid())
  assetId         String
  number          Int
  protocol        L4Proto
  state           PortState
  firstSeenAt     DateTime      @default(now())
  lastSeenAt      DateTime      @default(now())

  asset           Asset         @relation(fields: [assetId], references: [id], onDelete: Cascade)
  services        Service[]

  @@unique([assetId, number, protocol])
  @@index([assetId])
}

model Service {
  id              String        @id @default(cuid())
  portId          String
  name            String?       // "http" | "ssh" | …
  product         String?       // "nginx" | "openssh" | …
  version         String?
  banner          String?
  cpe             String?       // ex: cpe:/a:nginx:nginx:1.18.0
  tunnel          String?       // "ssl" | null
  extra           Json?
  firstSeenAt     DateTime      @default(now())
  lastSeenAt      DateTime      @default(now())

  port            Port          @relation(fields: [portId], references: [id], onDelete: Cascade)
  technologies    ServiceTechnology[]

  @@index([portId])
  @@index([cpe])
}

model Technology {
  id              String        @id @default(cuid())
  name            String
  vendor          String?
  category        String?       // "web-server" | "framework" | "cms" | …
  cpePrefix       String?       // racine CPE (pour matching)
  iconUrl         String?

  @@unique([name, vendor])
}

model AssetTechnology {
  assetId         String
  technologyId    String
  version         String?
  confidence      Int           @default(50)  // 0-100
  source          String        // scanner name
  firstSeenAt     DateTime      @default(now())
  lastSeenAt      DateTime      @default(now())

  asset           Asset         @relation(fields: [assetId], references: [id], onDelete: Cascade)
  technology      Technology    @relation(fields: [technologyId], references: [id])

  @@id([assetId, technologyId])
  @@index([technologyId])
}

model ServiceTechnology {
  serviceId       String
  technologyId    String
  version         String?

  service         Service       @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  technology      Technology    @relation(fields: [technologyId], references: [id])

  @@id([serviceId, technologyId])
}

// =====================================================================
// VULNERABILITIES & FINDINGS
// =====================================================================

enum Severity {
  INFO
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum FindingStatus {
  OPEN
  TRIAGED
  ACCEPTED_RISK
  FIXED
  FALSE_POSITIVE
  DUPLICATE
}

model Cve {
  id              String        @id @default(cuid())
  cveId           String        @unique  // "CVE-2024-1234"
  summary         String
  description     String?
  publishedAt     DateTime?
  modifiedAt      DateTime?
  cvss2Score      Float?
  cvss2Vector     String?
  cvss3Score      Float?
  cvss3Vector     String?
  severity        Severity?
  cwe             String[]
  references      String[]
  cpeMatches      Json?         // liste de CPE affectés
  epssScore       Float?        // probabilité d'exploitation
  kev             Boolean       @default(false)  // CISA KEV
  updatedAt       DateTime      @updatedAt

  vulnerabilities Vulnerability[]

  @@index([severity])
  @@index([publishedAt])
}

model Vulnerability {
  id              String        @id @default(cuid())
  name            String
  description     String?
  cveId           String?
  cvss            Float?
  severity        Severity
  references      String[]
  remediation     String?
  category        String?       // "injection" | "auth" | …
  templateSource  String?       // ex: "nuclei:CVE-2021-44228"
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  cve             Cve?          @relation(fields: [cveId], references: [id])
  findings        Finding[]

  @@index([cveId])
  @@index([severity])
}

model Finding {
  id              String        @id @default(cuid())
  scanId          String
  scanJobId       String?
  assetId         String
  vulnerabilityId String?
  scannerName     String
  severity        Severity
  title           String
  description     String?
  evidence        Json?         // request/response, payload, etc.
  location        String?       // URL, port, path
  status          FindingStatus @default(OPEN)
  triagedAt       DateTime?
  triagedBy       String?
  triageNotes     String?
  dedupHash       String        // hash structurel pour dedup cross-scan
  firstSeenAt     DateTime      @default(now())
  lastSeenAt      DateTime      @default(now())
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  deletedAt       DateTime?

  scan            Scan          @relation(fields: [scanId], references: [id], onDelete: Cascade)
  scanJob         ScanJob?      @relation(fields: [scanJobId], references: [id], onDelete: SetNull)
  asset           Asset         @relation(fields: [assetId], references: [id], onDelete: Cascade)
  vulnerability   Vulnerability? @relation(fields: [vulnerabilityId], references: [id])
  tags            FindingTag[]

  @@unique([assetId, dedupHash])
  @@index([scanId])
  @@index([assetId])
  @@index([severity])
  @@index([status])
  @@index([deletedAt])
}

// =====================================================================
// SCANS & ORCHESTRATION
// =====================================================================

enum ScanStatus {
  PENDING
  RUNNING
  COMPLETED
  PARTIAL
  FAILED
  CANCELLED
}

enum ScanJobStatus {
  PENDING
  QUEUED
  RUNNING
  COMPLETED
  FAILED
  TIMEOUT
  CANCELLED
  RETRYING
}

model ScanTemplate {
  id              String        @id @default(cuid())
  name            String        @unique
  description     String?
  category        String?       // "recon" | "web" | "infra" | …
  chain           Json          // [{scanner, args, conditions}, …]
  isBuiltin       Boolean       @default(false)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  scans           Scan[]
  schedules       Schedule[]
}

model Scan {
  id              String        @id @default(cuid())
  engagementId    String
  templateId      String?
  name            String?
  status          ScanStatus    @default(PENDING)
  targets         String[]      // input bruts (CIDR, domain, IP, URL)
  config          Json?         // overrides args par scanner
  startedAt       DateTime?
  finishedAt      DateTime?
  errorMessage    String?
  triggeredBy     String?       // "user:<id>" | "schedule:<id>" | "agent:<id>" | "webhook"
  parentScanId    String?       // pour chaînage / re-scan
  metadata        Json?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  deletedAt       DateTime?

  engagement      Engagement    @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  template        ScanTemplate? @relation(fields: [templateId], references: [id])
  parentScan      Scan?         @relation("ScanChain", fields: [parentScanId], references: [id])
  childScans      Scan[]        @relation("ScanChain")
  jobs            ScanJob[]
  findings        Finding[]
  reports         Report[]

  @@index([engagementId])
  @@index([status])
  @@index([deletedAt])
}

model ScanJob {
  id              String        @id @default(cuid())
  scanId          String
  scannerName     String        // "nmap" | "nuclei" | …
  target          String
  args            Json?
  status          ScanJobStatus @default(PENDING)
  agentId         String?       // null = worker default
  bullJobId       String?       // ID BullMQ pour cross-ref
  containerId     String?       // ID Docker
  exitCode        Int?
  startedAt       DateTime?
  finishedAt      DateTime?
  durationMs      Int?
  timeoutMs       Int           @default(3600000)
  retriesAttempted Int          @default(0)
  retriesMax      Int           @default(2)
  errorMessage    String?
  queuedAt        DateTime      @default(now())
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  scan            Scan          @relation(fields: [scanId], references: [id], onDelete: Cascade)
  agent           Agent?        @relation(fields: [agentId], references: [id], onDelete: SetNull)
  rawOutputs      RawOutput[]
  findings        Finding[]
  // les logs vivent en MongoDB (gros volume) — clé `scanJobId`

  @@index([scanId])
  @@index([status])
  @@index([scannerName])
  @@index([agentId])
}

enum RawOutputFormat {
  XML
  JSON
  CSV
  TEXT
  HTML
  SARIF
  PCAP
  BINARY
}

model RawOutput {
  id              String          @id @default(cuid())
  scanJobId       String
  format          RawOutputFormat
  storageKey      String          // chemin MinIO
  sizeBytes       Int
  checksumSha256  String
  parsed          Boolean         @default(false)
  parsedAt        DateTime?
  parserName      String?
  createdAt       DateTime        @default(now())

  scanJob         ScanJob         @relation(fields: [scanJobId], references: [id], onDelete: Cascade)

  @@index([scanJobId])
  @@index([parsed])
}

// =====================================================================
// SCHEDULER
// =====================================================================

model Schedule {
  id              String        @id @default(cuid())
  engagementId    String
  templateId      String
  name            String
  cronExpr        String        // ex: "0 2 * * *"
  timezone        String        @default("UTC")
  targets         String[]
  config          Json?
  enabled         Boolean       @default(true)
  lastRunAt       DateTime?
  nextRunAt       DateTime?
  lastScanId      String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  engagement      Engagement    @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  template        ScanTemplate  @relation(fields: [templateId], references: [id])

  @@index([engagementId])
  @@index([nextRunAt])
  @@index([enabled])
}

// =====================================================================
// AGENTS (distributed workers)
// =====================================================================

enum AgentStatus {
  PENDING
  ACTIVE
  IDLE
  OFFLINE
  REVOKED
}

model Agent {
  id                  String       @id @default(cuid())
  name                String       @unique
  hostname            String?
  publicKey           String?      // ed25519 pour signature heartbeats
  registrationToken   String?      @unique  // one-time, nullable après enrôlement
  enrolledAt          DateTime?
  status              AgentStatus  @default(PENDING)
  capabilities        Json?        // {os, arch, tools: [...], networks: [...]}
  version             String?
  lastHeartbeatAt     DateTime?
  ipAddress           String?
  metadata            Json?
  revokedAt           DateTime?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  jobs                ScanJob[]

  @@index([status])
  @@index([lastHeartbeatAt])
}

// =====================================================================
// CREDENTIALS (loot)
// =====================================================================

enum CredentialType {
  PASSWORD
  HASH
  TOKEN
  COOKIE
  API_KEY
  PRIVATE_KEY
  KERBEROS_TICKET
  OTHER
}

model Credential {
  id              String         @id @default(cuid())
  engagementId    String
  type            CredentialType
  username        String?
  domain          String?
  service         String?        // "ssh@1.2.3.4:22" | "smb@host" | …
  secretEncrypted Bytes          // chiffré AES-GCM, clé dans secret store
  source          String         // "scanner:hydra" | "manual" | "phishing" | …
  foundInScanId   String?
  notes           String?
  metadata        Json?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  deletedAt       DateTime?

  engagement      Engagement     @relation(fields: [engagementId], references: [id], onDelete: Cascade)

  @@index([engagementId])
  @@index([type])
  @@index([deletedAt])
}

// =====================================================================
// REPORTING
// =====================================================================

enum ReportFormat {
  PDF
  HTML
  CSV
  JSON
  XLSX
  SARIF
  MARKDOWN
}

enum ReportStatus {
  PENDING
  GENERATING
  READY
  FAILED
}

model ReportTemplate {
  id              String        @id @default(cuid())
  name            String        @unique
  description     String?
  format          ReportFormat
  templateSource  String        // contenu Handlebars/HTML inline ou chemin MinIO
  isBuiltin       Boolean       @default(false)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  reports         Report[]
}

model Report {
  id              String        @id @default(cuid())
  engagementId    String
  scanId          String?
  templateId      String?
  format          ReportFormat
  name            String
  status          ReportStatus  @default(PENDING)
  storageKey      String?       // MinIO key
  sizeBytes       Int?
  filtersApplied  Json?         // ex: {severity: ["HIGH","CRITICAL"]}
  generatedAt     DateTime?
  errorMessage    String?
  createdById     String
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  deletedAt       DateTime?

  engagement      Engagement    @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  scan            Scan?         @relation(fields: [scanId], references: [id])
  template        ReportTemplate? @relation(fields: [templateId], references: [id])
  createdBy       User          @relation(fields: [createdById], references: [id])

  @@index([engagementId])
  @@index([status])
  @@index([deletedAt])
}

// =====================================================================
// NOTIFICATIONS
// =====================================================================

enum NotificationChannelType {
  EMAIL
  SLACK
  DISCORD
  WEBHOOK
  TELEGRAM
}

model NotificationChannel {
  id              String                   @id @default(cuid())
  userId          String
  name            String
  type            NotificationChannelType
  configEncrypted Bytes                    // chiffré (URL webhook, token slack, …)
  enabled         Boolean                  @default(true)
  eventFilters    String[]                 // ["scan.completed","finding.critical"]
  createdAt       DateTime                 @default(now())
  updatedAt       DateTime                 @updatedAt

  user            User                     @relation(fields: [userId], references: [id], onDelete: Cascade)
  notifications   Notification[]

  @@index([userId])
}

enum DeliveryStatus {
  PENDING
  SENT
  FAILED
}

model Notification {
  id              String              @id @default(cuid())
  channelId       String
  eventType       String              // "scan.completed" | "finding.critical" | …
  payload         Json
  deliveryStatus  DeliveryStatus      @default(PENDING)
  attemptCount    Int                 @default(0)
  lastAttemptAt   DateTime?
  errorMessage    String?
  sentAt          DateTime?
  createdAt       DateTime            @default(now())

  channel         NotificationChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId])
  @@index([deliveryStatus])
}

// =====================================================================
// FILES & UPLOADS
// =====================================================================

model UploadedFile {
  id              String       @id @default(cuid())
  userId          String
  engagementId    String?
  name            String
  mimeType        String
  sizeBytes       Int
  storageKey      String
  checksumSha256  String
  purpose         String?      // "wordlist" | "import-nessus" | "report-asset" | …
  metadata        Json?
  createdAt       DateTime     @default(now())
  deletedAt       DateTime?

  user            User         @relation(fields: [userId], references: [id])
  engagement      Engagement?  @relation(fields: [engagementId], references: [id])

  @@index([userId])
  @@index([engagementId])
  @@index([deletedAt])
}

// =====================================================================
// TAGS (polymorphic-ish via join tables)
// =====================================================================

model Tag {
  id              String       @id @default(cuid())
  name            String       @unique
  color           String?
  description     String?
  createdAt       DateTime     @default(now())

  engagements     EngagementTag[]
  assets          AssetTag[]
  findings        FindingTag[]
}

model EngagementTag {
  engagementId String
  tagId        String

  engagement   Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  tag          Tag        @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([engagementId, tagId])
}

model AssetTag {
  assetId      String
  tagId        String

  asset        Asset @relation(fields: [assetId], references: [id], onDelete: Cascade)
  tag          Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([assetId, tagId])
}

model FindingTag {
  findingId    String
  tagId        String

  finding      Finding @relation(fields: [findingId], references: [id], onDelete: Cascade)
  tag          Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([findingId, tagId])
}

// =====================================================================
// AUDIT & WEBHOOKS
// =====================================================================

model AuditLog {
  id              String       @id @default(cuid())
  actorUserId     String?
  actorType       String       // "user" | "agent" | "system" | "api_key"
  action          String       // "scan.create" | "engagement.update" | "user.login" | …
  entityType      String?      // "Scan" | "Engagement" | …
  entityId        String?
  ipAddress       String?
  userAgent       String?
  metadata        Json?
  createdAt       DateTime     @default(now())

  actorUser       User?        @relation(fields: [actorUserId], references: [id])

  @@index([actorUserId])
  @@index([entityType, entityId])
  @@index([createdAt])
}

model WebhookEvent {
  id              String       @id @default(cuid())
  source          String       // "burp" | "zap" | "generic" | …
  payload         Json
  receivedAt      DateTime     @default(now())
  processedAt     DateTime?
  resultingScanId String?
  errorMessage    String?

  @@index([source])
  @@index([processedAt])
}
```

**Indexes additionnels (à créer via migration custom)** :
- GIN sur `Asset.value` (recherche full-text trigramme via `pg_trgm`).
- Partial unique sur `Asset (engagementId, type, canonicalValue) WHERE deletedAt IS NULL`.
- Partial sur `ScanJob (status, queuedAt) WHERE status IN ('PENDING','QUEUED','RUNNING')`.
- BRIN sur `AuditLog.createdAt` (table append-only, gros volume).

**MongoDB collections** (hors Prisma) :
- `scan_job_logs` : `{scanJobId, ts, stream, line}` — TTL 90 jours, sharded sur `scanJobId`.
- `raw_findings` : copies brutes pré-normalisation (utile pour reproduire un parse).
- `pcap_metadata` : métadonnées issues de captures réseau.

---

## 5. Authentification & sessions

### 5.1 Flow

```
POST /auth/login {email, password, totp?}
  → vérifie argon2id, vérifie TOTP si activé
  → renvoie {accessToken (JWT 15min), refreshToken (opaque 30j)}
  → écrit Session(refreshTokenHash, ip, userAgent)

POST /auth/refresh {refreshToken}
  → vérifie hash, vérifie non révoqué, vérifie non expiré
  → ROTATION : génère nouveau refreshToken, révoque l'ancien
  → renvoie nouveau accessToken + refreshToken

POST /auth/logout
  → révoque la Session courante

GET /auth/me
  → renvoie User courant (depuis access token)
```

### 5.2 Implémentation

- **JWT** : signé HS512 (clé en env `JWT_SECRET`, rotation via `JWT_PREVIOUS_SECRET` pendant transition), payload `{sub, sessionId, iat, exp}`.
- **Refresh token** : opaque 64 chars random, stocké hashé (argon2id) en DB.
- **Mot de passe** : argon2id (m=64M, t=3, p=4).
- **TOTP** : `otpauth` (RFC 6238), 30s, 6 digits, secret chiffré au repos.
- **Guards NestJS** : `JwtAuthGuard` (par défaut sur l'API), `ApiKeyAuthGuard` (alternatif), `@Public()` pour routes anonymes.
- **API Keys** : `Authorization: Bearer ak_<prefix>_<random>`. Stockage hashé. Scopes vérifiés par décorateur `@RequireScopes('scan:write')`.

### 5.3 RBAC futur (Phase 6)

Bien que solo en Phase 0, on prépare l'évolution :
- `User.roles: string[]` (ajout futur si besoin)
- Décorateur `@RequireRole('admin')` côté API
- Pas activé en Phase 0, mais le hook est là.

---

## 6. Orchestration des scans

### 6.1 Queues BullMQ

| Queue | Producteur | Consommateur | Concurrence | Description |
|---|---|---|---|---|
| `scan-jobs` | api-gateway, scheduler | scan-worker, agents | 4 par worker | Exécution d'un scanner |
| `parse-jobs` | scan-worker | parser-worker | 8 | Parse d'un raw output |
| `correlate-jobs` | parser-worker | correlation-worker | 2 | Fusion findings / assets |
| `report-jobs` | api-gateway, scheduler | report-worker | 2 | Génération PDF/CSV/… |
| `notif-jobs` | * | notification-worker | 8 | Envoi notifications |
| `cleanup-jobs` | scheduler | scan-worker | 1 | TTL logs, raw outputs anciens |

Configuration BullMQ globale :
- `removeOnComplete: { age: 7*86400, count: 5000 }`
- `removeOnFail: { age: 30*86400 }`
- `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`
- Stalled job recovery activé (lockDuration 30s)

### 6.2 Cycle de vie d'un ScanJob

```
PENDING ──┐
          ▼
        QUEUED ──▶ RUNNING ──┬──▶ COMPLETED ──▶ (enqueue parse-job)
                              │
                              ├──▶ FAILED ──▶ (retry?) ──▶ RETRYING ──▶ QUEUED
                              │                                            
                              ├──▶ TIMEOUT (idem)
                              │
                              └──▶ CANCELLED (sur action user)
```

Transitions atomiques via Prisma `UPDATE … WHERE status = expected_previous`.

### 6.3 Annulation

- `mutation cancelScan(scanId)` → met `Scan.status = CANCELLED`.
- Tous les jobs `PENDING`/`QUEUED` sont supprimés de la queue.
- Tous les jobs `RUNNING` reçoivent un signal via Redis pub/sub `scanjob:cancel:<id>`.
- Le worker écoute ce channel et `docker kill` le container correspondant.

### 6.4 Rate limiting & politesse

- Rate limit global : max 50 jobs simultanés tous workers confondus (config).
- Rate limit par engagement : max 20 jobs simultanés (évite de saturer un client).
- Rate limit par IP cible : max 5 scans simultanés sur la même cible (évite SYN flood involontaire).
- Mécanisme : compteur Redis avec lua script atomique avant `process()`.

---

## 7. Docker runner & sandboxing

### 7.1 Lib `@autoscanner/docker-runner`

Interface principale :

```typescript
// libs/docker-runner/src/runner.ts
export interface RunSpec {
  image: string;
  cmd: string[];
  env?: Record<string, string>;
  network?: 'bridge' | 'host' | 'none' | { name: string };
  capabilities?: { add?: string[]; drop?: string[] };
  readonlyRootfs?: boolean;
  user?: string;                     // "1000:1000"
  workingDir?: string;
  binds?: Array<{ src: string; dst: string; readonly?: boolean }>;
  cpuQuota?: number;                 // micro-CPUs (1.0 CPU = 1_000_000)
  memoryLimitMb?: number;
  pidsLimit?: number;
  ulimits?: Array<{ name: string; soft: number; hard: number }>;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onExit?: (code: number) => void;
}

export interface RunResult {
  exitCode: number;
  durationMs: number;
  containerId: string;
  // Si onStdout/onStderr sont fournis → streaming, pas de fichier capturé.
  // Si ces callbacks sont absents → capture vers fichier scratch retourné ici.
  stdoutPath?: string;
  stderrPath?: string;
  timedOut: boolean;
  killedByUser: boolean;
}

export interface DockerRunner {
  run(spec: RunSpec): Promise<RunResult>;
  pullIfMissing(image: string): Promise<void>;
  inspect(image: string): Promise<{ exists: boolean; digest?: string }>;
}
```

### 7.2 Defaults sandbox

Pour tout scanner sauf override explicite :
- `--cap-drop=ALL` puis ajout sélectif selon `Scanner.capabilities`.
- `--read-only` filesystem.
- `--security-opt=no-new-privileges`.
- `--pids-limit=512`.
- `--memory=2g` (override par scanner).
- `--cpus=1.0` (override par scanner).
- `--ulimit nofile=8192:8192`.
- Utilisateur non-root par défaut (`--user=1000:1000`), sauf si l'image l'interdit.
- Volume temp scratch sur tmpfs (`--tmpfs /tmp:size=512m`).
- Network par défaut `bridge` ; `host` réservé aux scanners ports/network (nmap, masscan, arp-scan).

### 7.3 Override par scanner

Chaque adapter Scanner déclare ses besoins (cf. catalogue § 11) et le runner les applique.

---

## 8. Scanner SDK

### 8.1 Interface

```typescript
// libs/scanner-sdk/src/types.ts
export interface ScannerDefinition<TInput = unknown, TRawOutput = unknown> {
  name: string;                          // identifiant unique ("nmap")
  displayName: string;                   // "Nmap"
  category: ScannerCategory[];
  description: string;
  version?: string;                      // version attendue
  inputSchema: z.ZodType<TInput>;        // valide les args utilisateur

  docker: {
    image: string;                       // "instrumentisto/nmap:latest"
    fallbackImage?: string;              // "kali-runner:latest"
    network: 'bridge' | 'host' | 'none';
    capabilities: string[];              // ["NET_RAW","NET_ADMIN"]
    readonlyRootfs: boolean;
    memoryLimitMb: number;
    cpuQuota: number;
    defaultTimeoutMs: number;
  };

  build(input: TInput, target: string, ctx: BuildContext): {
    cmd: string[];
    env?: Record<string, string>;
    binds?: Array<{ src: string; dst: string; readonly?: boolean }>;
  };

  outputs: Array<{
    format: RawOutputFormat;
    capture: 'stdout' | 'stderr' | { path: string };  // chemin dans le container, monté
    parser: string;                                    // nom enregistré dans parser registry
  }>;

  produces: Array<'Asset' | 'Port' | 'Service' | 'Technology' | 'Finding' | 'Credential' | 'DnsRecord'>;
}

export enum ScannerCategory {
  NETWORK_DISCOVERY = 'network-discovery',
  PORT_SCAN = 'port-scan',
  SERVICE_DETECTION = 'service-detection',
  DNS = 'dns',
  SUBDOMAIN_ENUM = 'subdomain-enum',
  WEB_FINGERPRINT = 'web-fingerprint',
  WEB_ENUM = 'web-enum',
  VULN_SCAN = 'vuln-scan',
  SSL_TLS = 'ssl-tls',
  SMB_WINDOWS = 'smb-windows',
  ACTIVE_DIRECTORY = 'active-directory',
  CLOUD = 'cloud',
  CONTAINER_K8S = 'container-k8s',
  WIFI = 'wifi',
  NETWORK_ANALYSIS = 'network-analysis',
  PASSWORD = 'password',
  OSINT = 'osint',
  API_SECURITY = 'api-security',
  SMTP = 'smtp',
  SNMP = 'snmp',
  IOT_ICS = 'iot-ics',
  IMPORT_ONLY = 'import-only',
}
```

### 8.2 Registry

```typescript
// libs/scanner-sdk/src/registry.ts
@Injectable()
export class ScannerRegistry {
  private readonly scanners = new Map<string, ScannerDefinition>();

  register(def: ScannerDefinition): void { /* … */ }
  get(name: string): ScannerDefinition { /* throws if not found */ }
  list(filter?: { category?: ScannerCategory }): ScannerDefinition[] { /* … */ }
}
```

Auto-registration via NestJS Module : chaque lib `scanners/<name>/` exporte un `Module` qui appelle `registry.register(…)` au `onModuleInit`.

### 8.3 Exemple — nmap adapter

```typescript
// libs/scanners/nmap/src/nmap.scanner.ts
import { z } from 'zod';
import { ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const NmapInput = z.object({
  ports: z.string().default('1-1000'),
  serviceDetection: z.boolean().default(true),
  osDetection: z.boolean().default(false),
  timingTemplate: z.number().int().min(0).max(5).default(4),
  scripts: z.array(z.string()).default([]),
  customArgs: z.array(z.string()).default([]),
});

export const NmapScanner: ScannerDefinition<z.infer<typeof NmapInput>> = {
  name: 'nmap',
  displayName: 'Nmap',
  category: [ScannerCategory.PORT_SCAN, ScannerCategory.SERVICE_DETECTION],
  description: 'Network exploration and port scanner.',
  inputSchema: NmapInput,
  docker: {
    image: 'instrumentisto/nmap:latest',
    fallbackImage: 'autoscanner/kali-runner:latest',
    network: 'host',
    capabilities: ['NET_RAW', 'NET_ADMIN', 'NET_BIND_SERVICE'],
    readonlyRootfs: false,           // nmap écrit des fichiers temp
    memoryLimitMb: 1024,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 3_600_000,     // 1h
  },
  build(input, target) {
    const args = ['-oX', '-', '-Pn', `-T${input.timingTemplate}`];
    if (input.serviceDetection) args.push('-sV');
    if (input.osDetection) args.push('-O');
    if (input.scripts.length) args.push('--script', input.scripts.join(','));
    args.push('-p', input.ports, ...input.customArgs, target);
    return { cmd: ['nmap', ...args] };
  },
  outputs: [{
    format: 'XML',
    capture: 'stdout',
    parser: 'nmap-xml',
  }],
  produces: ['Asset', 'Port', 'Service', 'Technology'],
};
```

---

## 9. Catalogue exhaustif des scanners

Format compact (~80 entrées). Pour chaque outil : `name`, `category`, `image`, `output`, `parser`, `caps`, `network`, `default-args`, `produces`, `notes`.

```yaml
# === NETWORK DISCOVERY ===
- name: nmap
  category: [network-discovery, port-scan, service-detection]
  image: instrumentisto/nmap
  output: xml
  parser: nmap-xml
  caps: [NET_RAW, NET_ADMIN, NET_BIND_SERVICE]
  network: host
  default_args: ["-sV", "-O", "-Pn", "-T4"]
  produces: [Asset, Port, Service, Technology]

- name: masscan
  category: [port-scan, network-discovery]
  image: secsi/masscan
  output: json
  parser: masscan-json
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: ["--rate=10000", "-p1-65535", "-oJ", "-"]
  produces: [Asset, Port]

- name: zmap
  category: [network-discovery, port-scan]
  image: autoscanner/zmap   # custom slim
  output: csv
  parser: zmap-csv
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: ["-p", "80", "-r", "10000", "-f", "saddr,sport,daddr,dport"]
  produces: [Asset, Port]
  notes: "Internet-scale ; à utiliser avec parcimonie et autorisation explicite."

- name: arp-scan
  category: [network-discovery]
  image: autoscanner/arp-scan
  output: text
  parser: arpscan-text
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: ["--localnet"]
  produces: [Asset, IpInfo]
  notes: "L2 uniquement → segment local, pertinent depuis agent laptop."

- name: fping
  category: [network-discovery]
  image: autoscanner/fping
  output: text
  parser: fping-text
  caps: [NET_RAW]
  network: host
  default_args: ["-a", "-q", "-g"]
  produces: [Asset]

- name: hping3
  category: [network-discovery]
  image: autoscanner/hping3
  output: text
  parser: hping-text
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: []
  produces: [Asset, Port]
  notes: "Outil expert, usage manuel essentiellement."

- name: netdiscover
  category: [network-discovery]
  image: autoscanner/netdiscover
  output: text
  parser: netdiscover-text
  caps: [NET_RAW]
  network: host
  default_args: ["-P"]
  produces: [Asset]

- name: unicornscan
  category: [port-scan]
  image: autoscanner/unicornscan
  output: text
  parser: unicornscan-text
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: []
  produces: [Asset, Port]
  notes: "Legacy ; conservé pour audits historiques."

# === PORT SCAN ===
- name: rustscan
  category: [port-scan]
  image: rustscan/rustscan
  output: text
  parser: rustscan-text
  caps: [NET_RAW]
  network: host
  default_args: ["-a", "{target}", "--ulimit", "5000", "--", "-sV", "-oX", "-"]
  produces: [Asset, Port, Service]
  notes: "Pipeline avec nmap intégré."

- name: naabu
  category: [port-scan]
  image: projectdiscovery/naabu
  output: json
  parser: naabu-json
  caps: [NET_RAW]
  network: host
  default_args: ["-json", "-silent"]
  produces: [Asset, Port]

- name: smap
  category: [port-scan]
  image: autoscanner/smap
  output: json
  parser: nmap-xml-from-smap   # smap mime nmap XML/JSON via Shodan
  caps: []
  network: bridge
  default_args: ["-oX", "-"]
  produces: [Asset, Port, Service]
  notes: "Passif via Shodan ; nécessite API key."

# === FINGERPRINTING ===
- name: whatweb
  category: [web-fingerprint]
  image: autoscanner/whatweb
  output: json
  parser: whatweb-json
  caps: []
  network: bridge
  default_args: ["--log-json=-"]
  produces: [Technology, Service]

- name: httpx
  category: [web-fingerprint, web-enum]
  image: projectdiscovery/httpx
  output: json
  parser: httpx-json
  caps: []
  network: bridge
  default_args: ["-json", "-silent", "-tech-detect", "-status-code", "-title", "-ip", "-cname", "-cdn"]
  produces: [Asset, Technology, Service]

- name: httprobe
  category: [web-fingerprint]
  image: autoscanner/httprobe
  output: text
  parser: httprobe-text
  caps: []
  network: bridge
  default_args: []
  produces: [Asset]
  notes: "Legacy → préférer httpx ; conservé pour compat."

- name: wappalyzer
  category: [web-fingerprint]
  image: autoscanner/wappalyzer-cli
  output: json
  parser: wappalyzer-json
  caps: []
  network: bridge
  default_args: []
  produces: [Technology]

- name: amass
  category: [subdomain-enum, dns, web-fingerprint]
  image: caffix/amass
  output: json
  parser: amass-json
  caps: []
  network: bridge
  default_args: ["enum", "-json", "-"]
  produces: [Asset, DnsRecord, IpInfo]

# === DNS / SUBDOMAINS ===
- name: subfinder
  category: [subdomain-enum, dns]
  image: projectdiscovery/subfinder
  output: json
  parser: subfinder-json
  caps: []
  network: bridge
  default_args: ["-json", "-silent", "-all"]
  produces: [Asset]

- name: assetfinder
  category: [subdomain-enum]
  image: autoscanner/assetfinder
  output: text
  parser: assetfinder-text
  caps: []
  network: bridge
  default_args: ["--subs-only"]
  produces: [Asset]

- name: dnsx
  category: [dns]
  image: projectdiscovery/dnsx
  output: json
  parser: dnsx-json
  caps: []
  network: bridge
  default_args: ["-json", "-silent", "-a", "-aaaa", "-cname", "-mx", "-ns", "-soa", "-txt", "-resp"]
  produces: [Asset, DnsRecord, IpInfo]

- name: fierce
  category: [dns]
  image: autoscanner/fierce
  output: text
  parser: fierce-text
  caps: []
  network: bridge
  default_args: []
  produces: [Asset, DnsRecord]

- name: dnsrecon
  category: [dns]
  image: autoscanner/dnsrecon
  output: json
  parser: dnsrecon-json
  caps: []
  network: bridge
  default_args: ["-j", "/tmp/out.json"]
  produces: [Asset, DnsRecord]

- name: dnsenum
  category: [dns]
  image: autoscanner/dnsenum
  output: xml
  parser: dnsenum-xml
  caps: []
  network: bridge
  default_args: ["--noreverse", "-o", "/tmp/out.xml"]
  produces: [Asset, DnsRecord]

# === WEB ENUMERATION ===
- name: nikto
  category: [web-enum, vuln-scan]
  image: sullo/nikto
  output: xml
  parser: nikto-xml
  caps: []
  network: bridge
  default_args: ["-Format", "xml", "-output", "/tmp/out.xml"]
  produces: [Finding]

- name: dirsearch
  category: [web-enum]
  image: autoscanner/dirsearch
  output: json
  parser: dirsearch-json
  caps: []
  network: bridge
  default_args: ["--format=json", "-o", "/tmp/out.json"]
  produces: [Finding, Asset]

- name: gobuster
  category: [web-enum, dns]
  image: autoscanner/gobuster
  output: text
  parser: gobuster-text
  caps: []
  network: bridge
  default_args: ["dir"]
  produces: [Finding, Asset]

- name: feroxbuster
  category: [web-enum]
  image: epi052/feroxbuster
  output: json
  parser: feroxbuster-json
  caps: []
  network: bridge
  default_args: ["--json", "-o", "/tmp/out.json"]
  produces: [Finding, Asset]

- name: ffuf
  category: [web-enum, api-security]
  image: secsi/ffuf
  output: json
  parser: ffuf-json
  caps: []
  network: bridge
  default_args: ["-of", "json", "-o", "/tmp/out.json"]
  produces: [Finding, Asset]

- name: burp-import
  category: [import-only, web-enum]
  image: null              # pas d'exécution, juste parse d'export
  output: xml
  parser: burp-xml
  caps: []
  network: none
  default_args: []
  produces: [Finding]
  notes: "Ingest d'un export Burp Suite via REST upload."

- name: zap
  category: [web-enum, vuln-scan]
  image: zaproxy/zap-stable
  output: json
  parser: zap-json
  caps: []
  network: bridge
  default_args: ["zap-baseline.py", "-J", "/tmp/out.json"]
  produces: [Finding]

- name: nuclei
  category: [vuln-scan, web-enum, api-security]
  image: projectdiscovery/nuclei
  output: json
  parser: nuclei-json
  caps: []
  network: bridge
  default_args: ["-jsonl", "-silent", "-severity", "low,medium,high,critical"]
  produces: [Finding, Asset, Technology]

# === VULN SCANNERS ===
- name: openvas
  category: [vuln-scan]
  image: greenbone/openvas-scanner
  output: xml
  parser: openvas-xml
  caps: [NET_RAW]
  network: host
  default_args: []
  produces: [Finding]
  notes: "Service stateful → wrap dans un job orchestré (start GVMD + scan + export)."

- name: nessus-import
  category: [import-only, vuln-scan]
  image: null
  output: nessus
  parser: nessus-xml
  caps: []
  network: none
  default_args: []
  produces: [Finding]
  notes: "Ingest .nessus via REST upload."

- name: sqlmap
  category: [vuln-scan, web-enum]
  image: googlesky/sqlmap
  output: json
  parser: sqlmap-json
  caps: []
  network: bridge
  default_args: ["--batch", "--output-dir=/tmp/sqlmap"]
  produces: [Finding, Credential]

- name: xsstrike
  category: [vuln-scan, web-enum]
  image: autoscanner/xsstrike
  output: text
  parser: xsstrike-text
  caps: []
  network: bridge
  default_args: []
  produces: [Finding]

- name: dalfox
  category: [vuln-scan, web-enum]
  image: hahwul/dalfox
  output: json
  parser: dalfox-json
  caps: []
  network: bridge
  default_args: ["--format=json", "--silence"]
  produces: [Finding]

- name: commix
  category: [vuln-scan, web-enum]
  image: autoscanner/commix
  output: text
  parser: commix-text
  caps: []
  network: bridge
  default_args: ["--batch"]
  produces: [Finding]

# === SSL/TLS ===
- name: testssl
  category: [ssl-tls]
  image: drwetter/testssl.sh
  output: json
  parser: testssl-json
  caps: []
  network: bridge
  default_args: ["--jsonfile-pretty", "/tmp/out.json", "--quiet"]
  produces: [Finding, Service]

- name: sslscan
  category: [ssl-tls]
  image: autoscanner/sslscan
  output: xml
  parser: sslscan-xml
  caps: []
  network: bridge
  default_args: ["--xml=-"]
  produces: [Finding, Service]

- name: sslyze
  category: [ssl-tls]
  image: nablac0d3/sslyze
  output: json
  parser: sslyze-json
  caps: []
  network: bridge
  default_args: ["--json_out=/tmp/out.json"]
  produces: [Finding, Service]

# === SMB / WINDOWS ===
- name: enum4linux
  category: [smb-windows]
  image: autoscanner/enum4linux-ng
  output: json
  parser: enum4linux-json
  caps: []
  network: bridge
  default_args: ["-A", "-oJ", "/tmp/out.json"]
  produces: [Finding, Credential, Asset]

- name: crackmapexec
  category: [smb-windows, active-directory, password]
  image: byt3bl33d3r/crackmapexec
  output: json
  parser: cme-json
  caps: []
  network: bridge
  default_args: ["smb"]
  produces: [Finding, Credential, Asset]

- name: smbclient
  category: [smb-windows]
  image: autoscanner/smbclient
  output: text
  parser: smbclient-text
  caps: []
  network: bridge
  default_args: ["-L"]
  produces: [Finding]

- name: rpcclient
  category: [smb-windows]
  image: autoscanner/rpcclient
  output: text
  parser: rpcclient-text
  caps: []
  network: bridge
  default_args: []
  produces: [Finding]

# === ACTIVE DIRECTORY ===
- name: bloodhound
  category: [active-directory]
  image: autoscanner/bloodhound-python
  output: json
  parser: bloodhound-json
  caps: []
  network: bridge
  default_args: ["-c", "All", "--zip"]
  produces: [Finding, Asset, Credential]

- name: sharphound
  category: [active-directory, import-only]
  image: null
  output: json
  parser: bloodhound-json
  caps: []
  network: none
  default_args: []
  produces: [Finding, Asset]
  notes: "Exécuté côté Windows par opérateur, import du .zip via REST."

- name: ldapdomaindump
  category: [active-directory]
  image: autoscanner/ldapdomaindump
  output: json
  parser: ldapdomaindump-json
  caps: []
  network: bridge
  default_args: ["-o", "/tmp/ldd"]
  produces: [Asset, Credential]

- name: kerbrute
  category: [active-directory, password]
  image: autoscanner/kerbrute
  output: text
  parser: kerbrute-text
  caps: []
  network: bridge
  default_args: []
  produces: [Credential, Finding]

# === CLOUD ===
- name: scoutsuite
  category: [cloud]
  image: nccgroup/scoutsuite
  output: json
  parser: scoutsuite-json
  caps: []
  network: bridge
  default_args: []
  produces: [Finding, Asset]
  notes: "Requiert credentials cloud → injectés via secret store."

- name: prowler
  category: [cloud]
  image: toniblyx/prowler
  output: json
  parser: prowler-json
  caps: []
  network: bridge
  default_args: ["-M", "json-asff"]
  produces: [Finding]

- name: cloudbrute
  category: [cloud, osint]
  image: autoscanner/cloudbrute
  output: text
  parser: cloudbrute-text
  caps: []
  network: bridge
  default_args: []
  produces: [Asset]

# === CONTAINERS / K8S ===
- name: trivy
  category: [container-k8s, vuln-scan]
  image: aquasec/trivy
  output: json
  parser: trivy-json
  caps: []
  network: bridge
  default_args: ["--format=json", "--quiet"]
  produces: [Finding]

- name: kube-bench
  category: [container-k8s]
  image: aquasec/kube-bench
  output: json
  parser: kubebench-json
  caps: []
  network: bridge
  default_args: ["--json"]
  produces: [Finding]

- name: kube-hunter
  category: [container-k8s]
  image: aquasec/kube-hunter
  output: json
  parser: kubehunter-json
  caps: []
  network: bridge
  default_args: ["--report=json"]
  produces: [Finding, Asset]

- name: dockle
  category: [container-k8s]
  image: goodwithtech/dockle
  output: json
  parser: dockle-json
  caps: []
  network: bridge
  default_args: ["-f", "json"]
  produces: [Finding]

# === WIFI === (agent laptop uniquement, network=host + accès interface)
- name: aircrack-ng
  category: [wifi]
  image: autoscanner/aircrack-ng
  output: text
  parser: aircrack-text
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: []
  produces: [Finding, Credential]
  notes: "Requiert interface wifi monitor → flag agent."

- name: kismet
  category: [wifi, network-analysis]
  image: autoscanner/kismet
  output: json
  parser: kismet-json
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: []
  produces: [Asset, Finding]

- name: hcxdumptool
  category: [wifi]
  image: autoscanner/hcxdumptool
  output: pcapng
  parser: pcap-meta
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: []
  produces: [Credential, Finding]

# === NETWORK ANALYSIS ===
- name: tcpdump
  category: [network-analysis]
  image: autoscanner/tcpdump
  output: pcap
  parser: pcap-meta
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: ["-w", "/tmp/capture.pcap"]
  produces: []
  notes: "Capture passive → métadonnées PCAP en Mongo."

- name: zeek
  category: [network-analysis]
  image: zeek/zeek
  output: text     # logs Zeek (conn.log, dns.log, http.log, …)
  parser: zeek-logs
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: []
  produces: [Asset, Service, Finding]

- name: suricata
  category: [network-analysis, vuln-scan]
  image: jasonish/suricata
  output: json
  parser: suricata-eve
  caps: [NET_RAW, NET_ADMIN]
  network: host
  default_args: ["-i", "eth0", "--set", "outputs.0.eve-log.filename=/tmp/eve.json"]
  produces: [Finding]
  notes: "IDS → alerte temps réel via subscription."

# === PASSWORD / AUTH ===
- name: hydra
  category: [password]
  image: vanhauser/hydra
  output: text
  parser: hydra-text
  caps: []
  network: bridge
  default_args: []
  produces: [Credential]
  notes: "Usage manuel uniquement (intrusif)."

- name: medusa
  category: [password]
  image: autoscanner/medusa
  output: text
  parser: medusa-text
  caps: []
  network: bridge
  default_args: []
  produces: [Credential]

- name: john
  category: [password]
  image: openwall/john
  output: text
  parser: john-text
  caps: []
  network: none
  default_args: []
  produces: [Credential]
  notes: "Offline cracking ; nécessite hashes uploadés."

- name: hashcat
  category: [password]
  image: autoscanner/hashcat
  output: text
  parser: hashcat-text
  caps: []
  network: none
  default_args: []
  produces: [Credential]
  notes: "GPU recommandé → routage vers agent avec capabilities.gpu."

# === OSINT ===
- name: theharvester
  category: [osint, subdomain-enum]
  image: autoscanner/theharvester
  output: json
  parser: theharvester-json
  caps: []
  network: bridge
  default_args: ["-f", "/tmp/out", "-b", "all"]
  produces: [Asset, Credential]

- name: spiderfoot
  category: [osint]
  image: securitydojo/spiderfoot
  output: json
  parser: spiderfoot-json
  caps: []
  network: bridge
  default_args: ["-q"]
  produces: [Asset, Finding, Credential]
  notes: "Stateful → API REST exposée par le container."

- name: recon-ng
  category: [osint]
  image: autoscanner/recon-ng
  output: text
  parser: reconng-text
  caps: []
  network: bridge
  default_args: []
  produces: [Asset, Credential]
  notes: "Outil interactif → wrap CLI scripté."

# === API SECURITY ===
- name: kiterunner
  category: [api-security, web-enum]
  image: autoscanner/kiterunner
  output: json
  parser: kiterunner-json
  caps: []
  network: bridge
  default_args: ["scan"]
  produces: [Finding, Asset]

# === SMTP ===
- name: smtp-user-enum
  category: [smtp]
  image: autoscanner/smtp-user-enum
  output: text
  parser: smtpenum-text
  caps: []
  network: bridge
  default_args: []
  produces: [Finding, Credential]

- name: swaks
  category: [smtp]
  image: autoscanner/swaks
  output: text
  parser: swaks-text
  caps: []
  network: bridge
  default_args: []
  produces: [Finding]

# === SNMP ===
- name: snmpwalk
  category: [snmp]
  image: autoscanner/snmpwalk
  output: text
  parser: snmpwalk-text
  caps: []
  network: bridge
  default_args: ["-v2c", "-c", "public"]
  produces: [Finding, Asset]

- name: onesixtyone
  category: [snmp]
  image: autoscanner/onesixtyone
  output: text
  parser: onesixtyone-text
  caps: [NET_RAW]
  network: host
  default_args: []
  produces: [Finding, Credential]

# === IOT / ICS ===
- name: routersploit
  category: [iot-ics, vuln-scan]
  image: autoscanner/routersploit
  output: text
  parser: routersploit-text
  caps: []
  network: bridge
  default_args: []
  produces: [Finding]
  notes: "Opt-in obligatoire par engagement."

- name: modbuspal
  category: [iot-ics]
  image: autoscanner/modbuspal
  output: text
  parser: modbus-text
  caps: []
  network: bridge
  default_args: []
  produces: [Finding]
  notes: "Outil interactif → usage manuel."

# === IMPORT-ONLY (pas d'exécution, juste upload + parse) ===
- name: sarif-import
  category: [import-only]
  image: null
  output: sarif
  parser: sarif
  caps: []
  network: none
  default_args: []
  produces: [Finding]
  notes: "Accepte tout fichier SARIF 2.1.0."

- name: maltego-import
  category: [import-only, osint]
  image: null
  output: csv
  parser: maltego-csv
  caps: []
  network: none
  default_args: []
  produces: [Asset]
```

> **Note maintenance** : un fichier `libs/scanners/<name>/scanner.yaml` est la source de vérité (parsé par `ScannerRegistry` + injecté dans `ScannerDefinition`). Le code TS spécifique à chaque scanner ne contient que la fonction `build()`.

---

## 10. Parser engine

### 10.1 Interface

```typescript
// libs/parsers/src/types.ts
export interface NormalizedOutput {
  assets: NormalizedAsset[];
  ports: NormalizedPort[];
  services: NormalizedService[];
  technologies: NormalizedTechnology[];
  dnsRecords: NormalizedDnsRecord[];
  findings: NormalizedFinding[];
  credentials: NormalizedCredential[];
  raw?: unknown;            // pour MongoDB raw_findings
}

export interface Parser<TInput = Buffer | string> {
  name: string;                       // "nmap-xml"
  formats: RawOutputFormat[];         // ["XML"]
  parse(input: TInput, ctx: ParserContext): Promise<NormalizedOutput>;
}

export interface ParserContext {
  scanJobId: string;
  scannerName: string;
  target: string;
  engagementId: string;
}
```

### 10.2 Registry

`@Injectable() ParserRegistry` avec `register(parser)` et `get(name)`. Auto-discover via modules.

### 10.3 Parsers Phase 1-2

- `nmap-xml` : utilise `xml2js`. Extrait hosts, ports, services, OS detection, scripts output.
- `nuclei-json` : ligne JSON par finding. Map `severity`, `template-id`, `info.classification.cve-id`, `matched-at`.
- `httpx-json` : ligne JSON par URL. Extrait `host`, `port`, `tech`, `title`, `status_code`, `tls`.
- `subfinder-json` : ligne par sous-domaine.
- `dnsx-json` : record DNS structuré.
- `naabu-json` : `host:port`.

Tous les autres parsers déclinés dans le catalogue § 9.

### 10.4 Normalisation transverse

- IPs : IPv4/IPv6 normalisation (notation compressée pour v6).
- Domains : lowercase, IDN → Punycode, trailing dot strippé.
- URLs : `URL` standard JS, port par défaut strippé, fragment ignoré.
- Ports : entier 1-65535, protocole en majuscules.
- Severity : mapping vers enum `Severity` (info/low/medium/high/critical).
- CVEs : regex `CVE-\d{4}-\d{4,7}` extraction.
- CPE : parse standard `cpe:2.3:` ou `cpe:/`.

---

## 11. Correlation engine

### 11.1 Responsabilités

1. **Asset deduplication** : `client.com` détecté par subfinder ET amass → 1 seul `Asset`.
2. **Cross-source merge** : ports trouvés par nmap + naabu → fusion sur `(assetId, number, protocol)` (cf. unique constraint Prisma).
3. **Finding dedup** : même vuln détectée par nuclei et nikto → 1 `Finding` (dedup hash).
4. **CVE mapping** : si Service `nginx 1.18.0` → match CPE → lookup CVEs affectées → création `Finding` automatiques (severity = max CVSS associé).
5. **Risk scoring asset** : somme pondérée des findings × facteur exposition.

### 11.2 Dedup hash

`NormalizedFinding` (champs pertinents pour le hash) :
```typescript
interface NormalizedFinding {
  scannerName: string;
  title: string;
  severity: Severity;
  location?: string;        // URL, port, chemin
  cveId?: string;
  templateId?: string;      // ex: "nuclei:CVE-2021-44228"
  evidence?: unknown;
}
```

```typescript
function dedupHashFor(finding: NormalizedFinding): string {
  // Priorité : templateId (stable cross-run) > cveId > title normalisé
  const key = finding.templateId
    ?? finding.cveId
    ?? finding.title.toLowerCase().trim();
  const parts = [key, finding.location ?? ''];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}
```

Upsert :
```typescript
prisma.finding.upsert({
  where: { assetId_dedupHash: { assetId, dedupHash } },
  create: { … },
  update: { lastSeenAt: now(), severity: max(existing.severity, new.severity) },
});
```

### 11.3 Risk score

```
asset.riskScore = clamp(0..10,
  weightedSum(findings.cvss) * exposureFactor(asset.exposureLevel)
)

exposureFactor:
  EXTERNAL  → 1.0
  PERIMETER → 0.7
  INTERNAL  → 0.4
  unknown   → 0.5

weightedSum:
  critical → cvss * 1.0
  high     → cvss * 0.8
  medium   → cvss * 0.5
  low      → cvss * 0.2
  info     → 0
```

Recalculé sur chaque écriture de finding (transaction Postgres).

### 11.4 CVE lookup

Lib `@autoscanner/cve-db` :
- Mirror NVD JSON 2.0 (téléchargement nightly via `notification-worker`/`scheduler`).
- Stockage dans table `Cve` (cf. § 4).
- Index GIN sur `cpeMatches` pour matching rapide.
- API : `findCvesForCpe(cpe: string): Cve[]`.

---

## 12. API GraphQL

### 12.1 Approche

- **Code-first** (`@nestjs/graphql` + `class-validator`).
- **Schema modulaire** : 1 module par domaine (`EngagementModule`, `ScanModule`, `AssetModule`, …).
- **Pagination** : Relay-style (`first/after/last/before`) sur les collections.
- **Filtering** : DTOs typés (`AssetFilterInput { severity, type, tags, q }`).
- **Sorting** : enums `AssetSortField` + `SortDirection`.
- **DataLoader** : N+1 prevention.
- **Apollo Federation-ready** : `@key` directives sur entités exposables.

### 12.2 Surface (extraits clés)

```graphql
# === QUERIES ===

type Query {
  # Auth
  me: User!
  
  # Engagements
  engagement(id: ID!): Engagement
  engagements(filter: EngagementFilter, page: PageArgs): EngagementConnection!
  
  # Assets
  asset(id: ID!): Asset
  assets(engagementId: ID!, filter: AssetFilter, page: PageArgs): AssetConnection!
  assetSearch(query: String!, engagementId: ID): [Asset!]!
  
  # Scans
  scan(id: ID!): Scan
  scans(filter: ScanFilter, page: PageArgs): ScanConnection!
  scanJob(id: ID!): ScanJob
  
  # Findings
  finding(id: ID!): Finding
  findings(filter: FindingFilter, page: PageArgs): FindingConnection!
  
  # Templates
  scanTemplates: [ScanTemplate!]!
  scanners: [ScannerInfo!]!         # liste depuis ScannerRegistry
  
  # Reports
  reports(engagementId: ID!): [Report!]!
  reportTemplates: [ReportTemplate!]!
  
  # Schedules
  schedules(engagementId: ID): [Schedule!]!
  
  # Agents
  agents: [Agent!]!
  
  # Credentials
  credentials(engagementId: ID!): [Credential!]!
}

# === MUTATIONS ===

type Mutation {
  # Auth
  login(input: LoginInput!): AuthPayload!
  refresh(refreshToken: String!): AuthPayload!
  logout: Boolean!
  enableTotp: TotpSetupPayload!
  confirmTotp(code: String!): Boolean!
  
  # API keys
  createApiKey(input: CreateApiKeyInput!): ApiKeyWithSecret!
  revokeApiKey(id: ID!): Boolean!
  
  # Engagements
  createEngagement(input: CreateEngagementInput!): Engagement!
  updateEngagement(id: ID!, input: UpdateEngagementInput!): Engagement!
  archiveEngagement(id: ID!): Engagement!
  addScopeRule(engagementId: ID!, input: ScopeRuleInput!): ScopeRule!
  removeScopeRule(id: ID!): Boolean!
  
  # Scans
  createScan(input: CreateScanInput!): Scan!
  cancelScan(id: ID!): Scan!
  retryScanJob(id: ID!): ScanJob!
  
  # Templates
  createScanTemplate(input: CreateScanTemplateInput!): ScanTemplate!
  updateScanTemplate(id: ID!, input: UpdateScanTemplateInput!): ScanTemplate!
  
  # Findings
  triageFinding(id: ID!, input: TriageInput!): Finding!
  bulkTriageFindings(ids: [ID!]!, input: TriageInput!): Int!
  tagFinding(id: ID!, tagId: ID!): Finding!
  
  # Reports
  generateReport(input: GenerateReportInput!): Report!
  
  # Schedules
  createSchedule(input: CreateScheduleInput!): Schedule!
  updateSchedule(id: ID!, input: UpdateScheduleInput!): Schedule!
  deleteSchedule(id: ID!): Boolean!
  
  # Agents
  createAgentRegistration(input: CreateAgentInput!): AgentRegistration!
  revokeAgent(id: ID!): Agent!
  
  # Notifications
  createNotificationChannel(input: CreateChannelInput!): NotificationChannel!
  updateNotificationChannel(id: ID!, input: UpdateChannelInput!): NotificationChannel!
  deleteNotificationChannel(id: ID!): Boolean!
  testNotificationChannel(id: ID!): Boolean!
  
  # Tags
  createTag(input: CreateTagInput!): Tag!
  
  # Credentials
  addCredential(input: AddCredentialInput!): Credential!
  deleteCredential(id: ID!): Boolean!
}

# === SUBSCRIPTIONS ===

type Subscription {
  scanJobLogs(scanJobId: ID!): ScanJobLogLine!
  scanStatus(scanId: ID!): Scan!
  scanJobStatus(scanJobId: ID!): ScanJob!
  findingsCreated(engagementId: ID!): Finding!
  assetDiscovered(engagementId: ID!): Asset!
  notificationDelivered: Notification!
  agentHeartbeat(agentId: ID): Agent!
}
```

### 12.3 Pagination type

```graphql
type AssetConnection {
  edges: [AssetEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type AssetEdge {
  cursor: String!
  node: Asset!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

input PageArgs {
  first: Int
  after: String
  last: Int
  before: String
}
```

---

## 13. Endpoints REST

GraphQL pour tout, sauf cas suivants (où REST est plus adapté) :

| Méthode | Path | Usage |
|---|---|---|
| `POST` | `/auth/login` | Pré-WS, plus simple en REST |
| `POST` | `/auth/refresh` | idem |
| `POST` | `/auth/logout` | idem |
| `POST` | `/uploads/initiate` | Crée `UploadedFile` (status pending), renvoie presigned PUT URL |
| `PUT`  | `<presigned-minio-url>` | Upload binaire direct vers MinIO (pas via api-gateway) |
| `POST` | `/uploads/:id/complete` | Confirme upload (checksum SHA-256 calculé côté MinIO) |
| `GET`  | `/reports/:id/download` | Stream binaire depuis MinIO |
| `GET`  | `/raw-outputs/:id/download` | Stream binaire |
| `POST` | `/webhooks/burp` | Ingest export Burp |
| `POST` | `/webhooks/zap` | Ingest ZAP |
| `POST` | `/webhooks/generic` | Ingest JSON générique mappable |
| `POST` | `/agents/heartbeat` | Heartbeat agents (low-overhead) |
| `GET`  | `/agents/jobs/poll` | Long-poll job pour agents |
| `POST` | `/agents/jobs/:id/result` | Push résultat depuis agent |
| `GET`  | `/health` | Liveness |
| `GET`  | `/ready` | Readiness (vérifie DB, Redis, MinIO) |
| `GET`  | `/metrics` | Prometheus exposition |

Tous protégés JWT/API-key sauf `/health`, `/ready`, `/metrics`.

---

## 14. Realtime layer

### 14.1 GraphQL subscriptions

Backend : `graphql-ws` (protocole WebSocket standard moderne).

Transport :
```
Client ── WebSocket ──▶ /graphql (api-gateway)
                        │
                        ├── auth check (token dans connectionParams)
                        ├── subscribe → enregistré en mémoire (Redis sub par instance)
                        │
                        └── Redis pub/sub channels:
                            - scanjob:logs:<id>
                            - scanjob:status:<id>
                            - scan:status:<id>
                            - finding:created:<engagementId>
                            - asset:discovered:<engagementId>
                            - agent:heartbeat:<agentId>
```

### 14.2 Stream des logs

- Le `scan-worker` consomme stdout/stderr du container Docker ligne par ligne.
- Chaque ligne :
  1. Append en MongoDB (`scan_job_logs`).
  2. Publish sur Redis `scanjob:logs:<id>` (payload `{ts, stream, line}`).
- L'`api-gateway` souscrit à Redis pour les subscriptions actives et relaye via WS.
- Throttling : si > 100 lignes/sec, batch toutes les 250ms.

### 14.3 Reconnection / catch-up

- Client peut requêter `query scanJobLogsHistory(scanJobId, fromCursor)` REST/GraphQL pour rejouer les logs après reconnect (lecture MongoDB).

---

## 15. Storage MinIO

### 15.1 Buckets

| Bucket | Contenu | Lifecycle |
|---|---|---|
| `raw-outputs` | XML/JSON/text/SARIF de chaque scan job | 180 jours |
| `reports` | PDF/CSV/HTML générés | sans expiration |
| `uploads` | fichiers utilisateur (wordlists, imports) | sans expiration |
| `pcap` | captures réseau | 90 jours |
| `screenshots` | screenshots web (futur, Phase 4+) | 180 jours |
| `backups` | dumps Postgres chiffrés | 30 jours |
| `cve-mirror` | mirror NVD JSON | rotation hebdo |

### 15.2 Conventions de clés

```
raw-outputs/<engagement-id>/<scan-id>/<scan-job-id>/<scanner>-<format>.<ext>
reports/<engagement-id>/<report-id>.<ext>
uploads/<user-id>/<file-id>-<original-name>
pcap/<engagement-id>/<scan-job-id>.pcap
```

### 15.3 Accès

- Toujours via lib `@autoscanner/storage` (jamais `aws-sdk` direct dans les apps).
- Lectures côté client : presigned URLs (1h TTL).
- Écritures depuis workers : credentials internes, jamais exposées.

---

## 16. Reporting

### 16.1 Pipeline

```
Mutation generateReport(scanId|engagementId, templateId, format, filters)
   ├── création Report (status=PENDING)
   └── enqueue report-job
       │
       └── report-worker:
           1. Status → GENERATING
           2. Charge données (Prisma queries selon filtres)
           3. Charge template (depuis ReportTemplate.templateSource)
           4. Render (Handlebars → HTML, puis Puppeteer pour PDF si format=PDF)
           5. Upload sur MinIO bucket `reports`
           6. Status → READY, storageKey rempli
           7. Notification au créateur
```

### 16.2 Templates par défaut (seedés)

- `executive-summary-pdf` : 1-2 pages, top findings, risk score, recommandations.
- `technical-detailed-pdf` : par asset, par finding, evidence, screenshots, remédiations.
- `findings-csv` : toutes les findings filtrables, colonnes complètes.
- `sarif-export` : SARIF 2.1.0 (interop CI/CD).
- `json-full-export` : dump structuré complet engagement.

### 16.3 Lib `@autoscanner/reporting`

- `TemplateEngine` : Handlebars avec helpers personnalisés (`severityBadge`, `cvss`, `formatDate`, `truncate`).
- `PdfRenderer` : Puppeteer chromium headless, page format A4.
- `CsvRenderer` : `csv-stringify`.
- `SarifBuilder` : conversion `Finding[]` → SARIF.

---

## 17. CLI

### 17.1 Tech

- **oclif** (commandes structurées, plugins, auto-doc).
- **ink** pour les vues TUI riches (tables, spinners, logs live).
- Auth : commande `autoscanner login` qui stocke un access+refresh dans `~/.config/autoscanner/credentials.json` (chmod 600).
- Communication : GraphQL via `graphql-request` + WS pour subscriptions.

### 17.2 Commandes

```
autoscanner login [--server URL]
autoscanner logout

autoscanner engagement list
autoscanner engagement create --name X --client Y [--scope-cidr ... --scope-domain ...]
autoscanner engagement show <id>
autoscanner engagement archive <id>

autoscanner scan run \
    --engagement <id> \
    [--template <name> | --scanner <name>] \
    --target <ip|cidr|domain|url> \
    [--target ...] \
    [--watch]                      # follow logs live
autoscanner scan list [--engagement <id>] [--status running]
autoscanner scan show <id>
autoscanner scan cancel <id>
autoscanner scan logs <jobId> [--follow]

autoscanner asset list --engagement <id> [--type ip|domain|...] [--risk-min 7]
autoscanner asset show <id>
autoscanner asset search "query"

autoscanner finding list --engagement <id> [--severity critical] [--status open]
autoscanner finding triage <id> --status fixed --note "patched 2026-05-24"

autoscanner report generate --engagement <id> --template executive-summary-pdf --output report.pdf
autoscanner report list --engagement <id>

autoscanner schedule create --engagement <id> --template recon-passive --cron "0 2 * * *"
autoscanner schedule list

autoscanner agent register --server URL --token TOKEN       # exécuté sur laptop
autoscanner agent run                                       # démarre l'agent daemon
autoscanner agent list

autoscanner template list
autoscanner template show <name>

autoscanner upload <file> [--engagement <id>] [--purpose wordlist]
```

### 17.3 Mode "watch"

Pour `autoscanner scan run --watch`, le CLI :
1. Affiche le scan créé.
2. Subscribe aux subscriptions `scanStatus`, `scanJobStatus`, `findingsCreated`.
3. Affiche en TUI ink : progression jobs, logs récents, findings au fur et à mesure.
4. Exit code = 0 si scan COMPLETED, 1 sinon.

---

## 18. Frontend React

### 18.1 Stack

- **Vite** (build), **React 19**, **TypeScript strict**.
- **Tailwind** + **shadcn/ui** (composants accessibles, copy-paste, pas de dépendance lourde).
- **Apollo Client** (cache normalisé, subscriptions WS).
- **Zustand** (UI state local : filtres, sélections, modales).
- **React Router** v7.
- **react-hook-form** + **zod** (formulaires).
- **TanStack Table** (tables triables/filtrables/paginées).
- **Recharts** (dashboard).
- **Sonner** (toasts).
- **Lucide React** (icônes).

### 18.2 Arborescence

```
apps/frontend/src/
├── main.tsx
├── app.tsx                       # Router + providers (Apollo, Theme, …)
├── lib/
│   ├── apollo.ts                 # client config (http + ws splitlink, auth link)
│   ├── auth.ts                   # token storage + refresh
│   └── utils.ts
├── components/
│   ├── ui/                       # shadcn primitives
│   └── shared/                   # composants métier réutilisables
│       ├── SeverityBadge.tsx
│       ├── AssetTypeIcon.tsx
│       ├── ScannerSelect.tsx
│       ├── EngagementPicker.tsx
│       └── LiveLogStream.tsx
├── features/
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   └── TotpSetupPage.tsx
│   ├── dashboard/
│   │   └── DashboardPage.tsx     # KPI + dernières scans + top findings
│   ├── engagements/
│   │   ├── EngagementListPage.tsx
│   │   ├── EngagementDetailPage.tsx
│   │   ├── EngagementCreateDialog.tsx
│   │   └── ScopeRulesEditor.tsx
│   ├── assets/
│   │   ├── AssetListPage.tsx     # table filtrable
│   │   ├── AssetDetailPage.tsx   # ports, services, technos, findings
│   │   ├── AssetSearchBar.tsx
│   │   └── AssetTopology.tsx     # vue graphe (Phase 4+)
│   ├── scans/
│   │   ├── ScanListPage.tsx
│   │   ├── ScanCreateWizard.tsx  # template OR scanner unitaire, targets
│   │   ├── ScanDetailPage.tsx    # jobs, status, logs live
│   │   └── ScanJobLogsPane.tsx
│   ├── findings/
│   │   ├── FindingListPage.tsx
│   │   ├── FindingDetailPage.tsx # evidence, triage, dedup info
│   │   └── BulkTriageDialog.tsx
│   ├── templates/
│   │   └── TemplateEditor.tsx
│   ├── reports/
│   │   ├── ReportListPage.tsx
│   │   └── ReportGenerateDialog.tsx
│   ├── schedules/
│   │   └── ScheduleListPage.tsx
│   ├── agents/
│   │   └── AgentListPage.tsx
│   ├── credentials/
│   │   └── CredentialListPage.tsx
│   └── settings/
│       ├── ProfilePage.tsx
│       ├── ApiKeysPage.tsx
│       └── NotificationChannelsPage.tsx
├── routes.tsx
├── theme.ts
└── i18n.ts                       # fr-FR par défaut
```

### 18.3 Pages clés

- **Dashboard** : nb assets, nb findings critiques 7j, top engagements, scans en cours (live).
- **Asset detail** : 1 page = 1 IP/domaine, tabs (overview, ports/services, technos, findings, history, raw outputs liés).
- **Scan create wizard** : étape 1 (engagement), 2 (template OU scanner), 3 (targets), 4 (advanced args), 5 (run).
- **Live logs** : pane avec auto-scroll, filtre stream, recherche dans logs (Cmd+F).

### 18.4 State Apollo

- Pagination via `relayStylePagination` (default Apollo).
- Subscriptions : on hydrate le cache local au fur et à mesure (subscription `findingsCreated` → ajoute au cache de la query `findings`).
- Optimistic responses pour triage / cancel.

---

## 19. Agent distribué (laptop)

### 19.1 Modèle de communication

**Inversé** : l'agent initie la connexion. Le serveur n'a jamais besoin de joindre l'agent (parfait pour laptop derrière NAT/VPN).

Deux modes au choix :
- **A. Polling** (default) : agent appelle `GET /agents/jobs/poll?capabilities=...` toutes les 5s, long-poll jusqu'à 30s côté serveur.
- **B. WebSocket** : agent ouvre WS persistant `/agents/ws`, reçoit jobs en push.

Phase 5 implémente **A** (simple), B en option Phase 6.

### 19.2 Enrôlement

```
1. Serveur : `createAgentRegistration` → renvoie {agentId, registrationToken} (one-time, 24h TTL).
2. Opérateur copie sur laptop : `autoscanner-agent register --server https://... --token <TOKEN>`.
3. Agent :
   - génère ed25519 keypair local
   - POST /agents/:id/enroll {publicKey, hostname, capabilities, version}
   - reçoit {agentSecret} (utilisé pour HMAC heartbeats / résultats)
   - efface registrationToken côté serveur
   - stocke {agentId, agentSecret, server} dans ~/.config/autoscanner-agent/config.json (chmod 600)
4. Status agent → ACTIVE
```

### 19.3 Cycle de vie en mode RUN

```
- Heartbeat toutes les 30s (POST /agents/heartbeat, signed HMAC)
- Long-poll job: GET /agents/jobs/poll
  → si job disponible et capabilities match → renvoie job spec
- Agent télécharge l'image Docker si absente
- Agent exécute via docker-runner local (même lib partagée que scan-worker)
- Stream stdout/stderr : POST /agents/jobs/:id/log (batch toutes les 250ms)
- Upload raw output : presigned PUT vers MinIO
- POST /agents/jobs/:id/result {exitCode, durationMs, rawOutputKeys[]}
- Loop
```

### 19.4 Capabilities

Déclarées par l'agent au heartbeat, utilisées par le scheduler pour router :
```json
{
  "os": "linux",
  "arch": "amd64",
  "tools": ["nmap", "nuclei", "subfinder", "aircrack-ng"],
  "network": ["internet", "vpn:client-corp"],
  "gpu": false
}
```

Le scheduler choisit l'agent qui matche le `requiredCapabilities` du job (ex: `aircrack-ng` → forcément un agent avec `tools.aircrack-ng=true`).

### 19.5 Sécurité agent

- Toutes les requêtes signées HMAC-SHA256(agentSecret).
- TLS strict (serveur doit présenter cert vérifiable).
- Pinning optionnel du SPKI serveur (config).
- Possibilité de révoquer : `revokeAgent` → toutes les requêtes signées rejetées.

---

## 20. Scheduler

### 20.1 Implémentation

- App `scheduler` séparée (1 réplique active, leader election via Redis lock).
- BullMQ `repeatable jobs` initialisés depuis la table `Schedule` au démarrage.
- À chaque tick :
  - Crée un `Scan` issu du template.
  - Enqueue les `ScanJob` correspondants.
  - Met à jour `lastRunAt`, `nextRunAt`, `lastScanId`.
- Reconfiguration à chaud : mutation `updateSchedule` → message Redis → scheduler recharge.

### 20.2 Expressions cron

- Format standard 5-fields (avec extension @yearly, @monthly, @weekly, @daily, @hourly).
- Validation par `cron-parser` côté API.
- Timezone par schedule (défaut UTC).

---

## 21. Notifications

### 21.1 Events publiables

| Event | Trigger | Payload |
|---|---|---|
| `scan.started` | `Scan.status → RUNNING` | `{scanId, engagementId, targetCount}` |
| `scan.completed` | `Scan.status → COMPLETED` | `{scanId, durationMs, findingCount, criticalCount}` |
| `scan.failed` | `Scan.status → FAILED` | `{scanId, errorMessage}` |
| `scanjob.failed` | `ScanJob.status → FAILED` | `{scanJobId, scannerName, exitCode}` |
| `finding.critical` | nouveau `Finding.severity=CRITICAL` | `{findingId, title, asset, cveId?}` |
| `finding.kev` | finding lié à CVE en CISA KEV | idem |
| `schedule.failed` | scheduled scan a échoué | `{scheduleId, error}` |
| `agent.offline` | `Agent.lastHeartbeatAt > 5min` | `{agentId, name}` |
| `report.ready` | `Report.status → READY` | `{reportId, downloadUrl}` |

### 21.2 Channels

- **Email** (SMTP, config par opérateur) — template HTML.
- **Slack** (webhook URL).
- **Discord** (webhook URL).
- **Telegram** (bot token + chat id).
- **Webhook générique** (POST JSON signé HMAC-SHA256).

### 21.3 Pipeline

```
Event publié (Redis pub/sub `events:<type>`)
    │
    └── notification-worker souscrit à tous les events:*
        ├── lit NotificationChannel correspondants (eventFilters match)
        ├── pour chaque channel : enqueue notif-job
        └── notif-job consumer : envoie selon channel.type
            - retry exponentiel 3x si échec
            - écrit Notification avec deliveryStatus
```

---

## 22. Observabilité

### 22.1 Logs

- **Pino** partout, format JSON.
- Champs standards : `ts, level, app, env, traceId, spanId, userId?, engagementId?, scanId?, scanJobId?`.
- Redact systématique de : `password`, `token`, `refreshToken`, `secret`, `apiKey`, `cookie`, `authorization`.
- Sortie stdout → collecté par Promtail / Loki en prod.

### 22.2 Metrics

- `prom-client` exposé sur `/metrics` (port 9091 ou même port API selon config).
- Metrics standards :
  - `http_request_duration_seconds{method, route, status}`
  - `graphql_resolver_duration_seconds{type, field}`
  - `bullmq_jobs_active{queue}`, `bullmq_jobs_completed_total{queue}`, `bullmq_jobs_failed_total{queue}`
  - `scan_job_duration_seconds{scanner, status}`
  - `scan_jobs_running{scanner}`
  - `docker_containers_running`
  - `db_query_duration_seconds{model, op}`
  - `minio_upload_bytes_total{bucket}`
  - `cve_db_size`

### 22.3 Traces

- OpenTelemetry SDK Node.
- Auto-instrumentation : HTTP, NestJS, Prisma, BullMQ, Redis, Mongo, dockerode.
- Export OTLP vers Tempo / Jaeger.

### 22.4 Dashboards (fournis `charts/autoscanner/dashboards/`)

- Overview : RPS, latence p95, queues, jobs running.
- Scanners : durée par scanner, taux échec, jobs par engagement.
- Storage : usage MinIO par bucket.
- Database : connexions, top queries.

### 22.5 Healthchecks

- `/health` : 200 toujours (liveness).
- `/ready` : vérifie DB, Redis, MinIO accessibles, sinon 503.

---

## 23. Sécurité

### 23.1 Sandboxing Docker

Cf. § 7.2.

### 23.2 Secrets

- `.env` en dev seulement.
- Prod : variables d'env injectées via Kubernetes Secrets (idéalement Vault/SOPS).
- Champs DB chiffrés (TOTP secret, Credential.secretEncrypted, NotificationChannel.configEncrypted) :
  - AES-256-GCM
  - Clé maître `MASTER_ENCRYPTION_KEY` (32 bytes base64)
  - Lib helper `libs/common/src/crypto/secret-box.ts`

### 23.3 Validation inputs

- Zod schemas pour args scanner.
- `class-validator` sur DTOs GraphQL/REST.
- Targets parsés et validés : IP/CIDR via `ip-cidr`, domains via regex stricte + IDN.

### 23.4 Rate limiting

- `@nestjs/throttler` global : 100 req/min/IP par défaut, override par route.
- Login : 5 tentatives/15min/IP.

### 23.5 Uploads

- Multipart limité (config, défaut 100MB).
- Vérification MIME effective (magic bytes via `file-type`).
- Stockage immédiat MinIO, jamais sur disque local du conteneur.
- Antivirus optionnel (ClamAV sidecar, Phase 6).

### 23.6 Audit

Toutes les mutations GraphQL + opérations sensibles (login, refresh, API key creation, report download) → `AuditLog`.

### 23.7 CORS / CSRF

- API GraphQL : CORS strict (allowlist `FRONTEND_URL`).
- Auth via Authorization header → CSRF non applicable (pas de cookies de session pour API).
- WS : check origin sur handshake.

### 23.8 Dependencies

- `pnpm audit` en CI.
- Renovate (ou Dependabot) pour update auto patches sécurité.
- Lockfile committed.

---

## 24. Dev environment

### 24.1 docker-compose.dev.yml

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: autoscanner
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: autoscanner
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "autoscanner"]
      interval: 5s

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes:
      - redisdata:/data

  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes:
      - mongodata:/data/db

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: autoscanner
      MINIO_ROOT_PASSWORD: devpassword
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

  minio-mc:
    image: minio/mc
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      sleep 5;
      mc alias set local http://minio:9000 autoscanner devpassword;
      mc mb -p local/raw-outputs local/reports local/uploads local/pcap local/screenshots local/backups local/cve-mirror;
      "

  # Optionnel : observability stack
  prometheus:
    image: prom/prometheus
    ports: ["9090:9090"]
    volumes:
      - ./docker/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports: ["3001:3000"]
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: "true"

volumes:
  pgdata:
  redisdata:
  mongodata:
  miniodata:
```

### 24.2 Workflow dev

```bash
# 1. Bootstrap
pnpm install
docker compose -f docker/docker-compose.dev.yml up -d
pnpm prisma migrate dev
pnpm seed

# 2. Lancer tout en parallèle
pnpm nx run-many --target=serve --projects=api-gateway,scan-worker,parser-worker,correlation-worker,scheduler,notification-worker,report-worker,frontend

# 3. Ou app par app
pnpm nx serve api-gateway
pnpm nx serve frontend
```

### 24.3 Variables d'environnement (extrait `.env.example`)

```bash
NODE_ENV=development

# Server
API_PORT=4000
FRONTEND_URL=http://localhost:5173

# Auth
JWT_SECRET=change-me-in-prod
JWT_PREVIOUS_SECRET=
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
MASTER_ENCRYPTION_KEY=base64-32-bytes-here

# Postgres
DATABASE_URL=postgresql://autoscanner:dev@localhost:5432/autoscanner

# MongoDB
MONGODB_URL=mongodb://localhost:27017/autoscanner

# Redis
REDIS_URL=redis://localhost:6379

# MinIO / S3
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=autoscanner
S3_SECRET_KEY=devpassword
S3_BUCKET_RAW=raw-outputs
S3_BUCKET_REPORTS=reports
S3_BUCKET_UPLOADS=uploads

# Docker runner
DOCKER_SOCKET=/var/run/docker.sock
SCANNER_REGISTRY_PREFIX=
SCANNER_IMAGE_PULL_POLICY=if-not-present

# Telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=
PROMETHEUS_PORT=9091

# Logging
LOG_LEVEL=info
LOG_PRETTY=true

# Operator seed
OPERATOR_EMAIL=admin@local
OPERATOR_PASSWORD=changeme

# CVE mirror
NVD_API_KEY=
```

---

## 25. Déploiement prod (Kubernetes-ready)

### 25.1 Dockerfiles apps

Multi-stage, distroless quand possible :

```dockerfile
# apps/api-gateway/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm nx build api-gateway

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist/apps/api-gateway ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
USER node
EXPOSE 4000
CMD ["node", "main.js"]
```

(Idem pour chaque app, sauf `scan-worker` qui doit avoir accès au socket Docker → image avec `docker-cli` ou montage `/var/run/docker.sock`.)

### 25.2 Helm chart `charts/autoscanner/`

```
charts/autoscanner/
├── Chart.yaml
├── values.yaml
├── values.prod.example.yaml
└── templates/
    ├── _helpers.tpl
    ├── api-gateway-deployment.yaml
    ├── api-gateway-service.yaml
    ├── api-gateway-ingress.yaml
    ├── scan-worker-deployment.yaml         # privileged: true OR docker-out-of-docker
    ├── parser-worker-deployment.yaml
    ├── correlation-worker-deployment.yaml
    ├── scheduler-deployment.yaml
    ├── notification-worker-deployment.yaml
    ├── report-worker-deployment.yaml
    ├── frontend-deployment.yaml
    ├── frontend-service.yaml
    ├── frontend-ingress.yaml
    ├── postgres-statefulset.yaml           # ou external
    ├── redis-deployment.yaml               # ou external
    ├── minio-statefulset.yaml              # ou external (S3 réel)
    ├── mongo-statefulset.yaml
    ├── secrets.yaml
    ├── configmap.yaml
    ├── servicemonitor.yaml                 # Prometheus Operator
    ├── networkpolicies.yaml
    └── cronjobs/
        ├── backup.yaml
        ├── nvd-sync.yaml
        └── cleanup.yaml
```

### 25.3 Considérations

- **Scan-worker en K8s** : 2 approches.
  - A. **Docker-out-of-Docker** : montage `/var/run/docker.sock` → simple mais privilèges hôte.
  - B. **Sysbox / Kata Containers** : sandbox VM léger, plus sécurisé.
  - C. **Kubernetes Jobs** : chaque scan = un Job K8s avec image scanner. Plus K8s-natif mais reconception du runner.

  Phase 6 démarre avec A en cluster dédié (pas multi-tenant K8s). Considérer C si scale > 100 jobs concurrents.

- **Network policies** : api-gateway exposé via Ingress TLS uniquement. Workers et DBs internes uniquement.
- **HPA** : scan-worker et parser-worker scalables sur métrique `bullmq_jobs_active`.

---

## 26. CI/CD

### 26.1 GitHub Actions workflows

```
.github/workflows/
├── ci.yml             # lint + type + test sur PR
├── build.yml          # build + push images sur main
├── deploy-staging.yml # déploiement auto staging
├── deploy-prod.yml    # déploiement prod manuel
└── nightly.yml        # tests E2E + audit
```

### 26.2 ci.yml (squelette)

```yaml
name: CI
on: [pull_request]
jobs:
  lint-test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: ci }, ports: ["5432:5432"] }
      redis:    { image: redis:7,     ports: ["6379:6379"] }
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm nx affected -t lint,type-check,test --parallel=3
        env:
          DATABASE_URL: postgresql://postgres:ci@localhost:5432/postgres
          REDIS_URL: redis://localhost:6379
      - run: pnpm nx affected -t build --parallel=3
```

### 26.3 Image build

`build.yml` : sur push `main`, build et push toutes les images apps modifiées vers GHCR (`ghcr.io/<org>/autoscanner-api-gateway:sha`).

---

## 27. Stratégie de tests

| Niveau | Outils | Cibles |
|---|---|---|
| Unitaire | Jest | parsers, scanner builders, services purs, utils |
| Intégration | Jest + Testcontainers (Postgres, Redis, MinIO réels) | repositories, queues, storage |
| API | Supertest + Apollo testing | resolvers GraphQL, endpoints REST |
| Scanner | Jest + fixtures réelles | parsing de raw outputs réels (Phase 1+) |
| E2E | Playwright | flows complets frontend |
| Sécurité | Pen test manuel + nuclei + ZAP sur l'instance dev | self-pwn |

**Fixtures** : `tests/fixtures/scanner-outputs/<scanner>/<case>.{xml,json,...}` — chaque parser a au moins 3 fixtures (cas nominal, edge, vide/erreur).

---

## 28. Risques & points ouverts

| # | Risque / question | Mitigation / décision à prendre plus tard |
|---|---|---|
| 1 | Maintenance de ~80 adapters/parsers | YAML déclaratif + génération maximale ; n'activer que les outils réellement utilisés en prod |
| 2 | Image `autoscanner/kali-runner` énorme | Layer caching agressif, ne push qu'à chaque release majeure |
| 3 | OpenVAS est stateful (service longue durée) | Wrapper qui gère start/stop scanner via API GMP, pas conteneur jetable |
| 4 | Outils nécessitant interactivité (Recon-ng, MSF) | Wrap CLI scripté ; pour MSF (non listé), considérer `msfconsole -x` |
| 5 | WiFi scanners depuis serveur cloud impossible | Restreints à agent local explicitement |
| 6 | Risque légal scope informationnel | Mention explicite UI + checkbox ROE à chaque scan ; possible upgrade vers enforcement Phase 6 |
| 7 | Captures PCAP volumineuses | Stockage MinIO + métadonnées Mongo ; pas de parsing systématique |
| 8 | Concurrence Docker socket sur scan-worker | Limiter concurrence BullMQ (4 par worker, configurable) |
| 9 | Updates NVD lourds | Sync incrémental, jamais bloquant, fallback API NVD live si CVE manquant |
| 10 | Backup/restore Postgres | CronJob `pg_dump` + upload MinIO chiffré ; restore procédure documentée |
| 11 | Migration plus tard vers multi-tenant strict | Champ `engagementId` partout sert déjà de discriminator, ajout `tenantId` rétrocompat possible |
| 12 | Stockage long terme logs scan | TTL Mongo 90j, configurable ; export sur demande |
| 13 | Hashes/credentials = matériel sensible | Chiffrement at-rest, accès restreint, jamais loggés, audit lourd |
| 14 | Update scanners (nouvelles versions outils) | CI nightly rebuild images, tests fixtures contre nouvelles versions |
| 15 | Conflits de port en host network | Documentation : un seul scanner `network: host` à la fois par hôte |

---

## 29. Glossaire

- **Engagement** : mission pentest sur un périmètre client autorisé.
- **Scan** : exécution d'un template ou d'un scanner unique sur un ou plusieurs targets, dans le cadre d'un Engagement.
- **ScanJob** : exécution unitaire d'un scanner sur une target.
- **Asset** : entité observée (domaine, IP, URL, conteneur, …).
- **Finding** : observation issue d'un scanner (vuln, misconfig, info).
- **Vulnerability** : définition générique d'une vuln (peut être liée à un CVE).
- **CVE** : identifiant standardisé (NVD).
- **CPE** : identifiant standardisé d'un produit/version (utilisé pour matcher CVE).
- **KEV** : CISA Known Exploited Vulnerabilities catalog.
- **SARIF** : format standard d'échange de findings.
- **Template** : suite ordonnée de scanners + args (recon chain, web quick, etc.).
- **Agent** : worker distribué (laptop) qui exécute des jobs depuis le central.

---

## 30. Critères d'acceptation Phase 0 (spec → plan immédiat)

La Phase 0 commence dès validation de cette spec et du plan d'implémentation issu. Critères :

- ✅ `git clone && pnpm install && docker compose -f docker/docker-compose.dev.yml up -d && pnpm prisma migrate dev && pnpm seed && pnpm nx serve api-gateway` produit une API GraphQL fonctionnelle sur http://localhost:4000/graphql.
- ✅ Login via mutation `login(email, password)` retourne JWT + refresh.
- ✅ Query `me` renvoie l'utilisateur seed.
- ✅ `/health` répond 200, `/ready` vérifie DB+Redis+MinIO.
- ✅ CI GitHub Actions verte sur PR (lint, type, test, build).
- ✅ Logs Pino JSON émis sur stdout avec `traceId`.
- ✅ Métriques Prometheus exposées sur `:9091/metrics`.
- ✅ Documentation `README.md` permet à un dev de démarrer en < 15 min.

---

## Fin de spec V1.

**Prochaine étape :** revue par l'opérateur de cette spec. Une fois validée, passage à l'écriture du plan d'implémentation détaillé pour la Phase 0 (puis chaque phase à son tour).
