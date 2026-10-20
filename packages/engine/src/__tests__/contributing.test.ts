import fs from 'node:fs';
import path from 'node:path';

import { checkGameFile } from '../cli/check';

// L'exemple de CONTRIBUTING.md doit rester un jeu valide dont le cas de test passe.

const guide = fs.readFileSync(path.join(__dirname, '../../../../CONTRIBUTING.md'), 'utf8');
const [example] = [...guide.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);

it('l’exemple du guide de contribution est valide et ses tests passent', () => {
  const check = checkGameFile('exemple-plis/1.0.0.json', example);
  expect(check.lines).toEqual([
    '✓ Exemple de plis 1.0.0 — exemple-plis/1.0.0.json',
    "  ✓ Annonce exacte, puis deux plis d'écart",
  ]);
  expect(check.ok).toBe(true);
});
