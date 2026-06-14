# Phase 8.1 — Passive Attack-Surface v2 — Design

> **Date:** 2026-06-14
> **Statut:** Spec V1 — issue du brainstorming (axe « surface passive »). En attente de revue avant `writing-plans`.
> **Cycle:** Brainstorming (fait) → **Spec (ce document)** → Plan 8.1 → Code.
> **Contexte parent:** Phase 8 « Recon expansion v2 » = 4 sous-phases (8.1 surface passive, 8.2 enrichissement par asset, 8.3 nouveaux protocoles, 8.4 détection de vulnérabilités). Chaque sous-phase = lot de scanners + template, son propre cycle spec→plan→code. **8.1 est la première.**
> **Précédent de référence:** Phase 6 (recon tooling expansion) — même patron d'ajout de scanners.

---

## 1. Objectif et critère « done »

**Objectif:** combler les angles morts **passifs** de la reconnaissance pour découvrir plus d'informations sans interaction intrusive avec la cible — espace IP de l'organisation (ASN/CIDR), stockage cloud exposé, sous-domaines et secrets fuités sur GitHub, et DNS passif/historique.

**Approche retenue (A — « réutilisation maximale »):** chaque outil devient un `ScannerDefinition` Docker-sandboxé standard, et **toute la sortie est mappée sur des entités déjà persistées** (`Subdomain`, `DnsRecord`, `Finding`, `OrgMetadata`). Aucun nouveau modèle Prisma. Les seuls deltas de schéma sont 3 valeurs d'enum.

**Critère « done » 8.1:**
1. 5 nouveaux scanners enregistrés dans `AllScannersModule` et exécutables standalone + en template : `asnmap`, `cloud-enum`, `github-subdomains`, `trufflehog`, `securitytrails`.
2. Chaque scanner: lib `libs/scanners/<tool>` (ScannerDefinition + module auto-register), Dockerfile sous `docker/`, parser sous `libs/parsers/<tool>` enregistré dans le `ParserRegistry`, tests unitaires (build cmd + parser).
3. Deltas Prisma + migration appliqués: `OrgMetadataKind += CLOUD_BUCKET` ; `ApiProvider += GITHUB, SECURITYTRAILS`.
4. Credentials GITHUB / SECURITYTRAILS gérables via le coffre chiffré existant (mutation `setApiCredential`, panel UID « API keys ») ; injectés par le scan-worker via le mécanisme `requiresCredential`/`credentialEnvVar` **inchangé**.
5. Template `osint-passive-deep` qui enchaîne les 5 outils ; les étapes à clé échouent proprement (job FAILED, message clair) si la clé manque, sans bloquer les autres étapes.
6. Les nouvelles données s'affichent dans les onglets existants (Assets/sous-domaines, OSINT/OrgMetadata, Findings) **sans changement front**.
7. CI verte: lint + type-check + tests sur les nouveaux projets ; e2e recon opt-in derrière `RECON_PASSIVE_V2_E2E` (réseau + clés requis).

