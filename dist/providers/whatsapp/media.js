import { ProviderError } from './contracts/errors.js';
export { TimeoutError, withTimeout } from '../../shared/utils/timeout.js';
const MAX_MEDIA_BYTES = 64 * 1024 * 1024; // WhatsApp's largest limit is 100 MB for documents; keep memory bounded
/** Downloads media before sending, so download failures are cleanly NOT_SENT. */
export async function fetchMedia(url) {
    let res;
    try {
        res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    }
    catch (e) {
        throw new ProviderError('MEDIA_UNAVAILABLE', `Could not download media: ${e.message}`);
    }
    if (!res.ok) {
        throw new ProviderError('MEDIA_UNAVAILABLE', `Media URL returned HTTP ${res.status}`, undefined, {
            retryable: res.status >= 500,
        });
    }
    if (Number(res.headers.get('content-length') ?? 0) > MAX_MEDIA_BYTES) {
        throw new ProviderError('INVALID_REQUEST', 'Media is larger than 64 MB');
    }
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_MEDIA_BYTES)
        throw new ProviderError('INVALID_REQUEST', 'Media is larger than 64 MB');
    return { data, contentType: res.headers.get('content-type')?.split(';')[0] || undefined };
}
const MIME_BY_EXT = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
};
export const mimeFromFilename = (name) => MIME_BY_EXT[name?.split('.').pop()?.toLowerCase() ?? ''];
//# sourceMappingURL=media.js.map