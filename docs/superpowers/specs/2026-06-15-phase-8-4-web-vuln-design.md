# Phase 8.4 — Active Web-Vuln Scanners — Design

> **Date:** 2026-06-15
> **Statut:** Spec V1 — validée en brainstorming (axe « scanners de vulnérabilités web actives »). En attente de revue avant `writing-plans`.
> **Parent:** Phase 8. 8.1 (passive), 8.2 (enrichissement), 8.2b (screenshots), 8.3 (services/protocoles) livrées. **8.4 = scanners de vulnérabilités web actives.** Retour au patron simple « ajout de scanners » (pas de changement transverse).
> **Précédent de référence:** patron Phase 8.3 (`libs/scanners/snmp-recon`, parsers tolérants, template `service-recon`) et scanner `nuclei` existant (catégorie `VULN_SCAN`, `produces: ['Finding']`).

---

## 1. Objectif et critère « done »

**Objectif:** détecter des **vulnérabilités web injectables** au-delà des signatures `nuclei` — XSS, injection SQL, injection de commande OS — en sondant activement les URLs/formulaires des cibles web découvertes.

**Approche (A — réutilisation maximale):** 3 scanners `ScannerDefinition` Docker-sandboxés ; sortie mappée sur l'entité existante `Finding` (comme `nuclei`). **Aucun changement Prisma** (`ProducedEntity` n'a pas de type `Vulnerability` — l'unité reste `Finding`). `xss-scan` **réutilise une image publique** (`ghcr.io/hahwul/dalfox`) ⇒ 2 Dockerfiles seulement.

