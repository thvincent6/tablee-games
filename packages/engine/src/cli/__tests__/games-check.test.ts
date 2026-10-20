import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { specExample } from '../../__fixtures__/specs';

import { checkGameFile, summarize } from '../check';

const root = path.join(__dirname, '../../../../..');
const skyjo = () => structuredClone(specExample('Skyjo')) as Record<string, any>;
const json = (data: unknown) => JSON.stringify(data, null, 2);

describe('checkGameFile', () => {
  it('valide et rejoue un jeu bien rangé', () => {
    const check = checkGameFile('skyjo/1.0.0.json', json(skyjo()));
    expect(check).toMatchObject({ ok: true });
    expect(check.lines).toEqual(['✓ Skyjo 1.0.0 — skyjo/1.0.0.json', '  ✓ Finisseur doublé']);
  });

  it('refuse une définition invalide en listant ses erreurs', () => {
    const check = checkGameFile('skyjo/1.0.0.json', json({ ...skyjo(), winner: 'best' }));
    expect(check.ok).toBe(false);
    expect(check.lines[0]).toBe('✗ skyjo/1.0.0.json : définition invalide');
    expect(check.lines[1]).toMatch(/^ {6}winner : /);
  });

  it('exige le rangement <id>/<version>.json', () => {
    expect(checkGameFile('skyjo.json', json(skyjo())).lines).toEqual([
      '✗ skyjo.json : mauvais emplacement',
      '      le fichier de skyjo 1.0.0 doit s’appeler skyjo/1.0.0.json',
    ]);
    expect(checkGameFile('skyjo\\1.0.0.json', json(skyjo())).ok).toBe(true);
  });

  it('exige au moins un cas de test', () => {
    const { tests: _tests, ...untested } = skyjo();
    expect(checkGameFile('skyjo/1.0.0.json', json(untested)).lines[0]).toBe(
      '✗ skyjo/1.0.0.json : aucun cas de test',
    );
  });

  it('résume le résultat', () => {
    const ok = checkGameFile('skyjo/1.0.0.json', json(skyjo()));
    const wrong = skyjo();
    wrong.tests[0].expect = [21, 8];
    const failed = checkGameFile('skyjo/1.0.0.json', json(wrong));
    expect(summarize([ok])).toEqual({
      ok: true,
      line: 'Tout est bon : 1 jeu, 1 cas de test réussis.',
    });
    expect(summarize([ok, failed])).toEqual({
      ok: false,
      line: 'Échec : 1 jeu sur 2 à corriger, 1 cas de test en échec sur 2.',
    });
  });
});

describe('npm run games:check', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tablee-games-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (file: string, data: unknown) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), json(data));
  };
  const run = (...args: string[]) =>
    spawnSync(
      path.join(root, 'node_modules/.bin/tsx'),
      ['packages/engine/src/cli/games-check.ts', ...args],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );

  jest.setTimeout(30_000);

  it('réussit quand tous les jeux passent', () => {
    write('skyjo/1.0.0.json', skyjo());
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Tout est bon : 1 jeu, 1 cas de test réussis.');
  });

  it('échoue (code 1) dès qu’un cas de test est faux', () => {
    write('skyjo/1.0.0.json', skyjo());
    const wrong = skyjo();
    wrong.version = '1.1.0';
    wrong.tests[0].expect = [21, 8];
    write('skyjo/1.1.0.json', wrong);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('      attendu : 21 · 8\n      obtenu  : 20 · 8');
    expect(result.stdout).toContain('Échec : 1 jeu sur 2 à corriger');
  });

  it('ne fait rien sur un dossier vide, et signale un dossier introuvable (code 2)', () => {
    expect(run(dir)).toMatchObject({ status: 0 });
    expect(run(path.join(dir, 'absent'))).toMatchObject({ status: 2 });
    expect(run()).toMatchObject({ status: 2 });
  });
});
