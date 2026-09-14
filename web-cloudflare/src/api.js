export class RequestError extends Error {
  constructor(message, code, status = 0) { super(message); this.code = code; this.status = status; }
}
let ledgerId = null;
export function setLedger(id) { ledgerId = id; }
export function getLedger() { return ledgerId; }
export async function request(path, { method = 'GET', body, key, signal, raw = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (ledgerId) headers['X-Ledger-Id'] = ledgerId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(20000), cache: 'no-store' });
  } catch {
    throw new RequestError(method === 'GET' ? '暂时无法连接账本，请检查网络后重试' : '连接中断，保存结果尚未确认。输入已保留，请点击重试核对结果', 'NETWORK');
  }
  try {
    const json = response.headers.get('Content-Type')?.includes('application/json');
    if (!response.ok || (!json && !raw)) {
      const data = json ? await response.json() : null;
      throw new RequestError(data?.error?.message || (response.status >= 500 ? '账本服务暂时不可用，请核对并重试' : '登录可能已失效，请重新登录'), data?.error?.code || (response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'LOGIN_REQUIRED'), response.status);
    }
    return raw ? await response.blob() : await response.json();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('响应未完整收到，结果尚未确认。请使用同一次提交核对并重试', 'NETWORK');
  }
}
export async function mutate(path, body, { method = 'POST', key = crypto.randomUUID() } = {}) {
  try { return await request(path, { method, body, key }); }
  catch (error) {
    if (error.code === 'NETWORK' || error.status >= 500) {
      try {
        const result = await request(`/operations/${key}`);
        if (result.found) return result.result;
      } catch { /* Keep the original uncertainty message and the same retry key. */ }
    }
    throw error;
  }
}
export function queryString(values) { return new URLSearchParams(Object.entries(values).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString(); }
export function download(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
