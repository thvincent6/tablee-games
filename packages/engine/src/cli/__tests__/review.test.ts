import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { specExample } from '../../__fixtures__/specs';
import { nextPatch, REPORT_MARKER, reviewChanges, type Catalog } from '../review';

const root = path.join(__dirname, '../../../../..');
const json = (data: unknown) => JSON.stringify(data, null, 2);

/** Skyjo de test, à la version voulue, éventuellement avec un cas de test faux. */
function skyjo(version = '1.1.0', { wrong = false } = {}) {
  const game = structuredClone(specExample('Skyjo')) as Record<string, any>;
  game.version = version;
  if (wrong) game.tests[0].expect = [21, 8];
  return json(game);
}

const published: Catalog = new Map([['skyjo/1.1.0.json', skyjo()]]);
const withFiles = (files: Record<string, string>): Catalog =>
  new Map([...published, ...Object.entries(files)]);

describe('reviewChanges', () => {
  it('ne vérifie rien quand aucun jeu ne change', () => {
    const review = reviewChanges(published, published);
    expect(review.ok).toBe(true);
    expect(review.lines).toEqual(['Aucun fichier de jeu ajouté ou modifié : rien à vérifier.']);
    expect(review.markdown).toContain('### ✅ Vérification des jeux : rien à vérifier');
  });

  it('accepte une nouvelle version dont les tests passent', () => {
    const review = reviewChanges(published, withFiles({ 'skyjo/1.2.0.json': skyjo('1.2.0') }));
    expect(review.ok).toBe(true);
    expect(review.lines).toEqual([
      '✓ Skyjo 1.2.0 — games/skyjo/1.2.0.json',
      '  ✓ Finisseur doublé',
      '',
      'Tout est bon : 1 jeu, 1 cas de test réussis.',
    ]);
    expect(review.markdown.startsWith(REPORT_MARKER)).toBe(true);
    expect(review.markdown).toContain('### ✅ Vérification des jeux : tout est bon');
    expect(review.markdown).toContain('**Nouveau fichier**');
  });

  it('bloque un jeu dont un cas de test est faux, et explique pourquoi', () => {
    const review = reviewChanges(
      published,
      withFiles({ 'skyjo/1.2.0.json': skyjo('1.2.0', { wrong: true }) }),
    );
    expect(review.ok).toBe(false);
    expect(review.markdown).toContain('### ❌ Vérification des jeux : à corriger');
    expect(review.markdown).toContain('✗ Finisseur doublé');
    expect(review.markdown).toContain('attendu : 21 · 8\n      obtenu  : 20 · 8');
    expect(review.markdown).toContain('Échec : 1 jeu sur 1 à corriger');
  });

  it('refuse la modification d’un fichier publié et propose une nouvelle version', () => {
    const review = reviewChanges(
      published,
      new Map([['skyjo/1.1.0.json', skyjo().replace('Finisseur doublé', 'Finisseur')]]),
    );
    expect(review.ok).toBe(false);
    expect(review.markdown).toContain('**Fichiers déjà publiés : modification refusée**');
    expect(review.markdown).toContain(
      '`games/skyjo/1.1.0.json` est déjà publié : un fichier publié ne change plus',
    );
    expect(review.markdown).toContain('`games/skyjo/1.1.1.json`');
    expect(review.lines.at(-1)).toBe('Échec : 1 fichier publié modifié ou supprimé.');
  });

  it('refuse la modification même si la pull request ajoute aussi un bon fichier', () => {
    const review = reviewChanges(
      published,
      new Map([
        ['skyjo/1.1.0.json', skyjo() + '\n'],
        ['skyjo/1.2.0.json', skyjo('1.2.0')],
      ]),
    );
    expect(review.ok).toBe(false);
    expect(review.markdown).toContain('Tout est bon : 1 jeu');
    expect(review.markdown).toContain('modification refusée');
  });

  it('refuse la suppression d’un fichier publié', () => {
    const review = reviewChanges(published, new Map());
    expect(review.ok).toBe(false);
    expect(review.markdown).toContain(
      '`games/skyjo/1.1.0.json` est publié : il ne peut pas être supprimé',
    );
    const both = reviewChanges(withFiles({ 'yams/1.0.0.json': '{}' }), new Map());
    expect(both.lines.at(-1)).toBe('Échec : 2 fichiers publiés modifiés ou supprimés.');
  });

  it('refuse une version qui n’est pas plus récente que la dernière publiée', () => {
    const review = reviewChanges(published, withFiles({ 'skyjo/1.0.5.json': skyjo('1.0.5') }));
    expect(review.ok).toBe(false);
    expect(review.lines.slice(0, 2)).toEqual([
      '✗ games/skyjo/1.0.5.json : version trop ancienne',
      '      la dernière version publiée de skyjo est 1.1.0 : la nouvelle doit être plus récente (1.1.1 par exemple)',
    ]);
  });

  it('refuse un fichier qui n’est pas du JSON et un fichier mal rangé', () => {
    const review = reviewChanges(
      published,
      withFiles({ 'skyjo/notes.txt': 'brouillon', 'flip7.json': skyjo('1.0.0') }),
    );
    expect(review.ok).toBe(false);
    expect(review.markdown).toContain('✗ games/flip7.json : mauvais emplacement');
    expect(review.markdown).toContain(
      '✗ games/skyjo/notes.txt : seuls des fichiers .json ont leur place dans games/',
    );
  });

  it('accepte un premier jeu, et un compteur sans cas de test', () => {
    const counter = json({
      id: 'compteur-test',
      name: 'Compteur test',
      version: '1.0.0',
      engine: 1,
      archetype: 'counter',
      players: { min: 1, max: 8 },
      winner: 'highest',
    });
    const review = reviewChanges(new Map(), new Map([['compteur-test/1.0.0.json', counter]]));
    expect(review.ok).toBe(true);
    expect(review.markdown).toContain('(compteur : aucun calcul à tester)');
  });
});

