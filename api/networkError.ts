const known = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID']);

/** Only allowlisted codes, never URLs, raw messages, credentials or response bodies. */
export function networkErrorCode(error: unknown): string {
  const pending: unknown[] = [error], seen = new Set<unknown>();
  let timeout = false, aborted = false;
  for (let count = 0; pending.length && count < 16; count++) {
    const value = pending.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const item = value as { code?: unknown; name?: unknown; cause?: unknown; errors?: unknown[] };
    if (typeof item.code === 'string' && known.has(item.code)) return item.code;
    timeout ||= item.name === 'TimeoutError'; aborted ||= item.name === 'AbortError';
    if (item.cause) pending.push(item.cause);
    if (Array.isArray(item.errors)) pending.push(...item.errors.slice(0, 8));
  }
  return timeout ? 'REQUEST_TIMEOUT' : aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR_UNCLASSIFIED';
}
