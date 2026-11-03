// Outbound requests are selected by application code. No model URL reaches fetch.
export async function boundedResponse(fetcher: typeof fetch, url: string, init: RequestInit, deadline: number,
  clock: () => number, maxBytes = 256*1024, types = ['text/plain','text/html','application/json','application/xml','text/xml']) {
  const timeoutMs = Math.min(20000,deadline-clock());
  if (timeoutMs<=0) throw new Error('deadline');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) throw new Error('request_aborted');
  init.signal?.addEventListener('abort',abort,{ once: true });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url,{ ...init, redirect: 'manual', signal: controller.signal });
        if (!response.ok || response.status>=300 || !types.includes((response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase())) throw new Error('source_response');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('source_empty');
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (true) {
            const part = await reader.read(); if (part.done) break;
            size += part.value.byteLength;
            if (size>maxBytes) throw new Error('source_too_large');
            chunks.push(part.value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
        return new TextDecoder('utf-8',{ fatal: true, ignoreBOM: false }).decode(bytes);
      })(),
      new Promise<never>((_,reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('source_timeout')); },timeoutMs); }),
    ]);
  } finally { if (timeout!==undefined) clearTimeout(timeout); init.signal?.removeEventListener('abort',abort); controller.abort(); }
}
export function sanitizeText(raw: string) {
  return raw.replace(/<(script|style|iframe|object|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[\da-f]+);/gi,' ')
    .replace(/\b(?:sk-[\w-]+|Bearer\s+\S+|AKIA[A-Z0-9]{16})\b/gi,'[redacted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,16000);
}