**Non-buts (hors-scope 8.1, évolutions futures):**
- Transformer les plages ASN/CIDR en **cibles de scans actifs** (le gain de l'Approche B) — sous-phase dédiée.
- Modèles first-class `AsnRange` / `CloudBucket` + UI dédiée par type.
- Sources passives additionnelles (VirusTotal, Netlas, etc.) — extensible plus tard via le même patron.
- Énumération cloud authentifiée (clés AWS/Azure/GCP) — 8.1 reste non authentifié côté cloud.

---

## 2. Les 5 scanners

Patron commun (cf. `libs/scanners/shodan` comme référence): `ScannerDefinition<TInput>` avec `name`, `displayName`, `category`, `inputSchema` (zod), `docker` (image custom `autoscanner/<tool>:1.0`, network `bridge`, limites mém/cpu, timeout), `build(input, target, ctx)` retournant `cmd[]` (+ `env`), `outputs[]` (format + capture + `parser`), `produces[]`, et optionnellement `requiresCredential`/`credentialEnvVar`. Le `target` interpolé dans un shell DOIT être quoté (`shellQuoteSingle`, cf. shodan) — anti-injection.

| # | Scanner | `category` | Clé | Entité(s) | Notes |
|---|---|---|---|---|---|
| 1 | **asnmap** | `PASSIVE_RECON`, `NETWORK_DISCOVERY` | — | `OrgMetadata` kind `ASN` (données: `{asn, org, cidrs[]}`) | Image `projectdiscovery/asnmap` ; input domaine/org/IP ; sortie JSONL. ASN/NETBLOCK existent déjà dans l'enum. |
| 2 | **cloud-enum** | `CLOUD`, `OSINT` | — | `OrgMetadata` kind `CLOUD_BUCKET` (par bucket) + `Finding` (sévérité selon accessibilité: LOW si existe, MEDIUM/HIGH si listable/public) | `cloud_enum` (ou `s3scanner`) ; input mot-clé/domaine ; checks S3/Azure/GCS. Touche les endpoints cloud, **pas la cible** → passif. |
| 3 | **github-subdomains** | `OSINT`, `SUBDOMAIN_ENUM` | **GITHUB** | `Subdomain` | `gwen001/github-subdomains` ; cherche les sous-domaines du domaine dans le code public GitHub. `GITHUB_TOKEN`. |
| 4 | **trufflehog** | `OSINT`, `VULN_SCAN` | **GITHUB** | `Finding` (secret vérifié → CRITICAL ; non vérifié → HIGH/MEDIUM) | `trufflesecurity/trufflehog` mode `github` sur l'org/les repos liés au domaine. `GITHUB_TOKEN`. |
| 5 | **securitytrails** | `PASSIVE_RECON`, `DNS` | **SECURITYTRAILS** | `Subdomain` + `DnsRecord` (historique) | Appel API SecurityTrails (subdomains + history). `SECURITYTRAILS_API_KEY`. Complète crt.sh avec du DNS passif riche. |

**Mapping → entités existantes** (persisters réutilisés dans parser-worker): `Subdomain` → `SubdomainIpPersister`/`AssetPersister` ; `DnsRecord` → `DnsRecordPersister` ; `Finding` → `FindingPersister` (avec `findingDedupHash`) ; `OrgMetadata` → `OrgMetadataPersister` (clé d'unicité `(engagementId, kind, source)` — `source` = nom du scanner). Aucun nouveau persister requis ; au plus une extension mineure si un persister ne couvre pas exactement la forme produite.

---

## 3. Architecture & flux

```
operator → runTemplate(osint-passive-deep, target)
  → orchestrator-worker enchaîne les steps:
      asnmap(target) ─────────────→ ScanJob → raw(JSONL) → S3
      cloud-enum(target) ─────────→ ScanJob → raw(JSON)  → S3
      github-subdomains(target) ──→ ScanJob [GITHUB] → raw(text) → S3
      trufflehog(target) ─────────→ ScanJob [GITHUB] → raw(JSON) → S3
      securitytrails(target) ─────→ ScanJob [SECURITYTRAILS] → raw(JSON) → S3
  → chaque ScanJob terminal enqueue parse-jobs
  → parser-worker: parser dédié → NormalizedOutput → persisters → Subdomain/DnsRecord/Finding/OrgMetadata
  → correlation + risk-score (pipeline existant, inchangé)
```

- **Exécution & sandbox:** scan-worker existant, aucun changement de logique. Chaque scanner tourne dans son conteneur (`network: bridge` — ces outils ont besoin du réseau sortant vers les APIs tierces ; `readonlyRootfs` quand l'outil le permet ; `memoryLimitMb`/`cpuQuota`/`defaultTimeoutMs` par outil).
- **Credentials:** le scan-worker résout déjà `requiresCredential` de façon générique (`apiCredential.findUnique({ ownerId, provider })`, déchiffrement `SecretBox`, injection dans `credentialEnvVar`). Ajouter `GITHUB`/`SECURITYTRAILS` à l'enum `ApiProvider` suffit — **aucun code worker à modifier**. Clé absente ⇒ job FAILED avec message explicite (comportement actuel shodan/censys), les autres steps continuent.
- **Parsers:** un parser par outil sous `libs/parsers/src/<tool>`, enregistré dans `ParserRegistry` (cf. parsers existants `shodan-json`, `crtsh-json`…). Transforme la sortie brute en `NormalizedOutput` (subdomains[], dnsRecords[], findings[], orgMetadata[]).

---

## 4. Deltas de schéma (Prisma) + migration

```prisma
enum OrgMetadataKind {
  WHOIS
  ASN
  ORG
  NETBLOCK
  CLOUD_BUCKET   // NEW (8.1)
  OTHER
}

enum ApiProvider {
  SHODAN
  CENSYS
  GITHUB          // NEW (8.1)
  SECURITYTRAILS  // NEW (8.1)
}
```

- Une migration `ALTER TYPE ... ADD VALUE` pour les 3 valeurs (les enums Postgres supportent l'ajout de valeurs ; hand-write la migration, pas de DB locale).
- L'enum GraphQL `ApiProvider` (code-first) se régénère et **surface automatiquement** les nouveaux providers dans le panel UI « API keys » (dropdown `setApiCredential`). Pas de changement front.

---

## 5. Validation & tests

- **Unitaire (par scanner):** `build()` construit la bonne `cmd` (et quote le target → test d'injection type `a.com; rm -rf /`) ; le parser transforme une fixture de sortie réelle en entités attendues (1 fixture happy + 1 cas vide/dégénéré par outil).
- **Persisters:** réutilisés ; si extension nécessaire, test sur la nouvelle forme.
- **Credential-missing:** test (au niveau scan-worker ou doc) que clé absente ⇒ FAILED clair (comportement déjà couvert génériquement).
- **e2e opt-in** `RECON_PASSIVE_V2_E2E=1` (réseau + clés): runTemplate `osint-passive-deep` sur un domaine de test → vérifier ≥1 OrgMetadata ASN, ≥1 sous-domaine, etc. Gated/skip par défaut (comme les e2e existants).
- **CI:** `nx run-many -t lint,type-check,test -p` sur les 5 libs scanners + 5 parsers + database + api-gateway/parser-worker touchés. **Inclure `nx build`** des apps (leçon Phase 5: les value-imports cassent le build webpack sans casser tsc/jest).

---

## 6. Sécurité & boundaries

- **Passif:** aucun de ces outils n'envoie de trafic intrusif vers la cible. asnmap/securitytrails/github interrogent des APIs tierces ; cloud-enum interroge les endpoints des providers cloud ; trufflehog interroge GitHub. (À documenter dans la description de chaque scanner.)
- **Anti-injection shell:** tout `target` interpolé est quoté (`shellQuoteSingle`).
- **Secrets:** clés GitHub/SecurityTrails stockées chiffrées (AES-GCM `SecretBox`, `MASTER_ENCRYPTION_KEY`) via le coffre `api-credentials` existant ; jamais loggées ni retournées en clair ; injectées uniquement dans l'env du conteneur du scanner.
- **Sandbox Docker:** limites mémoire/CPU/timeout par scanner ; `network: bridge` (sortant nécessaire) ; `readonlyRootfs` activé sauf si l'outil écrit (ex. config).
- **Rate-limits / coûts API:** les APIs tierces (GitHub, SecurityTrails) ont des quotas ; timeouts par scanner + `|| true` pour ne pas faire échouer sur « zéro résultat ». (Backoff/quota avancé = évolution.)

---

## 7. Découpage indicatif (pour le plan)

T1 deltas Prisma + migration ; T2 lib `asnmap` + parser + tests ; T3 lib `cloud-enum` + parser + tests ; T4 providers GITHUB/SECURITYTRAILS (enum + vérif UI surface) ; T5 lib `github-subdomains` + parser ; T6 lib `trufflehog` + parser ; T7 lib `securitytrails` + parser ; T8 Dockerfiles ; T9 template `osint-passive-deep` + enregistrement `AllScannersModule` ; T10 e2e opt-in + validation (lint/type-check/test/**build**).

(Le plan détaillera chaque tâche en TDD bite-sized.)

---

## 8. Auto-revue

- **Couverture spec:** 4 thèmes choisis → 5 scanners (§2) ; zéro nouveau modèle, 3 valeurs d'enum (§4) ; mapping entités existantes (§2) ; credentials via mécanisme existant (§3) ; tests + e2e (§5). ✅
- **Cohérence:** OrgMetadataKind a déjà ASN/NETBLOCK (asnmap OK) ; seul CLOUD_BUCKET ajouté. ApiProvider générique côté worker ⇒ pas de code worker. ✅
- **Ambiguïté levée:** « DNS passif » = scanner `securitytrails` dédié (et non une simple option subfinder), pour l'historique/reverse plus riche. Les « fuites GitHub » = 2 scanners distincts (subdomains + secrets). 8.1 = 5 scanners d'un bloc (choix utilisateur).
- **Scope:** focalisé, un seul plan d'implémentation. Les axes 8.2–8.4 restent des specs séparées.
