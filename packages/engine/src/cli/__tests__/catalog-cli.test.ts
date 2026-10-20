import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseCatalog, signCatalog } from '../../catalog';

const root = path.join(__dirname, '../../../../..');

const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(
    path.join(root, 'node_modules/.bin/tsx'),
    [`packages/engine/src/cli/${script}.ts`, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CATALOG_SIGNING_KEY: '', ...env },
    },
  );

jest.setTimeout(60_000);

describe('chaîne de publication du catalogue', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tablee-catalog-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const at = (...parts: string[]) => path.join(dir, ...parts);
  const keysFile = () => at('keys', 'catalog-keys.json');

  function generate() {
    const result = run('generate-keys', ['--dir', at('privé'), '--keys-file', keysFile()]);
    expect(result.status).toBe(0);
    return {
      result,
      primary: fs.readFileSync(at('privé', 'catalog-primary.key'), 'utf8').trim(),
      backup: fs.readFileSync(at('privé', 'catalog-backup.key'), 'utf8').trim(),
    };
  }

  it('génère, construit, signe et vérifie ; un octet modifié est refusé', () => {
    const { result, primary, backup } = generate();
    // Les clés privées ne sont jamais affichées.
    expect(result.stdout).not.toContain(primary);
    expect(result.stdout).not.toContain(backup);
    expect(fs.statSync(at('privé', 'catalog-primary.key')).mode & 0o777).toBe(0o600);
    expect(run('generate-keys', ['--dir', at('privé'), '--keys-file', keysFile()]).status).toBe(2);

    expect(run('build-catalog', ['games', at('site')]).status).toBe(0);
    const index = at('site', 'index.json');
    expect(parseCatalog(fs.readFileSync(index, 'utf8'))?.version).toBe(1);
    expect(fs.readFileSync(at('site', 'games/skyjo/1.1.0.json'), 'utf8')).toBe(
      fs.readFileSync(path.join(root, 'games/skyjo/1.1.0.json'), 'utf8'),
    );

    expect(
      run('sign-catalog', [index, '--keys-file', keysFile()], { CATALOG_SIGNING_KEY: primary })
        .status,
    ).toBe(0);
    const verified = run('verify-catalog', [index, `${index}.sig`, '--keys-file', keysFile()]);
    expect(verified.status).toBe(0);
    expect(verified.stdout).toContain('✓ Signature valide (clé principale) : catalogue version 1');

    const bytes = fs.readFileSync(index);
    bytes[bytes.length - 3] ^= 0x01;
    fs.writeFileSync(index, bytes);
    const altered = run('verify-catalog', [index, `${index}.sig`, '--keys-file', keysFile()]);
    expect(altered.status).toBe(1);
    expect(altered.stderr).toContain('Signature invalide');
  });

  it('incrémente la version du catalogue publié', () => {
    expect(run('build-catalog', ['games', at('v1')]).status).toBe(0);
    const result = run('build-catalog', ['games', at('v2'), '--previous', at('v1', 'index.json')]);
    expect(result.stdout).toContain('Catalogue version 2');
    fs.writeFileSync(at('faux.json'), '{}');
    expect(run('build-catalog', ['games', at('v3'), '--previous', at('faux.json')]).status).toBe(1);
    expect(run('build-catalog', ['games']).status).toBe(2);
  });

  it('refuse de construire avec un jeu invalide', () => {
    fs.mkdirSync(at('jeux', 'skyjo'), { recursive: true });
    fs.writeFileSync(at('jeux', 'skyjo', '1.0.0.json'), '{');
    const result = run('build-catalog', [at('jeux'), at('site')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('skyjo/1.0.0.json : définition invalide');
  });

  it('ne signe pas sans secret, ni avec une clé qui ne correspond pas', () => {
    const { backup } = generate();
    run('build-catalog', ['games', at('site')]);
    const index = at('site', 'index.json');
    expect(run('sign-catalog', [index, '--keys-file', keysFile()]).stderr).toContain(
      'CATALOG_SIGNING_KEY absent',
    );
    const wrong = run('sign-catalog', [index, '--keys-file', keysFile()], {
      CATALOG_SIGNING_KEY: backup,
    });
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('ne correspond pas à la clé publique principale');
    expect(fs.existsSync(`${index}.sig`)).toBe(false);
    expect(
      run('sign-catalog', [index, '--keys-file', at('absent.json')], {
        CATALOG_SIGNING_KEY: backup,
      }).status,
    ).toBe(1);
    expect(run('sign-catalog', []).status).toBe(2);
  });

  it('la vérification accepte la clé de secours et signale un fichier manquant', () => {
    const { backup } = generate();
    run('build-catalog', ['games', at('site')]);
    const index = at('site', 'index.json');
    // Signature par la clé de secours, comme après un changement de clé.
    fs.writeFileSync(`${index}.sig`, signCatalog(fs.readFileSync(index, 'utf8'), backup));
    expect(
      run('verify-catalog', [index, `${index}.sig`, '--keys-file', keysFile()]).stdout,
    ).toContain('clé de secours');
    expect(run('verify-catalog', [index, at('absent.sig'), '--keys-file', keysFile()]).status).toBe(
      2,
    );
    expect(run('verify-catalog', [index]).status).toBe(2);
  });
});
