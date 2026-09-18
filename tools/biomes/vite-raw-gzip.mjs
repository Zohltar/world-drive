/** Keep biome .json.gz payloads compressed until the bounded Worker decoder.
 * sirv infers HTTP Content-Encoding from a .gz suffix, even for direct requests.
 * Override only this data namespace; leave file lookup, access checks, length,
 * status codes and streaming to Vite. No game-runtime or build-time side effects.
 */
export function worldDriveBiomeRawGzip() {
  function configure(server) {
    server.middlewares.use((req, res, next) => {
      const url = typeof req.url === 'string' ? req.url : '';
      const pathname = url.split('?', 1)[0];
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.length <= 512
          && /^\/local-data\/biomes\/(?:[A-Za-z0-9_-]+\/)*\d{1,4}-\d{1,4}\.json\.gz$/.test(pathname)) {
        // Removing the header is insufficient: sirv would put it back in send().
        res.setHeader('Content-Encoding', 'identity');
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      next();
    });
  }
  return {
    name: 'world-drive-biome-raw-gzip',
    configureServer: configure,
    configurePreviewServer: configure
  };
}
