import { createRemoteJWKSet, jwtVerify } from 'jose';

const keysets = new Map();
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export async function verifyAccess(token, { issuer, audience, keyset }) {
  const { payload } = await jwtVerify(token, keyset, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'] });
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || !payload.email) throw new Error('Invalid identity');
  return { sub: payload.sub, email: payload.email.toLowerCase(), issuer };
}
export async function authenticate(request, env) {
  const url = new URL(request.url);
  if (env.ENVIRONMENT === 'local' && env.LOCAL_DEV_MODE === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return { sub: 'local-owner', email: 'local@moneytalk.invalid', issuer: 'moneytalk-local', local: true };
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.OWNER_EMAIL || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '访问保护尚未配置，请联系账本拥有者');
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new ApiError(401, 'LOGIN_REQUIRED', '请先登录后访问账本');
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!keysets.has(issuer)) keysets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  try {
    const identity = await verifyAccess(token, { issuer, audience: env.ACCESS_AUD, keyset: keysets.get(issuer) });
    if (identity.email !== env.OWNER_EMAIL.trim().toLowerCase()) throw new ApiError(403, 'NOT_INVITED', '此账号没有访问该账本的权限');
    return identity;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'SESSION_EXPIRED', '登录已失效，请重新登录');
  }
}
export function requireSameOrigin(request, env) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const localVite = env.ENVIRONMENT === 'local' && env.LOCAL_DEV_MODE === 'true' && url.hostname === '127.0.0.1' && origin === 'http://127.0.0.1:5173';
  if (origin !== url.origin && !localVite) throw new ApiError(403, 'INVALID_ORIGIN', '请在 MoneyTalk 页面内执行此操作');
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', '请求格式不正确');
}
