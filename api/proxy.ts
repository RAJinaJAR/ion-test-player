// api/proxy.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }

  try {
    const response = await fetch(targetUrl);

    if (!response.ok) {
      res.status(response.status).send(`Failed to fetch target file: ${response.statusText}`);
      return;
    }

    // Forward content type so blob() works correctly
    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'application/octet-stream'
    );

    // Stream back the file
    response.body.pipe(res);
  } catch (err: any) {
    res.status(500).send(`Proxy error: ${err.message}`);
  }
}
