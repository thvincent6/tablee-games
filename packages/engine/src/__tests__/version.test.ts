import { ENGINE_VERSION, isEngineSupported } from '../version';

describe('isEngineSupported', () => {
  it('accepte la version courante', () => {
    expect(isEngineSupported(ENGINE_VERSION)).toBe(true);
  });

  it('refuse une version plus récente ou invalide', () => {
    expect(isEngineSupported(ENGINE_VERSION + 1)).toBe(false);
    expect(isEngineSupported(0)).toBe(false);
    expect(isEngineSupported(1.5)).toBe(false);
  });
});