**Critère « done » 8.4:**
1. 3 scanners enregistrés dans `AllScannersModule`, runnable standalone + en template : `xss-scan`, `sqli-scan`, `cmdi-scan`.
2. Chaque scanner: lib `libs/scanners/<tool>`, parser dédié sous `libs/parsers/src/<tool>-<fmt>` enregistré dans `ParsersModule`, tests unitaires (build + parser, ≥1 happy + 1 vide/dégénéré).
3. Chaque scanner expose un input `level` (`detect` par défaut | `aggressive`) — **défaut sûr** (détection/PoC, pas d'exfiltration ni de shell).
4. Dockerfiles `sqli-scan`, `cmdi-scan` ; `xss-scan` réutilise `ghcr.io/hahwul/dalfox`.
5. Template `vuln-active` qui enchaîne les 3.
6. Findings dans l'onglet existant **sans changement front**.
7. CI verte incl. `nx build`.

**Non-buts (hors-scope 8.4):**
- **OpenVAS / vuln réseau par service-CVE** — daemon long + sync de feed = infra lourde → phase 8.5 séparée.
- **Exploitation par défaut** — pas de `sqlmap --dump`, pas de shell `commix`, pas de blind-XSS callback en mode `detect`. `aggressive` reste opt-in opérateur explicite et borné.
- **Fan-out par-endpoint/par-paramètre** — 8.4 cible une URL racine ; chaque outil crawl/forms lui-même. Le fan-out sur les `Endpoint` découverts est une amélioration future.
- **Scan authentifié** (cookies/headers de session) — phase future.
- **XSStrike** — redondant avec dalfox pour le XSS (YAGNI) → écarté.

---

## 2. Les 3 scanners

Patron commun (réf. `libs/scanners/snmp-recon`). `target` interpolé en shell → quoté (`shellQuoteSingle`). Ces scanners sondent activement des URLs web — **dans le scope d'un engagement** (outils standards de pentest autorisé).

| # | Scanner | Outil / image | Classe de vuln | Finding (sévérité) | Sortie |
|---|---------|---------------|----------------|--------------------|--------|
| 1 | **xss-scan** | dalfox (`ghcr.io/hahwul/dalfox` — **réutilise** image publique) | XSS reflété / DOM | `HIGH` sur PoC confirmé | JSON (`-o`, `--format json`) |
| 2 | **sqli-scan** | sqlmap (image custom `autoscanner/sqli-scan:1.0`) | Injection SQL | `HIGH`/`CRITICAL` | JSON (`--results-file` / parse stdout) |
| 3 | **cmdi-scan** | commix (image custom `autoscanner/cmdi-scan:1.0`) | Injection de commande OS | `CRITICAL` | TEXTE |

**Input commun `level`** (Zod) : `z.enum(['detect','aggressive']).default('detect')`.
- `detect` (défaut) : profondeur basse, **pas** d'exfiltration ni de shell.
  - dalfox : scan standard sans blind-XSS callback (`--no-color --format json`, pas de `-b`).
  - sqlmap : `--batch --level 1 --risk 1 --technique=BEU` (pas de `--dump`, pas de `--os-shell`).
  - commix : détection seule (pas de `--os-cmd`/shell interactif).
- `aggressive` (opt-in opérateur) : profondeur accrue **bornée** (sqlmap `--level 3 --risk 2` ; dalfox mining/DOM élargi) — toujours **sans** exfiltration massive ni shell, pour rester dans « découverte/PoC ». (Le vrai dump/shell reste hors-scope 8.4.)

**Mapping → persisters existants** (parser-worker, inchangés): `Finding`→`FindingPersister`. Types `NormalizedFinding = { scannerName, title, severity, location?, description? }` déjà définis. Sévérité ∈ `LOW|MEDIUM|HIGH|CRITICAL` (comme `nuclei-json`).

---

## 3. Architecture & flux

```
runTemplate(vuln-active, target) → orchestrator enchaîne:
  xss-scan(url)   → ScanJob → JSON → dalfox-json  → Finding (XSS)
  sqli-scan(url)  → ScanJob → JSON → sqlmap-json  → Finding (SQLi)
  cmdi-scan(url)  → ScanJob → TEXT → commix-text  → Finding (CmdI)
  → parser-worker → FindingPersister → Finding
  → corrélation + risk-score (pipeline existant, inchangé)
```

- **Exécution:** scan-worker existant, aucun changement (sortie stdout JSON/texte, pas d'artefact binaire).
- **Pas de credential** pour les 3.
- **Parsers:** un par outil, tolérant (`emptyNormalizedOutput()` sur entrée vide/illisible). `dalfox-json`/`sqlmap-json` parsent du JSON ; `commix-text` parse du texte ligne-à-ligne.
- **Targeting:** `{ kind: 'context', path: 'target' }` (précédent 8.3) — une URL racine ; chaque outil découvre paramètres/formulaires.

---

## 4. Validation & tests
- **Unitaire (par scanner):** `build()` construit la bonne cmd (URL quotée ; test injection shell ; flags `detect` vs `aggressive`) ; parser transforme une fixture **réelle** en `Finding` attendu (1 happy = vuln détectée + 1 vide/dégénéré → 0 finding).
- **Outils version-dépendants** (sqlmap/commix/dalfox) : **vérifier la vraie sortie à l'implémentation et ajuster fixture/parser** ; garder les parsers tolérants (jamais `throw` → `emptyNormalizedOutput()`).
- **e2e opt-in** `VULN_ACTIVE_E2E=1` : `runTemplate('vuln-active', url)` sur une cible de test vulnérable (ex. juice-shop/DVWA local) → vérifier que le run termine `COMPLETED` (assertions souples : log des compteurs de Findings ; pas d'assertion dure par-scanner car dépend de la cible).
- **CI:** lint/type-check/test sur les 3 libs + 3 parsers + `scanners-all`/`templates`/`api-gateway`/`parser-worker` ; **+ `nx build`**.

## 5. Sécurité & boundaries
- **Actif/intrusif:** ces outils injectent des payloads — **uniquement dans le scope d'un engagement** (même posture que `nuclei`, `ffuf`, `api-discovery`). Outils dual-use standards de pentest autorisé.
- **Défaut sûr:** `level=detect` ; pas d'exfiltration de données, pas de shell OS, pas de callback blind-XSS par défaut. `aggressive` = opt-in opérateur explicite et borné.
- **Anti-injection shell:** `target` quoté (`shellQuoteSingle`).
- **Sandbox Docker:** limites mém/CPU/timeout généreux (ces scans sont longs : timeout ≥ 600s) ; `network: bridge` ; `readonlyRootfs` quand l'outil le permet (sqlmap écrit un dossier de session → `tmpfs`/scratch au besoin).
- **Bruit/charge:** plafonner profondeur + timeout (sqlmap `--level/--risk`, dalfox concurrency) — pas de fuzzing massif non borné.

## 6. Découpage indicatif (plan)
T1 `xss-scan` (réutilise image dalfox) + parser `dalfox-json` ; T2 `sqli-scan` + parser `sqlmap-json` ; T3 `cmdi-scan` + parser `commix-text` ; T4 Dockerfiles (sqli, cmdi) ; T5 register + template `vuln-active` ; T6 e2e (opt-in) + validation.

## 7. Auto-revue
- **Couverture:** 3 classes d'injection distinctes (XSS / SQLi / CmdI) → 3 scanners ; zéro changement Prisma (entité `Finding` existante) ; xss réutilise l'image dalfox publique (2 Dockerfiles). ✅
- **Cohérence:** parsers dédiés tolérants ; noms de parsers (`dalfox-json`, `sqlmap-json`, `commix-text`) = `outputs[].parser` de chaque scanner ; champs `NormalizedFinding` conformes à `types.ts` ; sévérités ∈ enum existant. Pas de credential.
- **Ambiguïté levée:** XSStrike écarté (redondant dalfox) ; targeting URL racine (pas de fan-out) ; défaut `detect` sûr, `aggressive` opt-in borné ; OpenVAS → 8.5 ; pas d'exfiltration/shell/auth.
- **Scope:** focalisé, un seul plan. 8.5 (OpenVAS / vuln réseau) reste une spec séparée.