describe('nextPatch', () => {
  it.each([
    ['1.1.0', '1.1.1'],
    ['2.0.9', '2.0.10'],
    ['2.0.0-beta.1', '2.0.1'],
  ])('%s → %s', (version, next) => expect(nextPatch(version)).toBe(next));
});

describe('npm run games:review', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tablee-review-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (side: 'base' | 'head', file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, side, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, side, file), text);
  };
  const run = (...args: string[]) =>
    spawnSync(
      path.join(root, 'node_modules/.bin/tsx'),
      ['packages/engine/src/cli/review-pr.ts', ...args],
      { cwd: root, encoding: 'utf8' },
    );

  jest.setTimeout(30_000);

  it('écrit le rapport Markdown et sort en erreur quand un fichier publié change', () => {
    write('base', 'skyjo/1.1.0.json', skyjo());
    write('head', 'skyjo/1.1.0.json', skyjo('1.1.0', { wrong: true }));
    const out = path.join(dir, 'rapport.md');
    const result = run(path.join(dir, 'base'), path.join(dir, 'head'), '--out', out);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('games/skyjo/1.1.0.json est déjà publié');
    expect(fs.readFileSync(out, 'utf8')).toContain('modification refusée');
  });

  it('réussit sur un nouveau jeu valide', () => {
    write('base', 'skyjo/1.1.0.json', skyjo());
    write('head', 'skyjo/1.1.0.json', skyjo());
    write('head', 'skyjo/1.2.0.json', skyjo('1.2.0'));
    const result = run(path.join(dir, 'base'), path.join(dir, 'head'));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Tout est bon');
  });

  it('signale des arguments manquants ou un dossier introuvable (code 2)', () => {
    fs.mkdirSync(path.join(dir, 'base'));
    expect(run(path.join(dir, 'base'))).toMatchObject({ status: 2 });
    expect(run(path.join(dir, 'base'), path.join(dir, 'absent'))).toMatchObject({ status: 2 });
    expect(run(path.join(dir, 'base'), path.join(dir, 'base'), '--out')).toMatchObject({
      status: 2,
    });
  });
});
