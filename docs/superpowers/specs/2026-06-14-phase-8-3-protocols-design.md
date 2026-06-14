# Phase 8.3 — Service / Protocol Scanners — Design

> **Date:** 2026-06-14
> **Statut:** Spec V1 — brainstorming (axe « nouveaux services/protocoles »). En attente de revue avant `writing-plans`.
> **Parent:** Phase 8. 8.1 (passive), 8.2 (enrichissement), 8.2b (screenshots) livrées. **8.3 = scanners de services/protocoles.** Retour au patron simple « ajout de scanners » (pas de changement transverse).
> **Précédent de référence:** patron Phase 8.1/8.2.

---

## 1. Objectif et critère « done »

**Objectif:** découvrir et caractériser des **services réseau** au-delà du web — SMTP, SNMP, SMB/Windows, API cachées — en sondant les ports standards des hosts découverts.

**Approche (A — réutilisation maximale):** 4 scanners `ScannerDefinition` Docker-sandboxés ; sortie mappée sur entités existantes (`Finding`, `Technology`, `OrgMetadata`, `Endpoint`). **Aucun changement Prisma.** `smtp-recon` **réutilise l'image nmap publique** (`instrumentisto/nmap:7.98-r2`) via le champ `scripts[]` ⇒ 3 Dockerfiles seulement.

**Critère « done » 8.3:**
1. 4 scanners enregistrés dans `AllScannersModule`, runnable standalone + en template : `smtp-recon`, `snmp-recon`, `smb-enum`, `api-discovery`.
2. Chaque scanner: lib `libs/scanners/<tool>`, parser dédié sous `libs/parsers/src/<tool>-<fmt>` enregistré dans `ParsersModule`, tests unitaires (build + parser).
3. Dockerfiles `snmp-recon`, `smb-enum`, `api-discovery` ; `smtp-recon` réutilise `instrumentisto/nmap:7.98-r2`.
4. Template `service-recon` qui enchaîne les 4.
5. Données dans les onglets existants (Findings/Technologies/OSINT-OrgMetadata/Endpoints) **sans changement front**.
6. CI verte incl. `nx build`.

**Non-buts (hors-scope 8.3):**
- Exploitation / brute-force lourd d'authentification — **découverte/info seulement** (open relay, communauté publique, session nulle, routes API). Pas de password-spraying.
- Active Directory profond (Kerberos, BloodHound), IoT/ICS — phases futures.
- UDP scan exhaustif — SNMP cible le port 161 connu.

---

## 2. Les 4 scanners

Patron commun (réf. `libs/scanners/asnmap`). `target` interpolé en shell → quoté (`shellQuoteSingle`). Ces scanners sondent des **ports de service** (actif) — dans le scope d'un engagement.

