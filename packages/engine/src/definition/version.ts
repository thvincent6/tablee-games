// Comparaison de versions semver (`1.2.0`, `1.2.0-beta.1`) : la plus récente gagne dans la bibliothèque.

function parts(version: string): { core: number[]; pre: string | null } {
  const [main, pre] = version.split('+')[0].split(/-(.*)/s);
  return { core: main.split('.').map(Number), pre: pre ?? null };
}

/** Négatif si `a` est plus ancienne que `b`, positif si plus récente, 0 si égales. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.core[i] ?? 0) - (pb.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // Une préversion précède la version finale (1.0.0-beta < 1.0.0).
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre.localeCompare(pb.pre, 'en', { numeric: true });
}
