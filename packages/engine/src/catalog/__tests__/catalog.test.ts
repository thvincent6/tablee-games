import { createHash } from 'node:crypto';

import { specExample } from '../../__fixtures__/specs';
import { fromBase64, toBase64 } from '../base64';
import { buildCatalog, catalogEntry, CatalogError, parseCatalog, serializeCatalog } from '../build';
import { generateKeyPair, publicKeyOf, signCatalog, verifyCatalog } from '../signature';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const json = (data: unknown) => JSON.stringify(data, null, 2);

function skyjo(version = '1.1.0') {
  return json({ ...structuredClone(specExample('Skyjo')), version, tags: ['cartes'] });
}
const file = (path: string, text: string) => ({ path, text, sha256: sha(text) });
const date = new Date('2026-10-21T08:00:00.000Z');

describe('base64', () => {
  it('fait l’aller-retour et suit le base64 standard', () => {
    for (let length = 0; length < 70; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) % 256);
      const text = toBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(fromBase64(text)).toEqual(bytes);
    }
  });

  it('ignore les retours à la ligne et refuse un texte invalide', () => {
    expect(fromBase64('aGVs\nbG8=\n')).toEqual(new TextEncoder().encode('hello'));
    expect(fromBase64('abc')).toBeNull();
    expect(fromBase64('ab-c')).toBeNull();
    expect(fromBase64('a=bc')).toBeNull();
  });
});

describe('buildCatalog', () => {
  it('décrit chaque fichier, trié par jeu puis par version', () => {
    const files = [
      file('skyjo/1.10.0.json', skyjo('1.10.0')),
      file('skyjo/1.2.0.json', skyjo('1.2.0')),
    ];
    const catalog = buildCatalog(files, 7, date);
    expect(catalog.version).toBe(7);
    expect(catalog.generatedAt).toBe('2026-10-21T08:00:00.000Z');
    expect(catalog.games.map((g) => g.version)).toEqual(['1.2.0', '1.10.0']);
    expect(catalog.games[0]).toEqual({
      id: 'skyjo',
      name: 'Skyjo',
      version: '1.2.0',
      engine: 1,
      path: 'games/skyjo/1.2.0.json',
      sha256: sha(skyjo('1.2.0')),
      players: [2, 8],
      tags: ['cartes'],
    });
  });

  it('refuse un fichier invalide ou mal rangé', () => {
    expect(() => catalogEntry(file('skyjo/1.1.0.json', '{'))).toThrow(CatalogError);
    expect(() => catalogEntry(file('skyjo/9.9.9.json', skyjo()))).toThrow(
      'skyjo/9.9.9.json : doit s’appeler skyjo/1.1.0.json',
    );
  });

  it('sérialise et relit le catalogue à l’identique', () => {
    const catalog = buildCatalog([file('skyjo/1.1.0.json', skyjo())], 1, date);
    const text = serializeCatalog(catalog);
    expect(text.endsWith('}\n')).toBe(true);
    expect(parseCatalog(text)).toEqual(catalog);
    expect(parseCatalog('pas du json')).toBeNull();
    expect(parseCatalog(JSON.stringify({ ...catalog, version: 0 }))).toBeNull();
  });
});

describe('signature du catalogue', () => {
  const primary = generateKeyPair();
  const backup = generateKeyPair();
  const keys = [primary.publicKey, backup.publicKey];
  const text = serializeCatalog(buildCatalog([file('skyjo/1.1.0.json', skyjo())], 3, date));
  const signature = signCatalog(text, primary.privateKey);

  it('le catalogue signé se vérifie avec la clé publique', () => {
    expect(fromBase64(signature)).toHaveLength(64);
    expect(verifyCatalog(text, signature, keys)).toBe(true);
    expect(verifyCatalog(text, `${signature}\n`, [primary.publicKey])).toBe(true);
  });

  it('un octet modifié n’importe où dans le catalogue fait échouer la vérification', () => {
    const bytes = new TextEncoder().encode(text);
    // Chaque position testée : début, champs, empreintes, fin de fichier.
    for (const position of [
      0,
      10,
      Math.floor(bytes.length / 2),
      bytes.length - 2,
      bytes.length - 1,
    ]) {
      const altered = bytes.slice();
      altered[position] ^= 0x01;
      expect(verifyCatalog(new TextDecoder().decode(altered), signature, keys)).toBe(false);
    }
    expect(verifyCatalog(text + ' ', signature, keys)).toBe(false);
  });

  it('une signature modifiée ou d’une autre clé est refusée', () => {
    const sig = fromBase64(signature)!;
    sig[5] ^= 0x80;
    expect(verifyCatalog(text, toBase64(sig), keys)).toBe(false);
    expect(verifyCatalog(text, signCatalog(text, generateKeyPair().privateKey), keys)).toBe(false);
  });

  it('la clé de secours permet de changer de clé principale', () => {
    expect(verifyCatalog(text, signCatalog(text, backup.privateKey), keys)).toBe(true);
    expect(verifyCatalog(text, signCatalog(text, backup.privateKey), [primary.publicKey])).toBe(
      false,
    );
  });

  it('ne lève jamais : signature ou clé abîmée → faux', () => {
    expect(verifyCatalog(text, 'abc', keys)).toBe(false);
    expect(verifyCatalog(text, toBase64(new Uint8Array(64)), keys)).toBe(false);
    expect(verifyCatalog(text, signature, ['pas une clé', toBase64(new Uint8Array(31))])).toBe(
      false,
    );
    expect(verifyCatalog(text, signature, [toBase64(new Uint8Array(32).fill(255))])).toBe(false);
  });

  it('retrouve la clé publique d’une clé privée', () => {
    expect(publicKeyOf(primary.privateKey)).toBe(primary.publicKey);
    expect(publicKeyOf('abcd')).toBeNull();
    expect(() => signCatalog(text, 'abcd')).toThrow('clé privée invalide');
  });
});
