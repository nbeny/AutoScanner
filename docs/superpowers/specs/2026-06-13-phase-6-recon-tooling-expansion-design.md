# Phase 6 — Recon Tooling Expansion — Design

> **Date:** 2026-06-13
> **Statut:** Spec V1 — issue d'un brainstorm, en attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming → **Spec (ce document)** → Plan d'implémentation (par sous-phase) → Code.
> **Spec maître:** `docs/superpowers/specs/2026-05-24-autoscanner-platform-design.md`.
> **Antérieur direct:** `docs/superpowers/specs/2026-05-27-phase-2-recon-chain-design.md` (établit scanner-sdk, orchestrator, correlation).

Ce document conçoit l'élargissement massif de l'outillage de reconnaissance. Il définit un **principe d'architecture transverse** (réutilisation intégrale du pattern Phase 2, zéro nouvelle infrastructure) puis décompose le travail en **4 sous-phases** alignées sur les familles d'outils. **6.1 est détaillée au niveau prêt-à-implémenter**; 6.2/6.3/6.4 sont esquissées proprement et feront chacune l'objet de leur propre cycle spec affinée → plan → code.

---

## 1. Objectif et critère "done"

**Objectif:** passer de 6 scanners intégrés (`nmap`, `subfinder`, `dnsx`, `httpx`, `naabu`, `nuclei`) à une couverture de reconnaissance large, en intégrant ~15-20 outils répartis sur 4 familles, **sans refonte de l'architecture**. Chaque outil doit être (a) runnable indépendamment (scan unitaire) et (b) chaînable dans un template.