| # | Scanner | Outil / image | Entité(s) | Notes |
|---|---|---|---|---|
| 1 | **smtp-recon** | nmap `--script smtp-commands,smtp-open-relay,smtp-enum-users -p 25,465,587` (**réutilise** `instrumentisto/nmap:7.98-r2`) | `Finding` (open relay = HIGH) + `OrgMetadata` (kind `OTHER`, capabilities/users) | Sortie XML ; parser dédié `smtp-nmap-xml` lit les `<hostscript>`/`<script>` (le parser `nmap-xml` existant ne les extrait pas). |
| 2 | **snmp-recon** | onesixtyone + snmpwalk | `Finding` (communauté publique lisible = MEDIUM) + `OrgMetadata` (sysDescr/device) | Image custom. Sortie texte. Cible 161/udp. |
| 3 | **smb-enum** | enum4linux-ng | `Finding` (session nulle / accès anonyme) + `OrgMetadata` (partages/OS/users) | Image custom. Sortie texte (parser tolérant ; tenter JSON si la version le permet). Cible 445/139. |
| 4 | **api-discovery** | kiterunner (`kr scan`) | `Endpoint` (routes d'API découvertes) | Image custom (+ wordlist API embarquée). Sortie texte. Cibles web. |

**Mapping → persisters existants** (parser-worker, inchangés): `Finding`→`FindingPersister`, `Technology`→`TechnologyPersister`, `OrgMetadata`→`OrgMetadataPersister`, `Endpoint`→`EndpointPersister`. Types `NormalizedFinding`/`NormalizedOrgMetadata`/`NormalizedEndpoint` déjà définis.

---

## 3. Architecture & flux

```
runTemplate(service-recon, target) → orchestrator enchaîne:
  smtp-recon(host)    → ScanJob → XML  → smtp-nmap-xml → Finding + OrgMetadata
  snmp-recon(host)    → ScanJob → TEXT → snmp-text     → Finding + OrgMetadata
  smb-enum(host)      → ScanJob → TEXT → smb-text      → Finding + OrgMetadata
  api-discovery(host) → ScanJob → TEXT → kiterunner-text → Endpoint
  → parser-worker → persisters existants → Finding/Technology/OrgMetadata/Endpoint
  → corrélation + risk-score (pipeline existant, inchangé)
```

- **Exécution:** scan-worker existant, aucun changement (sortie stdout texte/XML, pas d'artefact binaire — contrairement à 8.2b).
- **Pas de credential** pour les 4.
- **Parsers:** un par outil, tolérant (`emptyNormalizedOutput()` sur entrée vide/illisible). `smtp-nmap-xml` réutilise `fast-xml-parser` (déjà utilisé par `nmap-xml`).

---

## 4. Validation & tests
- **Unitaire (par scanner):** `build()` construit la bonne cmd (+ ports + quote target ; test injection) ; parser transforme une fixture réelle en entités attendues (1 happy + 1 vide/dégénéré).
- **e2e opt-in** `SERVICE_RECON_E2E=1` : runTemplate `service-recon` sur un host de test → vérifier que le run termine COMPLETED (assertions souples par scanner — dépendent des services réellement ouverts sur la cible).
- **CI:** lint/type-check/test sur les 4 libs + 4 parsers + api-gateway/parser-worker/templates ; **+ `nx build`**.

## 5. Sécurité & boundaries
- **Actif:** sonde des ports de service de la cible — dans le scope de l'engagement. Découverte/info seulement (pas de brute-force d'auth).
- **Anti-injection shell:** `target` quoté.
- **Sandbox Docker:** limites mém/CPU/timeout ; `network: bridge` (SNMP UDP sortant OK).
- **api-discovery:** plafonner la wordlist / le temps (kiterunner peut être bruyant) — timeout + wordlist API ciblée, pas de fuzzing massif.
- **smb/snmp:** lecture seule (énumération anonyme) — pas d'écriture/montage.

## 6. Découpage indicatif (plan)
T1 smtp-recon (réutilise image nmap) + parser `smtp-nmap-xml` ; T2 snmp-recon + parser ; T3 smb-enum + parser ; T4 api-discovery + parser ; T5 Dockerfiles (snmp, smb, api) ; T6 register + template `service-recon` ; T7 e2e + validation.

## 7. Auto-revue
- **Couverture:** 4 thèmes → 4 scanners ; zéro changement Prisma (entités existantes) ; smtp réutilise l'image nmap (3 Dockerfiles). ✅
- **Cohérence:** parsers dédiés tolérants ; `smtp-nmap-xml` distinct du `nmap-xml` (qui n'extrait pas les scripts). Pas de credential, pas d'enum.
- **Ambiguïté levée:** SMTP via scripts NSE nmap (réutilise l'image, pas de Dockerfile) ; SMB/SNMP/API en images custom ; sortie texte tolérante (formats outils version-dépendants → vérifier à l'implémentation, parsers tolérants).
- **Scope:** focalisé, un seul plan. 8.4 (vulns) reste une spec séparée.
