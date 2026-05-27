/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Keep the pre-minified @initia/* bundles out of the server/prerender graph
  // (the UI that uses them is client-only via dynamic ssr:false).
  serverExternalPackages: [
    "@initia/initia.js",
    "@initia/react-wallet-widget",
    "@initia/wallet-widget",
    "@initia/utils",
  ],
  // Those bundles have two concatenated modules each declaring a top-level
  // `let e`; webpack scope-hoisting merges them → "Identifier 'e' has already
  // been declared" → ChunkLoadError at runtime. Disabling concatenateModules on
  // the client bundle avoids the clash. (We do NOT transpile them — SWC chokes
  // on their minified `super` usage.)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization = config.optimization || {};
      config.optimization.concatenateModules = false;
      config.optimization.minimize = false; // SWC mangle collides 2 modules to `e`
    }
    return config;
  },
};

module.exports = nextConfig;
