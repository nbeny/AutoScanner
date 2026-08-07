# Kali tool catalog — SP1 : acquisition Docker-first + dataset + query

**Date:** 2026-08-07
**Status:** Draft (pending user review)

## Program context

Objectif global (validé) : documenter les outils Kali (aide `-h`/man, liens, descriptions),
proposer des **sélecteurs + explications par option**, et permettre de **lancer les commandes
facilement « à la Exegol »** dans la page web. Décidé « les deux » : enrichir les 120 scanners
existants **et** ajouter un runner libre. Découpé en 3 sous-projets, chacun avec son cycle
spec → plan → implémentation :

- **SP1 (ce spec) — Fondation : acquisition de doc + dataset + query.** Source primaire =
  **introspection d'un conteneur Kali** (« Docker d'abord »). Couverture visée = **tout Kali (600+)**.
- **SP2 — Enrichir les 120 formulaires** (`scanner-options-form`) avec la doc Kali (explication +
  lien + aide par option), via le cross-link `kaliToolRef`.
- **SP3 — Runner libre « Exegol »** : conteneur Kali, command-builder avec presets sélectionnables,
  exécution + streaming.

SP1 ne livre **aucune UI** : c'est la brique de données consommée par SP2 et SP3.

## Problem

Le frontend a déjà un catalogue live des 120 scanners et des formulaires d'options dérivés des
schémas Zod (`describeScannerInput` → query `scannerCatalog`, cf.
`2026-08-06-scanner-catalog-forms-design.md`). Mais l'aide par champ est clairsemée (best-effort
`.describe()`), et il n'existe aucune documentation des outils Kali au-delà des 120 scanners.
On veut une source de doc riche (description, liens, aide `-h`/man, options expliquées) couvrant
l'ensemble des outils Kali, pour alimenter l'enrichissement des forms (SP2) et le runner (SP3).

## Goals

- Produire un **dataset normalisé versionné** (`data/kali-tools.json`) décrivant les outils Kali :
  package, binaires, description, homepage, catégories, texte d'aide brut, options best-effort.
- Générer ce dataset **hors-ligne** par introspection d'un conteneur Kali (self-contained : aucune
  dépendance à kali.org pour SP1).
- Exposer le dataset via **GraphQL** (query légère + query détail) derrière le guard auth.
- **Cross-linker** les 120 scanners à leur outil Kali sous-jacent (`kaliToolRef`) sans changer leur
  source d'options autoritaire (les champs Zod).

## Non-goals (YAGNI)

- Pas de scraping kali.org dans SP1 (l'introspection Docker est self-contained ; kali.org reste un
  enrichissement possible ultérieur — man pages / trous).
- Pas de parsing d'options parfait pour 600 outils : best-effort + `helpTextRaw` toujours conservé.
- Pas d'UI (c'est SP2/SP3).
- Pas de régénération runtime : le dataset est un artefact de build commité.
- Pas de `kali-linux-everything` par défaut (GUI/bloat) — voir « knob image ».

## Design

### 1. Architecture & flux (génération offline)

```
[Conteneur Kali + métapackages tools]         (généré/pull uniquement à la génération)
      │  introspection : dpkg -L / apt-cache show / <bin> --help|-h|help / man
      ▼
[générateur Node]  →  data/kali-tools.json    (dataset normalisé, commité)
      │
      ▼
[query GraphQL kaliTools / kaliTool]  →  consommé par SP2 (forms) & SP3 (runner)
```

L'image Kali n'est nécessaire **qu'à la génération**. Le runtime ne fait **aucune** exécution Kali :
il lit le JSON commité. Régénération = ré-exécuter le job (nouvelle release Kali).

**Knob image** : défaut = base `kali-rolling` + métapackage `kali-linux-large` (l'essentiel des
outils offensifs, sans desktop). `kali-linux-everything` possible via variable d'env pour la
couverture maximale, au prix d'une image de plusieurs dizaines de Go.

### 2. Le générateur d'introspection

Localisation : `tools/kali-catalog/` (script Node exécuté **dans** le conteneur Kali, + un
`Dockerfile.kali-catalog` + un wrapper `pnpm kali:catalog`).

Étapes, dans le conteneur :

