# Phase 8.5 — OpenVAS / Greenbone Network Vuln Scanning — Design

> **Date:** 2026-06-15
> **Statut:** Spec V1 — validée en brainstorming (axe « scan actif de vulnérabilités réseau, fait correctement »). En attente de revue avant `writing-plans`.
> **Parent:** Phase 8. 8.1–8.3 (passif/enrichissement/services), 8.4 (vuln web actives) livrées. **8.5 = scan actif de vulnérabilités réseau/host via Greenbone/OpenVAS (openvasd).** Contrairement à 8.1–8.4, ce n'est PAS un simple « ajout de scanner éphémère » : ça introduit un **service stateful permanent** (le daemon Greenbone + feed NVT) piloté par un scanner-client léger.
> **Choix produit assumé:** « le mieux, pas le plus simple » — scanner actif qui *vérifie* la vuln sur le service (≈100k+ NVTs), pas de l'inférence de version. La corrélation CPE→CVE (passive, complémentaire) est **repoussée en 8.6**.

---

## 1. Objectif et critère « done »

**Objectif:** détecter des **vulnérabilités réseau/host vérifiées** sur les services découverts (ports ouverts), via le scanner Greenbone/OpenVAS piloté par son API HTTP moderne **openvasd**, et mapper les résultats sur l'entité `Finding` existante avec CVE + sévérité CVSS.

