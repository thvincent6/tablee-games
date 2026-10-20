import { compareVersions } from '../definition';
import { checkGameFile, summarize, type FileCheck } from './check';

// Revue d'une pull request du catalogue : on compare les jeux publiés (branche cible) à ceux de
// la pull request. Un fichier publié ne change jamais ; chaque nouveau fichier est vérifié comme
// par `games:check`.

/** Fichiers d'un dossier `games/` : chemin relatif (séparateur `/`) → texte. */
export type Catalog = ReadonlyMap<string, string>;

export type Review = {
  ok: boolean;
  /** Rapport en texte brut, pour la console. */
  lines: string[];
  /** Rapport en Markdown, pour le commentaire de la pull request. */
  markdown: string;
};

/** Repère le commentaire du rapport, pour le mettre à jour plutôt que d'en ajouter un. */
export const REPORT_MARKER = '<!-- tablee-games-check -->';

const shown = (path: string) => `games/${path}`;

/** Version suivante d'un jeu (correctif) : 1.1.0 → 1.1.1, 2.0.0-beta → 2.0.1. */
export function nextPatch(version: string): string {
  const [major, minor, patch] = version.split(/[-+]/)[0].split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

/** `skyjo/1.1.0.json` → `{ id: 'skyjo', version: '1.1.0' }` ; null hors de ce rangement. */
function placeOf(path: string): { id: string; version: string } | null {
  const match = /^([^/]+)\/([^/]+)\.json$/.exec(path);
  return match ? { id: match[1], version: match[2] } : null;
}

/** Versions publiées d'un jeu (dossier `<id>/`). */
function publishedVersions(base: Catalog, id: string): string[] {
  return [...base.keys()]
    .map(placeOf)
    .filter((place) => place?.id === id)
    .map((place) => place!.version);
}

function latest(versions: string[]): string | undefined {
  return [...versions].sort(compareVersions).at(-1);
}

/** Pourquoi un fichier publié ne peut pas changer, et quoi faire à la place. */
function publishedChange(base: Catalog, path: string, deleted: boolean): string {
  const place = placeOf(path);
  const last = place && latest(publishedVersions(base, place.id));
  const fix = last
    ? ` Remets-le tel quel et propose la correction dans une nouvelle version, par exemple \`${shown(`${place.id}/${nextPatch(last)}.json`)}\`.`
    : ' Remets-le tel quel.';
  return deleted
    ? `\`${shown(path)}\` est publié : il ne peut pas être supprimé, des parties enregistrées y renvoient.${fix}`
    : `\`${shown(path)}\` est déjà publié : un fichier publié ne change plus, les parties enregistrées pointent vers son empreinte SHA-256.${fix}`;
}

/** Vérifie un nouveau fichier : `games:check`, puis version plus récente que celles publiées. */
function checkAdded(base: Catalog, path: string, text: string): FileCheck {
  if (!path.endsWith('.json')) {
    return {
      ok: false,
      results: [],
      lines: [`✗ ${shown(path)} : seuls des fichiers .json ont leur place dans games/`],
    };
  }
  const check = checkGameFile(path, text, shown(path));
  const place = placeOf(path);
  if (!check.ok || !place) return check;
  const last = latest(publishedVersions(base, place.id));
  if (last && compareVersions(place.version, last) <= 0) {
    return {
      ok: false,
      results: check.results,
      lines: [
        `✗ ${shown(path)} : version trop ancienne`,
        `      la dernière version publiée de ${place.id} est ${last} : la nouvelle doit être plus récente (${nextPatch(last)} par exemple)`,
      ],
    };
  }
  return check;
}

/** Compare le catalogue publié (`base`) à celui de la pull request (`head`). */
export function reviewChanges(base: Catalog, head: Catalog): Review {
  const refused: string[] = [];
  for (const [path, text] of base) {
    const proposed = head.get(path);
    if (proposed === undefined) refused.push(publishedChange(base, path, true));
    else if (proposed !== text) refused.push(publishedChange(base, path, false));
  }

  const added = [...head.keys()].filter((path) => !base.has(path)).sort();
  const checks = added.map((path) => checkAdded(base, path, head.get(path)!));

  if (refused.length === 0 && checks.length === 0) {
    const line = 'Aucun fichier de jeu ajouté ou modifié : rien à vérifier.';
    return { ok: true, lines: [line], markdown: report('✅', 'rien à vérifier', [line]) };
  }

  const summary = checks.length > 0 ? summarize(checks) : null;
  const ok = refused.length === 0 && (summary?.ok ?? true);
  const lines = [
    ...refused.map((reason) => `✗ ${reason.replaceAll('`', '')}`),
    ...checks.flatMap((check) => [...check.lines, '']),
    summary?.line ?? publishedFailure(refused.length),
  ];

  const sections: string[] = [];
  if (summary) sections.push(summary.line);
  if (refused.length > 0) {
    sections.push(
      '**Fichiers déjà publiés : modification refusée**',
      refused.map((reason) => `- ${reason}`).join('\n'),
    );
  }
  if (checks.length > 0) {
    sections.push(
      `**${checks.length > 1 ? 'Nouveaux fichiers' : 'Nouveau fichier'}**`,
      ['```text', ...checks.flatMap((check) => [...check.lines, '']).slice(0, -1), '```'].join(
        '\n',
      ),
    );
  }
  sections.push(
    '<sub>Pour rejouer la vérification en local : `npm run games:check -- games`.</sub>',
  );

  return {
    ok,
    lines,
    markdown: report(ok ? '✅' : '❌', ok ? 'tout est bon' : 'à corriger', sections),
  };
}

function publishedFailure(n: number): string {
  const s = n > 1 ? 's' : '';
  return `Échec : ${n} fichier${s} publié${s} modifié${s} ou supprimé${s}.`;
}

function report(icon: string, verdict: string, sections: string[]): string {
  return (
    [REPORT_MARKER, `### ${icon} Vérification des jeux : ${verdict}`, ...sections].join('\n\n') +
    '\n'
  );
}