**Critère "done" Phase 6 (atteint à l'issue des 4 sous-phases):**

1. Chaque outil intégré est runnable seul via la mutation `runScan` existante (TemplateRun mono-étape) **et** apparaît dans au moins un template multi-outils.
2. La sortie brute de chaque outil est persistée dans MinIO (mécanisme Phase 1) et téléchargeable.
3. Chaque outil possède un parser qui peuple les bonnes entités (existantes ou nouvelles) en passant par le correlation engine (merge + dedup).
4. Re-run d'un même template sur la même cible → 0 doublon; les assets vus par plusieurs outils accumulent leurs sources dans `discoveredBy`.
5. Nouveaux templates seedés couvrant chaque famille.
6. CI verte; suites e2e env-gated par sous-phase étendant l'existant.

**Critère "done" par sous-phase:** voir §4 (6.1 détaillé) et §5 (6.2/6.3/6.4 esquisses).

---

## 2. Principe d'architecture transverse

Décision fondatrice: **zéro nouvelle infrastructure, réutilisation à l'identique du pattern Phase 2.**

### 2.1 Anatomie d'un outil intégré

Chaque outil ajoute exactement deux unités, suivant le pattern des 6 scanners actuels:

- **`libs/scanners/<nom>/`** — un `ScannerDefinition` (`libs/scanner-sdk/src/types.ts`): `name`, `displayName`, `category: ScannerCategory[]`, `inputSchema` (Zod, validé côté API), `docker` (image **pinnée** + limites), `build(input, target, ctx)` → `BuildResult` (cmd/env/binds/stdin), `outputs` (format + capture + nom de parser), `produces` (entités).
- **`libs/parsers/src/<nom>/`** — produit un `NormalizedOutput`; la persistance réutilise `PersistService`.

L'outil est enregistré dans `ScannerRegistry` (DI, pattern existant). Rien d'autre n'est requis pour le rendre runnable.

### 2.2 Runnable indépendamment = gratuit

Un scan unitaire est déjà modélisé comme un `TemplateRun` à 1 étape (rétro-compat Phase 2, template synthétique `single-scanner-<name>`). **Aucun travail spécifique** n'est nécessaire pour la contrainte « chaque outil runnable seul »: elle est satisfaite par construction dès que le scanner est enregistré.

### 2.3 Nouvelles tables: seulement si nouveau type d'entité

On n'ajoute une table Prisma que lorsqu'une famille produit une entité réellement nouvelle:
- 6.1 DNS/sous-domaines → **aucune** nouvelle table (réutilise `Domain`/`Subdomain`/`IpAddress`/`DnsRecord`).
- 6.2 Web/endpoints → **`Endpoint`**.
- 6.3 OSINT → **`Email`**, **`OrgMetadata`**, **`ApiCredential`**.
- 6.4 Fingerprint/TLS → **`TlsCertificate`** (réutilise `Technology`, émet des `Finding` pour ciphers faibles).

### 2.4 Corrélation: bénéfice direct, pas de nouveau code structurel

Le correlation engine v1 (Phase 2) fait exactement ce dont cette phase a besoin: plusieurs sources voyant `api.client.com` → un seul `Subdomain`, `discoveredBy: string[]` accumule les noms d'outils. Chaque nouvelle entité (6.2+) doit définir sa **clé canonique** (pour le merge) et, si elle peut générer des findings, sa contribution au `dedupHash`. C'est l'unique extension requise côté correlation.

### 2.5 Concerns transverses (conçus une fois, appliqués partout)

- **Critères de sélection d'outil:** binaire unique ou image officielle, sortie JSON/JSONL de préférence, projet activement maintenu, **image Docker pinnée** (jamais `:latest` en prod; `:latest` toléré seulement en dev comme subfinder actuel).
- **Secrets / clés API (surtout 6.3):** réutilisation du `SecretBox` AES-GCM (`libs/common`) + `MASTER_ENCRYPTION_KEY`. Les clés ne transitent jamais en clair en base ni dans les logs; injectées dans le conteneur via `BuildResult.env` au moment du run.
- **Validation de scope:** chaque outil **actif** (trafic sortant vers la cible) est re-validé contre les `ScopeRule` de l'engagement avant exécution (mécanisme Phase 2). Les outils **passifs** (archives, API tierces) sont exemptés de la validation par-cible mais respectent le périmètre de l'engagement.
- **Tolérance des parsers:** Zod `.passthrough()`, warning (jamais crash) sur champs inconnus, images pinnées pour stabiliser le format.
- **Wordlists/resolvers:** embarqués dans l'image avec une valeur par défaut curée; override via input (bind-mount). **Pas de gestion de wordlists en base** avant preuve de besoin (YAGNI).

---

## 3. Décomposition en sous-phases

| Sous-phase | Famille | Outils visés | Nouveau modèle de données | Risque |
| --- | --- | --- | --- | --- |
| **6.1** | DNS / sous-domaines passifs | `amass` (passif), `assetfinder`, `findomain`, `puredns`, (`dnsgen` opt.) | **Aucun** | Faible |
| **6.2** | Web / contenu / endpoints | `katana`, `gau`/`waybackurls`, `ffuf`, `gobuster`, (`gospider` opt.) | `Endpoint` | Moyen |
| **6.3** | OSINT / surface externe | `theHarvester`, `shodan`, `censys`, `crt.sh`, `whois` | `Email`, `OrgMetadata`, `ApiCredential` | Élevé (secrets, API) |
| **6.4** | Fingerprint / techno / TLS | `tlsx`, `whatweb`, `sslscan`, `testssl.sh` | `TlsCertificate` | Moyen |

**Ordre d'exécution recommandé:** 6.1 → 6.4 → 6.2 → 6.3 (du moins risqué/sans-table vers le plus transverse). Chaque sous-phase est indépendante et peut être priorisée différemment; aucune dépendance dure inter-sous-phases hormis le correlation engine commun.

Chaque sous-phase obtient sa propre spec affinée (raffinant l'esquisse §5) puis son plan d'implémentation via `writing-plans`, dans `docs/superpowers/`.

---

## 4. Sous-phase 6.1 — DNS / sous-domaines passifs (détaillée)

### 4.1 Objectif

Élargir la couche découverte (aujourd'hui `subfinder` seul en passif) à un faisceau de sources qui se complètent, et prouver que le correlation engine fusionne proprement le multi-source. Aucun nouveau modèle de données — c'est délibéré: 6.1 valide le pattern « ajouter N sources à une famille existante » qu'on rejoue ensuite.

### 4.2 Outils et adaptateurs

| Outil | Image | Mode | Input notable | Output | Parser |
| --- | --- | --- | --- | --- | --- |
| `amass` | `caffix/amass:vX.Y` | **passif** (`enum -passive`) | `timeout` | TEXT/JSON | `amass-json` |
| `assetfinder` | image buildée (`tomnomnom/assetfinder`) | passif | `subsOnly` | TEXT (lignes) | `assetfinder-text` |
| `findomain` | `edu4rdshl/findomain:vX.Y` | passif | — | JSON/TEXT | `findomain-text` |
| `puredns` | image buildée (`d3mondev/puredns`) | **résolution + brute opt.** | `wordlist?`, `resolvers?`, `bruteforce` | TEXT (résolus) | `puredns-text` |

- **`amass` en passif uniquement** en 6.1: le mode actif (brute, scraping intensif) est lourd et bruyant; reporté (réévalué en 6.x ultérieur si besoin). Décision **D1**.
- **`puredns`** a deux usages: (a) résolution/validation d'une liste de candidats, (b) brute-force DNS (`bruteforce: true`, nécessite wordlist). Par défaut **résolution seule**; le brute est opt-in et soumis à la validation de scope (actif). Wordlist + resolvers par défaut embarqués dans l'image, override par input.
- Les adaptateurs sans image officielle stable (`assetfinder`, `puredns`) sont buildés via un `Dockerfile` versionné sous `docker/scanners/<nom>/` (pattern à introduire si absent; sinon images communautaires pinnées).

### 4.3 Modèle de données

**Aucun changement de schéma.** Tous les outils produisent `Subdomain` (+ `Domain` parent). `puredns` peuple aussi `IpAddress` + lien `SubdomainIp` (comme `dnsx`). Les parsers émettent `NormalizedOutput{ subdomains, ipAddresses?, dnsRecords? }` consommé par le `PersistService` existant.

### 4.4 Parsers

- `assetfinder-text`, `puredns-text`: une entrée par ligne (`hostname` ou `hostname A.B.C.D`).
- `amass-json`, `findomain-text`: parsing du format respectif, extraction des hostnames (et IPs si présentes).
- Tous canonicalisent via le helper correlation existant (lowercase, trim, trailing-dot, IDN→punycode) avant émission. Fixtures JSON/TEXT commitées (capturées une fois sur une cible publique type `hackerone.com`).

### 4.5 Corrélation

Bénéfice direct, **zéro code structurel nouveau**: le merge par clé canonique `(engagementId, kind=SUBDOMAIN, canonical_value)` fusionne les doublons inter-sources; `Subdomain` (via `Asset.discoveredBy`) accumule `["subfinder","assetfinder","findomain","amass"]`. Test d'idempotence: re-run → 0 insert, `lastSeenAt` actualisé.

### 4.6 Templates

- **Nouveau template `recon-passive-deep`**: `subfinder` → `assetfinder` → `findomain` → `amass(passif)` → `dnsx` (résolution) → `httpx`. Modèle linéaire Phase 2 (steps séquentiels; le contexte inter-step passe par la DB).
- **`recon-passive` (Phase 2) reste inchangé** et rapide (subfinder → httpx).
- Seed: `pnpm seed` ajoute `recon-passive-deep`.
- Décision **D2**: les sources d'énumération s'enchaînent séquentiellement (pas de parallélisme intra-template en Phase 2/6.1; le modèle d'exécution est linéaire). Le coût est acceptable car les outils passifs sont rapides; le parallélisme DAG reste hors-scope (cf. Phase 2 §7).

### 4.7 Acceptance (e2e env-gated `recon-passive-deep-e2e`)

Lancer `recon-passive-deep` sur la cible e2e:
1. Subdomains insérés provenant de **≥3 sources distinctes** (vérifié via `discoveredBy`).
2. Au moins un `Subdomain` partagé montre **≥2 sources** dans `discoveredBy`.
3. `dnsx` a résolu ≥1 `IpAddress`; `httpx` a posé ≥1 `Technology`.
4. Re-run → **0 nouveau** Subdomain inséré, `lastSeenAt` actualisé.
Mêmes env vars que Phase 1/2 (`E2E_API_URL`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_TARGET`), skip si absentes.

### 4.8 Risques spécifiques 6.1

- **Builds d'images custom** (`assetfinder`, `puredns`): surface de maintenance. *Mitigation:* `Dockerfile` versionnés, tags pinnés, build caché en CI.
- **`puredns` brute-force = trafic DNS volumineux**. *Mitigation:* opt-in, validation scope, resolvers/wordlist bornés par défaut.
- **`amass` lourd même en passif** sur gros domaine. *Mitigation:* `timeout` par défaut conservateur, image pinnée.

---

## 5. Esquisses 6.2 / 6.3 / 6.4

Esquisses au niveau design; chacune sera raffinée en spec dédiée avant son plan.

### 5.1 Sous-phase 6.2 — Web / contenu / endpoints

- **Nouvelle table `Endpoint`**: `id`, `engagementId`, `subdomainId?`, `url` (canonique), `method` (défaut GET), `statusCode?`, `contentLength?`, `source` (scannerName), `firstSeenAt`, `lastSeenAt`. Clé canonique de merge: `(engagementId, normalized_url, method)`. Intégrée à `asset_unified_view` ou query GraphQL dédiée `endpoints(engagementId, ...)` + onglet UI.
- **Outils:** `katana` (crawl actif), `gau`/`waybackurls` (URLs archivées, passif), `ffuf`/`gobuster` (fuzzing de répertoires, actif, wordlist).
- **Templates:** `web-content` = `httpx` → `katana` + `gau` → `ffuf` (sur les chemins découverts).
- **Risque clé:** explosion du volume d'URLs (fuzzing). *Mitigation:* dedup canonique strict, limites de taux, statut-code filtering.

### 5.2 Sous-phase 6.3 — OSINT / surface externe

- **Nouvelles tables:** `Email` (`engagementId`, `address` canonique, `source`, `firstSeen/lastSeen`), `OrgMetadata` (whois/ASN/org info, JSONB), `ApiCredential` (`provider`, `secretRef` chiffré via `SecretBox`, scope opérateur/engagement).
- **Outils:** `theHarvester` (emails/hosts), `shodan` + `censys` (**clés API** → `ApiCredential`), `crt.sh` (Certificate Transparency, fetch HTTP simple — peut-être pas un conteneur mais un fetcher interne), `whois`.
- **Concern majeur = secrets:** gestion des clés API (saisie UI/CLI → chiffrées → injectées en `env` au run). Rate-limits des API tierces à respecter.
- **Risque clé:** fuite de secrets, quotas API. *Mitigation:* `SecretBox`, jamais de log de clé, backoff sur rate-limit.

### 5.3 Sous-phase 6.4 — Fingerprint / techno / TLS

- **Nouvelle table `TlsCertificate`**: `subject`, `issuer`, `sans[]`, `notBefore`, `notAfter`, `fingerprintSha256`, `subdomainId?`/`ipAddressId?`. Ciphers/protocoles faibles → `Finding` (réutilise dedup). Réutilise `Technology` pour le fingerprint applicatif.
- **Outils:** `tlsx` (ProjectDiscovery, JSONL — le plus simple, à faire en premier), `whatweb`, `sslscan`, `testssl.sh`.
- **Templates:** `web-fingerprint` étend `httpx` → `tlsx` + `whatweb`.
- **Risque clé:** `testssl.sh` lent et verbeux. *Mitigation:* timeout, parsing JSON (`--jsonfile`), image pinnée.

---

## 6. Risques (transverses)

Par ordre de criticité:

1. **Dérive des formats de sortie** des outils tiers (évoluent vite). *Mitigation:* images **pinnées**, parsers tolérants (Zod `.passthrough()` + warning), fixtures de référence.
2. **Poids et temps de pull des images** en CI (15-20 images). *Mitigation:* pre-pull caché par step CI, builds custom mis en cache, matrix séparée.
3. **Secrets / clés API** (6.3). *Mitigation:* `SecretBox`, injection au run, zéro log.
4. **Scope creep des outils actifs** (`puredns` brute, `ffuf`, `katana`). *Mitigation:* re-validation scope à chaque step, opt-in des modes intensifs.
5. **Maintenance des images custom** (outils sans image officielle). *Mitigation:* `Dockerfile` versionnés sous `docker/scanners/`.

---

## 7. Plan de tests (transverse)

- **Unit par parser:** fixtures commitées (capturées une fois sur cible publique), test d'idempotence et d'ordre-indépendance via le correlation engine.
- **Integration orchestrator:** les nouveaux templates testés avec mock scanner (no Docker) validant la state machine TemplateRun.
- **E2E env-gated par sous-phase:** `recon-passive-deep-e2e` (6.1), `web-content-e2e` (6.2), `osint-e2e` (6.3), `web-fingerprint-e2e` (6.4). Mêmes env vars que Phase 1/2, skip si absentes.
- **CI:** pre-pull/build des nouvelles images en step cache; suites e2e en matrix séparée du build/unit.

---

## 8. Décisions ouvertes

À confirmer avant/pendant l'écriture du plan de chaque sous-phase.

- **D1 — `amass` actif en 6.1 ?** Recommandation: **non**, passif uniquement en 6.1; mode actif réévalué plus tard.
- **D2 — Parallélisme des sources d'énumération ?** Recommandation: **non** (modèle linéaire Phase 2); DAG hors-scope.
- **D3 — Images custom vs communautaires** pour `assetfinder`/`puredns` ? Recommandation: `Dockerfile` versionnés sous `docker/scanners/` si pas d'image officielle fiable et pinnable.
- **D4 — `crt.sh` (6.3): conteneur ou fetcher interne ?** Recommandation: fetcher HTTP interne (pas un binaire à conteneuriser) — à trancher en spec 6.3.
- **D5 — Gestion des wordlists** (puredns/ffuf/gobuster): embarquées vs. table dédiée ? Recommandation: embarquées + override input en 6.1/6.2; table seulement si besoin prouvé.

---

## 9. Hors-scope Phase 6 (rappel)

- DAG / exécution parallèle multi-parents (toujours Phase 3+).
- Cross-scanner finding correlation intelligent (déduire que 2 outils pointent la même vuln).
- Mode actif d'`amass`, scanners d'exploitation, brute-force de credentials.
- Gestion en base des wordlists/resolvers (sauf preuve de besoin).
- Vue `asset_unified_view` matérialisée.
