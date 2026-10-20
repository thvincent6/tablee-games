// Jest transpile le TypeScript du moteur avec Babel (aucune étape de compilation).
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
};
