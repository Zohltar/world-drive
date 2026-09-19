/** Bounded gzip transport for verified biome preparation; not game-activated.
 * Limits cover retained JS payloads, not browser/native decoder allocations.
 * Serve .json.gz as application/octet-stream WITHOUT HTTP Content-Encoding.
 */
import {MAX_TILE_JSON_BYTES} from './local-refinement.js';
const integer = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const result = (status, reason, extra = {}) => Object.freeze({status, reason, ...extra});

export function createBiomeTileTransport({baseUrl, fetchImpl = globalThis.fetch,
  maxConcurrent = 2, maxReservedBytes = 8 * 1024 * 1024, timeoutMs = 10000} = {}) {
  const base = new URL(baseUrl);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (!(base.protocol === 'https:' || (base.protocol === 'http:' && loopback))
      || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) {
    throw new TypeError('Use an explicit HTTPS or loopback directory URL without credentials/query/fragment');
  }
  if (typeof fetchImpl !== 'function' || !integer(maxConcurrent, 1, 4)
      || !integer(maxReservedBytes, 1, 32 * 1024 * 1024) || !integer(timeoutMs, 1, 60000)) {
    throw new RangeError('Invalid biome transport limits');
  }
  const active = new Set();
  let disposed = false;
  const stats = {started:0, loaded:0, rejected:0, aborted:0, busy:0,
    reservedBytes:0, peakReservedBytes:0, peakConcurrent:0, compressedBytes:0, decodedBytes:0};
  async function load(descriptor, {signal} = {}) {
    if (disposed || signal?.aborted) return result('discarded', 'aborted');
    // Snapshot before any async operation; no caller-controlled path substitution.
    const d = descriptor && {...descriptor};
    if (!d || !integer(d.x, 0, 3599) || !integer(d.y, 0, 1799)
        || d.key !== `${d.x}-${d.y}` || d.file !== `${d.key}.json.gz`
        || !/^[a-f0-9]{64}$/.test(d.sha256 ?? '')
        || !integer(d.gzipBytes, 1, MAX_TILE_JSON_BYTES + 4096)
        || !integer(d.jsonBytes, 1, MAX_TILE_JSON_BYTES)) {
      stats.rejected++; return result('rejected', 'descriptor');
    }
    const reserve = d.jsonBytes + d.gzipBytes;
    if (active.size >= maxConcurrent || stats.reservedBytes + reserve > maxReservedBytes) {
      stats.busy++; return result('busy', 'transport-budget');
    }
    if (typeof globalThis.DecompressionStream !== 'function') {
      stats.rejected++; return result('rejected', 'decompression-unavailable');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once:true});
    if (signal?.aborted) controller.abort();
    active.add(controller); stats.reservedBytes += reserve; stats.started++;
    stats.peakConcurrent = Math.max(stats.peakConcurrent, active.size);
    stats.peakReservedBytes = Math.max(stats.peakReservedBytes, stats.reservedBytes);
    const timer = setTimeout(abort, timeoutMs);
    let reader = null, response = null;
    // Race both the response and stream reads. A hostile/stalled transport cannot
    // block the caller indefinitely; browser abort/cancel owns native cleanup.
    let onAbort;
    const interrupted = new Promise((_, reject) => {
      onAbort = () => reject(new Error('aborted'));
      controller.signal.addEventListener('abort', onAbort, {once:true});
    });
    interrupted.catch(() => {});
    const wait = promise => Promise.race([promise, interrupted]);
    try {
      if (controller.signal.aborted) throw new Error('aborted');
      const url = new URL(d.file, base).href;
      const request = Promise.resolve(fetchImpl(url, {signal:controller.signal,
        redirect:'error', credentials:'omit', cache:'no-store'}));
      // Dispose a late response even when an injected transport ignores AbortSignal.
      request.then(r => { if (controller.signal.aborted) r?.body?.cancel().catch(() => {}); }, () => {});
      response = await wait(request);
      if (!response || response.status !== 200 || response.redirected
          || (response.url && response.url !== url) || !response.body?.getReader) throw new Error('response');
      const encoding = response.headers.get('content-encoding');
      if (encoding && encoding.toLowerCase() !== 'identity') throw new Error('http-content-encoding');
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) !== d.gzipBytes)) throw new Error('compressed-length');
      let compressed = 0;
      const countInput = new TransformStream({transform(chunk, output) {
        if (!(chunk instanceof Uint8Array) || compressed + chunk.byteLength > d.gzipBytes) throw new Error('compressed-overflow');
        compressed += chunk.byteLength; stats.compressedBytes += chunk.byteLength;
        output.enqueue(chunk);
      }, flush() {if (compressed !== d.gzipBytes) throw new Error('compressed-length');}});
      reader = response.body.pipeThrough(countInput).pipeThrough(new DecompressionStream('gzip')).getReader();
      const bytes = new Uint8Array(d.jsonBytes);
      let offset = 0;
      while (true) {
        const item = await wait(reader.read());
        if (item.done) break;
        if (!(item.value instanceof Uint8Array) || offset + item.value.length > bytes.length) throw new Error('decoded-overflow');
        bytes.set(item.value, offset); offset += item.value.length; stats.decodedBytes += item.value.length;
      }
      if (offset !== d.jsonBytes) throw new Error('decoded-length');
      if (controller.signal.aborted || disposed) throw new Error('aborted');
      stats.loaded++;
      // Digest/UTF-8/schema/atomic install remain owned by biome-service.prepareTile.
      return result('loaded', null, {bytes});
    } catch (error) {
      const aborted = controller.signal.aborted || disposed;
      if (aborted) stats.aborted++; else stats.rejected++;
      const known = ['response','http-content-encoding','compressed-length','compressed-overflow','decoded-overflow','decoded-length'];
      return result(aborted ? 'discarded' : 'rejected', aborted ? 'aborted' :
        known.includes(error?.message) ? error.message : 'transport-or-gzip');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', onAbort);
      controller.abort();
      if (reader) { reader.cancel().catch(() => {}); reader.releaseLock(); }
      else if (response?.body && !response.body.locked) response.body.cancel().catch(() => {});
      active.delete(controller); stats.reservedBytes -= reserve;
    }
  }
  return Object.freeze({load, dispose() {disposed = true; for (const c of active) c.abort();},
    diagnostics:() => ({...stats, disposed, active:active.size, maxConcurrent, maxReservedBytes})});
}