1. Énumère les packages via les métapackages `kali-tools-*` (ou `dpkg-query -W`), en excluant
   libs/desktop (filtre par section / liste d'exclusion).
2. Pour chaque package : `apt-cache show <pkg>` → `Description`, `Homepage`, `Section` ; les
   métapackages `kali-tools-<cat>` donnent la **catégorie**.
3. `dpkg -L <pkg>` → binaires réels dans `/usr/bin`, `/usr/sbin` (filtre exécutables).
4. Pour chaque binaire, capture d'aide dans l'ordre : `<bin> --help`, `<bin> -h`, `<bin> help`,
   puis `man <bin>` (via `man --pager=cat`) en repli. Premier retour non-vide gagne.
5. Normalise et écrit un enregistrement (voir §4). Émet un **résumé de couverture** (binaires avec
   aide / total).

**Garde-fous d'exécution (obligatoires)** — c'est la partie risquée (exécuter l'aide de 600+ binaires
inconnus) :

- Conteneur **sans réseau** (`--network none`) et **jetable**.
- **Timeout strict par invocation** (défaut 5 s, `timeout(1)`), **cap de taille** de sortie (ex. 64 Ko).
- Entrée fermée (`</dev/null`) pour éviter les prompts interactifs.
- Liste d'**exclusion** de binaires connus pour hang / effets de bord (ex. shells, daemons, `msfconsole`).
- Root accepté (certains outils l'exigent) : conteneur isolé et jetable.

### 3. Couche GraphQL

Le dataset est chargé **au boot** de l'API (asset statique, pas de DB), derrière le guard auth
standard. Deux queries pour ne pas envoyer 600 aides d'un coup :

- `kaliTools: [KaliToolSummary!]!` — léger : `binary`, `package`, `displayName`, `description`,
  `categories`, `hasHelp`, `optionCount`.
- `kaliTool(binary: String!): KaliToolDetail` — lourd : + `helpTextRaw`, `options[]`, `homepage`,
  `manAvailable`, `kaliRelease`, `capturedAt`.

Cross-link scanners : `ScannerCatalogEntry` (query `scannerCatalog` existante) gagne un champ
optionnel **`kaliToolRef: String`** = le nom du binaire Kali sous-jacent, dérivé du mapping « outil
sous-jacent » de `scanner.md`. Résolveur additif ; le contrat existant ne change pas.

### 4. Modèle de données (`data/kali-tools.json`)

Un tableau d'enregistrements :

```jsonc
{
  "package": "nmap",
  "binary": "nmap",
  "displayName": "nmap",
  "description": "The Network Mapper - a security scanner",
  "homepage": "https://nmap.org",
  "categories": ["information-gathering"],   // du métapackage kali-tools-<cat>
  "helpTextRaw": "Nmap 7.9x ( https://nmap.org )\nUsage: nmap [Scan Type(s)] ...",
  "options": [                                // best-effort (§5)
    { "flag": "-sV", "argHint": null, "description": "Probe open ports to determine service/version" },
    { "flag": "-p", "argHint": "<port ranges>", "description": "Only scan specified ports" }
  ],
  "parseConfidence": "high",                  // high | low | none
  "manAvailable": true,
  "source": "kali-docker",
  "kaliRelease": "2026.x",
  "capturedAt": "2026-08-07T..."
}
```

`helpTextRaw` est **toujours** présent quand une aide a été capturée (source de vérité affichable).
`options` peut être vide (`parseConfidence: "none"`) sans invalider l'entrée.

### 5. Parseur d'options (best-effort)

Fonction pure `parseHelpOptions(helpTextRaw): { options, confidence }` :

- Détecte les blocs d'options via patterns courants : getopt (`-x, --xxx <ARG>  desc`), Go pflag
  (`--xxx string   desc`), Python argparse (`-x XARG, --xxx XARG   desc`), click.
- Extrait `flag` (short/long), `argHint`, `description` (recolle les descriptions multi-lignes
  indentées).
- `confidence` = `high` si ≥ N options bien formées, `low` si extraction partielle, `none` sinon.

**Non-goal** : exhaustivité/exactitude sur 600 outils. Le repli est toujours `helpTextRaw`.
Les 120 scanners n'utilisent **pas** ce parseur (leurs champs Zod priment).

### 6. Testing

- **`parseHelpOptions`** — unitaires sur fixtures d'aide réelles committées
  (`tools/kali-catalog/__fixtures__/`) : nmap (getopt), ffuf (pflag), un argparse, un `--help` vide,
  un man-only → options + confidence attendus.
- **Normalisation** — fonctions pures (mapping package→record, catégorisation) testées ; le
  `docker run` de génération reste un job offline (pas un test unitaire).
- **Resolver GraphQL** — `kaliTools` renvoie le dataset (chargé depuis un JSON de test),
  `kaliTool(binary)` renvoie le détail, `scannerCatalog.kaliToolRef` résout pour un scanner mappé.

### 7. Rollout & caveats

- **Additif** côté API (2 queries + 1 champ) ; aucune migration. Dataset = artefact commité.
- **Staleness** : `kaliRelease` + `capturedAt` embarqués ; regen documentée dans le README de
  `tools/kali-catalog/`. Régen périodique manuelle (ou CI planifiée en suivi).
- **Couverture** : les binaires sans aide propre → `hasHelp:false`, comptés dans le résumé de
  génération. Best-effort assumé.
- **Provenance** : aide/man dérivés des packages Kali (licences diverses) ; stockés comme doc
  factuelle, `source`/`kaliRelease` conservés pour attribution.
- **Sécurité** : voir garde-fous §2 (no-net, timeouts, caps, exclusions). La génération est une
  opération locale isolée sur une image jetable.

## Open questions (à trancher au plan)

- Taille réelle du dataset avec `helpTextRaw` pour ~600 outils (Mo ?) — si trop gros pour un seul
  JSON commité, splitter (index léger + fichiers détail) ou gzip.
- Liste d'exclusion initiale des binaires à ne pas exécuter (à établir empiriquement au 1er run).
