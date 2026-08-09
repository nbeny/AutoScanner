# Design — Couverture d'options Kali (dataset du catalogue d'outils)

Date : 2026-08-09
Statut : approuvé (brainstorming), prêt pour le plan d'implémentation.

## Contexte & problème

Le catalogue d'outils Kali (`data/kali-tools.json`, 88 outils, alimenté par le pipeline
`tools/kali-catalog/`) sert la doc + le runner (`kali-tool-worker`) et le panneau
`KaliToolDocPanel`. Audit (2026-08-09) :

- **88/88 binaires du dataset présents** dans l'image `autoscanner/kali-toolbox:1.0` — les
  commandes se lancent bien (validé en live via `runKaliTool` → COMPLETED).
- **Mais la couverture d'options est partielle** : `parseConfidence` = **high 41 / low 4 / none 43**.
  Les 43 « zéro option » se décomposent en :
  - **A — 5 échecs de capture** : le `--help` a renvoyé un message d'erreur, pas l'aide.
    Ex. `nmap` → `helpTextRaw = "/usr/bin/nmap: exec: /usr/lib/nmap/nmap: Operation not permitted"`.
    Cause : la capture tourne avec les capabilities docker par défaut ; un binaire **setcap**
    ne peut pas être `exec` (EPERM). Concernés : `gpg2john, hccap2john, nmap, racf2john, responder-DHCP_Auto`.
  - **B — 35 ont une vraie aide mais 0 flag parsé** : 3 ont des flags **collés à la marge**
    (`burpsuite, john, wpapcap2john`) que le regex ne matche pas (il exige 1 à 10 espaces
    d'indentation) ; les ~32 autres sont surtout des `usage: outil <fichier>` minuscules
    réellement sans options, plus quelques formats exotiques (`hydra, dpl4hydra, responder-*`).
  - **D — 3 sans rien** : `dmg2john, raw2dyna, vncpcap2john` (convertisseurs sans flags).

Aucun test ne vérifie l'alignement **dataset ↔ image**.

### Décisions de conception (brainstorming)

- Objectif : **couverture large des 88**.
- Approche : **recapture complète (fix caps) + parser `--help` durci + parsing des pages man**
  comme 2e source d'options.
- Fiabilité : ajouter un **test dataset↔image** et un **rapport de couverture** mesurable.

## Briques

### 1. Pipeline de capture (`tools/kali-catalog/`)

**`Dockerfile.kali-catalog`**
- Après l'install de `${KALI_META}`, **stripper les file-capabilities** de tous les binaires
  pour que `--help` s'exécute (EPERM levé). Étape idempotente, best-effort :
  ```dockerfile
  RUN set -eux; for f in $(getcap -r /usr/bin /usr/sbin /usr/lib 2>/dev/null | cut -d' ' -f1); do setcap -r "$f" 2>/dev/null || true; done
  ```
  (`getcap`/`setcap` viennent de `libcap2-bin`, l'ajouter à l'install si absent.)
- Ajouter `util-linux` (fournit `col`) pour rendre le man en texte brut.
- `--network none` conservé au runtime ; le strip est au **build** de l'image jetable de capture.

**`capture.sh`**
- Capturer aussi le **texte man** en plus de `helpTextRaw` :
  ```sh
  man_text="$(timeout "${HELP_TIMEOUT}" man "$bin" 2>/dev/null | col -bx | head -c "${HELP_MAX_BYTES}")"
  ```
  Émettre `manTextRaw` (null si vide) dans le JSON RawCapture, à côté de `helpTextRaw` et `manAvailable`.
- Garder timeout, stdin fermé, cap d'octets, `EXCLUDE_RE`.

### 2. Parsers (`apps/api-gateway/src/app/tools/kali/`)

**`parse-help.ts` durci**
- `FLAG_RE` : passer de `\s{1,10}` à `\s{0,10}` pour accepter les flags **collés à la marge**,
  AVEC garde anti-prose : ne retenir la ligne que si (a) un gap de 2+ espaces sépare le flag
  d'une description, OU (b) la ligne suivante est une description indentée — et rejeter les lignes
  ressemblant à une phrase (le token flag doit être immédiatement suivi d'espace/`=`/`[`/`,`/fin).
- Arg-hints collés : reconnaître `--opt=VALUE`, `--opt[=VALUE]`, `--opt <VALUE>`.
- Alias multiples : `-p, --ports <range>` → flag principal + arg-hint.

**`parse-man.ts` (NOUVEAU)**
- Parser la section OPTIONS/DESCRIPTION du **texte man rendu** (`manTextRaw`).
- Format `.TP` rendu : une (ou plusieurs) ligne(s) de flags peu indentées, puis un bloc de
  description plus indenté. Reconnaît alias séparés par virgules et placeholders (`<...>`, `[...]`, ALLCAPS).
- Renvoie `KaliToolOption[]` + une `confidence`, même contrat que `parse-help.ts`.

**Fusion / précédence** (`normalize.ts` / `generate-transform.ts`)
- Par outil : parser `helpTextRaw` d'abord. Si `none`/`low`, parser `manTextRaw` et **garder le
  résultat le plus riche** (plus d'options, sinon meilleure confidence).
- Nouveau champ record **`optionsSource: 'help' | 'man' | 'none'`**. `parseConfidence` recalculé
  sur la source retenue.

### 3. Modèle de données (`types.ts` + DTOs)

- `RawCapture` : `+ manTextRaw?: string`.
- `KaliTool` (record + `KaliToolDetailObject`) : `+ optionsSource: 'help'|'man'|'none'`, `+ manTextRaw?: string`.
- `KaliToolSummaryObject` : inchangé (garde `hasHelp`, `optionCount`) ; on pourra ajouter
  `optionsSource` au résumé pour le filtrage/affichage.

### 4. Régénération du dataset

- Relancer **`pnpm kali:catalog`** (build image capture + `docker run --network none` + `generate.ts`)
  → régénère `data/kali-tools.json` (Kali courant, options man incluses). Committé.
- Le `kaliRelease` passe à la date courante ; diff volumineux attendu (les 88 records).

### 5. Fiabilité & mesure

- **Test dataset↔image** (`apps/api-gateway/src/app/tools/kali/__tests__/`) : chaque binaire de
  `data/kali-tools.json` doit exister dans `autoscanner/kali-toolbox:1.0`. Implémenté comme test
  d'intégration gardé (skip si l'image absente / var d'env `KALI_IMAGE_CHECK=1`), exécutant un
  seul conteneur `command -v` sur la liste. Empêche la dérive dataset/image.
- **Tests unitaires parsers** avec fixtures réelles (extraits `--help` et `man` de nmap, john,
  hydra, aircrack-ng) → vérifient le nb d'options et quelques flags précis.
- **Script de rapport de couverture** (`tools/kali-catalog/coverage-report.ts`) : imprime
  la distribution `parseConfidence` + `optionsSource` + liste des « none » restants. Sert de
  mesure avant/après et de garde de non-régression douce.

### Frontend (léger)

- `KaliToolDocPanel` : badge de **source** des options (`man`/`help`) et **texte man** en
  section repliable quand `manTextRaw` est présent. Query GraphQL `kaliTool` étendue avec
  `optionsSource` (+ `manTextRaw`).

## Ordre d'implémentation

1. **Modèle + parsers** : `types.ts` (champs), `parse-man.ts`, durcir `parse-help.ts`, fusion
   dans `normalize.ts`/`generate-transform.ts` — pur code, **TDD sur fixtures**, sans recapture.
2. **Pipeline de capture** : `Dockerfile.kali-catalog` (strip caps + util-linux) + `capture.sh` (man).
3. **Régénération** : `pnpm kali:catalog` → nouveau `data/kali-tools.json`.
4. **Fiabilité** : test dataset↔image + script de couverture + tests parsers.
5. **API + Frontend** : exposer `optionsSource`/`manTextRaw`, afficher source + man dans le panneau.

## Réalité & hors-périmètre (YAGNI)

- Les utilitaires **réellement sans options** (`dmg2john`, convertisseurs `*2john`, `usage:` minuscules)
  restent sans flags — correct, non un échec.
- Pas de refonte du runner `kali-tool-worker` (il fonctionne ; validé en live).
- Pas de couverture des outils interactifs exclus par `EXCLUDE_RE` (msfconsole, shells…).
- La recapture dépend de l'environnement opérateur (docker + réseau paquets Kali) ; les briques 1
  (parsers) et 4-5 (tests/mesure) sont testables **indépendamment** de la recapture.

## Fichiers clés touchés (indicatif)

- `tools/kali-catalog/{Dockerfile.kali-catalog,capture.sh,coverage-report.ts,README.md}`
- `apps/api-gateway/src/app/tools/kali/{parse-help.ts,parse-man.ts,normalize.ts,generate-transform.ts,types.ts}`
- `apps/api-gateway/src/app/tools/kali/__tests__/{parse-help.spec.ts,parse-man.spec.ts,dataset-image.spec.ts}`
- `apps/api-gateway/src/app/tools/dto/kali-tool.object.ts`, `tools.resolver.ts`
- `apps/frontend/src/features/scans/kali-tool-doc-panel.tsx`, `apps/frontend/src/lib/graphql/queries.ts`
- `data/kali-tools.json` (régénéré)