**Approche (B — service persistant + client léger, l'architecture « propre » Greenbone):**
1. **Stack Greenbone (sous-ensemble scanner)** déployée en service(s) permanent(s) via docker-compose (`openvasd` + redis + notus + mqtt + volumes de feed NASL/Notus/SCAP). Le feed est **synchronisé** par les conteneurs de feed officiels Greenbone (pas d'image « fat » à feed figé).
2. **Sync du feed** planifié (réutilise le scheduler Phase 5, ou les conteneurs feed-sync officiels — voir §5).
3. **Scanner-client `openvas-scan`** (`ScannerDefinition`) : conteneur éphémère léger qui rejoint le **réseau docker nommé** de la stack Greenbone (`NetworkMode { name }`, déjà supporté par `docker-runner`) et pilote `openvasd` via son **API HTTP/JSON** (créer un scan sur la cible → démarrer → poller le statut → récupérer les résultats), émet le JSON de résultats en stdout.
4. **Parser `openvasd-json`** : transforme les résultats openvasd en `Finding` (CVE-taggés, sévérité dérivée du CVSS via `libs/cve/cvss-to-severity`).

**Critère « done » 8.5:**
1. Stack Greenbone scanner-subset démarrable via `docker/greenbone/docker-compose.greenbone.yml` (réseau nommé `autoscanner-greenbone`), feed monté en volume.
2. Mécanisme de **sync de feed** documenté + scriptable (cible: feed présent avant un scan ; pas de scan sur feed vide).
3. Scanner `openvas-scan` enregistré dans `AllScannersModule`, runnable standalone + en template ; pilote openvasd via HTTP ; **API-key** lue comme credential opérateur (pas en dur).
4. Parser `openvasd-json` enregistré dans `ParsersModule`, **tolérant** (`emptyNormalizedOutput()` sur vide/illisible), avec tests (1 happy avec ≥1 résultat CVE → Finding ; 1 vide/dégénéré).
5. Findings (avec CVE + CVSS→sévérité) dans l'onglet existant, corrélés sur le bon asset/service via le pipeline existant — **sans changement front**.
6. CI verte incl. `nx build`. Tests unitaires sans dépendance au daemon (client/parser mockés) ; e2e **opt-in** (`OPENVAS_E2E=1`) qui exige la stack up.

**Non-buts (hors-scope 8.5):**
- **Corrélation CPE→CVE** (déduire des CVE depuis `Service.cpe/version` déjà détectés) → **phase 8.6** (couche passive complémentaire, build sur `libs/cve`).
- **Couche de management GMP/gvmd/gsa** (tasks/targets/rapports riches, web UI Greenbone) — on pilote `openvasd` en direct ; pas de gvmd.
- **Mirror NVD complet hors-ligne** — openvasd utilise le **feed Greenbone (GCF)**, pas l'API NVD ; le mapping CVSS réutilise les données du résultat openvasd.
- **Auth scan / credentialed scan** (login SSH/SMB sur la cible pour scan authentifié) — phase future ; 8.5 = unauthenticated remote.

---

## 2. Architecture & flux

```
docker-compose.greenbone.yml  (service permanent, réseau 'autoscanner-greenbone')
  openvasd        : API HTTP REST + moteur de scan        (port interne 3000)
  redis-server    : KB de scan openvas
  notus-scanner   : checks par paquet (advisories Notus)  + mqtt broker
  feed volumes    : NASL (vulnerability-tests) + notus-data + scap-data
        ▲ feed-sync (conteneurs officiels Greenbone, planifié)

runTemplate(network-vuln, target) → scan-worker:
  openvas-scan(target) → ScanJob → conteneur éphémère 'autoscanner/openvas-scan:1.0'
        join réseau 'autoscanner-greenbone'  (NetworkMode { name })
        env: OPENVASD_URL=http://openvasd:3000, X-API-KEY=<credential opérateur>
        entrypoint (client):
          POST /scans           {target, vt selection}     → scanId
          POST /scans/{scanId}  {action: start}
          GET  /scans/{scanId}/status   (poll → done)
          GET  /scans/{scanId}/results  → JSON  (stdout)
          DELETE /scans/{scanId}                (cleanup)
  → stdout JSON → parser openvasd-json → Finding (CVE + CVSS→sévérité)
  → parser-worker → FindingPersister → corrélation + risk-score (pipeline existant)
```

- **Intégration réseau:** le client rejoint le réseau nommé de la stack (`docker-runner` supporte déjà `network: { name }`). Pas de port exposé sur l'hôte nécessaire.
- **Exécution:** scan-worker existant, **inchangé** — `openvas-scan` est un `ScannerDefinition` normal qui capture stdout. La complexité (lifecycle HTTP, polling) vit dans **l'entrypoint du conteneur client** (script), pas dans le worker.
- **Credential:** `openvas-scan.requiresCredential = 'OPENVAS'` (nouvelle valeur). La clé API openvasd est injectée par le worker via le mécanisme `apiCredential` existant (comme SHODAN/CENSYS). → petit ajout enum SDK + (potentiellement) Prisma enum `ApiProvider`.
- **Long-running:** un scan openvas peut durer 10–30 min → `defaultTimeoutMs` élevé (ex. 1_800_000) ; le polling de l'entrypoint respecte un budget interne < timeout.

---

## 3. Données & mapping

- **Résultat openvasd → `NormalizedFinding`:** chaque résultat (oid NVT, host, port, severity CVSS, refs incl. `CVE-xxxx`) → `Finding { scannerName: 'openvas-scan', title: <nom NVT>, severity: cvssToSeverity(score), location: <host:port>, description: <summary + solution>, cveId?: <première CVE des refs> }`.
- **Sévérité:** réutilise `libs/cve/cvss-to-severity` (déjà testé) — pas de table ad hoc.
- **CVE:** extraite des `refs` du résultat (regex `CVE-\d{4}-\d{4,}`), posée sur le `Finding` ; l'enrichissement NVD (CVSS détaillé) reste le job du pipeline existant si applicable.
- **Aucun nouveau modèle Prisma** pour les findings (réutilise `Finding`). Seul ajustement possible: une valeur enum `ApiProvider.OPENVAS` (credential) **si** `ApiProvider` est un enum Prisma — à vérifier à l'implémentation ; sinon credential opaque.

---

## 4. Découpage indicatif (plan)
- **T1 — Stack Greenbone:** `docker/greenbone/docker-compose.greenbone.yml` (sous-ensemble scanner : openvasd + redis + notus + mqtt + volumes feed), réseau nommé `autoscanner-greenbone`, `.env.example`, README de démarrage + sync feed. Validation: la stack démarre, `GET /health` (ou équivalent) répond, feed chargé.
- **T2 — Credential `OPENVAS`:** ajouter la valeur au `requiresCredential` du SDK (+ enum `ApiProvider` Prisma si nécessaire + migration), câblage worker (résolution de la clé), tests.
- **T3 — Client `openvas-scan` (image + entrypoint):** `docker/scanners/openvas-scan/` — image légère (curl/jq ou un petit binaire) ; entrypoint qui fait le lifecycle HTTP openvasd (create/start/poll/results/delete), shell-quote la cible, émet le JSON en stdout. Gère timeouts/erreurs (sortie tolérante).
- **T4 — `ScannerDefinition` `openvas-scan` + parser `openvasd-json`:** lib `libs/scanners/openvas-scan` (network `{ name: 'autoscanner-greenbone' }`, `requiresCredential: 'OPENVAS'`, produces `['Finding']`) ; parser tolérant `libs/parsers/src/openvasd-json` (résultats → Finding + CVE + CVSS→sévérité) ; tests unitaires (build + parser sur fixture réelle).
- **T5 — Register + template `network-vuln`:** `AllScannersModule` + builtin `network-vuln` (étape `openvas-scan`). Tests scanners-all + templates.
- **T6 — e2e opt-in + validation:** `OPENVAS_E2E=1` (exige la stack up + feed) — run `network-vuln` sur une cible de test, asserte run COMPLETED (assertions souples sur les findings). Validation CI complète + `nx build`.

> **Caveat externe (comme 8.3/8.4) :** l'API openvasd et le set exact de services Greenbone sont **version-dépendants**. Chaque tâche vérifie les endpoints/le compose réels à l'implémentation et ajuste fixture/entrypoint/parser ; le parser reste tolérant.

---

## 5. Feed sync
- Le feed Greenbone (NASL « vulnerability-tests », Notus, SCAP) est **volumineux (plusieurs Go)** et doit être présent avant tout scan.
- **Mécanisme:** conteneurs feed-sync officiels Greenbone (montent/peuplent les volumes) déclenchés (a) une fois au bootstrap de la stack, puis (b) périodiquement. La planification réutilise le **scheduler Phase 5** OU un cron/compose-profile dédié — décision figée à T1 (préférence : conteneurs feed-sync officiels + job planifié quotidien).
- **Garde-fou:** `openvas-scan` détecte un feed vide/non chargé (statut openvasd) et **échoue proprement** plutôt que de produire un faux « 0 vuln ».

## 6. Sécurité & boundaries
- **Actif/intrusif:** openvas sonde réellement les services (peut être bruyant/impactant) — **strictement dans le scope d'un engagement**. Posture cohérente avec nuclei/8.4.
- **API openvasd:** `/scans` est non sécurisé sans clé — la stack **impose une API-key** (et/ou mTLS) ; la clé est un **credential opérateur chiffré**, jamais en dur ni loggé.
- **Réseau:** le client rejoint un réseau docker dédié `autoscanner-greenbone` ; openvasd n'est pas exposé sur l'hôte.
- **Cible quotée** dans l'entrypoint client ; pas d'injection shell.
- **Ressources:** le daemon a son propre profil ; le client éphémère est borné (mém/cpu/timeout) comme les autres scanners.

## 7. Auto-revue
- **Couverture:** scan actif réseau « fait correctement » (openvasd persistant + feed frais) → 1 scanner-client + stack + feed-sync ; mapping CVE/CVSS sur `Finding` existant (réutilise `cvss-to-severity`). ✅
- **Cohérence:** le worker reste inchangé (le client encapsule le lifecycle HTTP) ; `docker-runner` supporte déjà le réseau nommé ; credential via le mécanisme `apiCredential` existant. Parser tolérant, nom `openvasd-json` = `outputs[].parser`.
- **Risques identifiés:** (a) endpoints openvasd version-dépendants → vérif à l'impl + parser tolérant ; (b) feed volumineux/lent → garde-fou « feed vide = échec propre » + sync planifié ; (c) durée de scan → timeout élevé + budget de polling.
- **Scope:** un seul plan, focalisé sur openvasd-direct. **CPE→CVE = 8.6** ; **GMP/gvmd, scan authentifié, mirror NVD = hors-scope**.
- **Ambiguïté levée:** openvasd HTTP (pas GMP) ; service persistant (pas image fat) ; CPE→CVE séparé.
