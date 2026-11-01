export function deepgramGrant(apiKey: string) {
  return async (ttlSeconds: number): Promise<{ token: string; expiresIn: number }> => {
    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: ttlSeconds }),
    });
    if (!res.ok) throw new Error(`deepgram grant ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    return { token: body.access_token, expiresIn: body.expires_in };
  };
}
