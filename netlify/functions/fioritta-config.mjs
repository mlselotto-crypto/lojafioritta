export default function config(request) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  }

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  // Accept only the publishable key format, never a legacy JWT or a secret key.
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
        endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey ?? '')) {
      throw new Error('Invalid public configuration');
    }
    return Response.json({ url: endpoint.origin, publishableKey }, { headers });
  } catch {
    return Response.json({ error: 'A configuração pública da Fioritta está indisponível.' }, {
      status: 503, headers,
    });
  }
}
