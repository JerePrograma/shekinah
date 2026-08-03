import { encodeBase64Url } from './crypto';
import { verifyCloudflareAccess } from './access';

const encoder = new TextEncoder();

describe('Cloudflare Access', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('valida RS256, issuer, audience, exp y nbf', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const teamDomain = `shekinah-${crypto.randomUUID()}.cloudflareaccess.com`;
    const audience = 'audience-test';
    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      keys: [{ ...jwk, kid: 'kid-1', use: 'sig', alg: 'RS256' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const now = Math.floor(Date.now() / 1000);
    const token = await signToken(keyPair.privateKey, {
      aud: [audience],
      email: 'admin@example.test',
      exp: now + 300,
      iss: `https://${teamDomain}`,
      nbf: now - 10,
      sub: 'actor-1',
    });
    await expect(verifyCloudflareAccess(
      new Request('https://example.test/api/admin/summary', {
        headers: { 'cf-access-jwt-assertion': token },
      }),
      {
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: teamDomain,
        CLOUDFLARE_ACCESS_AUD: audience,
      },
    )).resolves.toEqual({ sub: 'actor-1', email: 'admin@example.test' });
  });

  it('rechaza algoritmos no autorizados sin consultar JWKS', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const token = `${encodeJson({ alg: 'none', kid: 'kid-1' })}.${encodeJson({
      aud: 'audience-test',
      email: 'admin@example.test',
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: 'https://team.cloudflareaccess.com',
      sub: 'actor-1',
    })}.`;
    await expect(verifyCloudflareAccess(
      new Request('https://example.test/admin', {
        headers: { 'cf-access-jwt-assertion': token },
      }),
      {
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
        CLOUDFLARE_ACCESS_AUD: 'audience-test',
      },
    )).rejects.toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function signToken(privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  const header = encodeJson({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' });
  const payload = encodeJson(claims);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}
