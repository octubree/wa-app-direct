function base64UrlEncode(input) {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encodeBase64Url(obj) {
  const json = JSON.stringify(obj);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(json);
  return base64UrlEncode(bytes);
}

async function signJwt(unsigned, privateKeyPem) {
  // Convertir clave privada PEM a CryptoKey
  const keyData = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  const raw = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    raw.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(unsigned);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, data);
  return base64UrlEncode(new Uint8Array(signature));
}

export async function createJwt(serviceAccount) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const unsigned = `${encodeBase64Url(header)}.${encodeBase64Url(claim)}`;
  const signature = await signJwt(unsigned, serviceAccount.private_key);
  const jwt = `${unsigned}.${signature}`;

  // Intercambiar JWT por token de acceso
  const body = `grant_type=urn:ietf:params:oauth:grant-type=jwt-bearer&assertion=${jwt}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const json = await resp.json();
  return json.access_token;
}