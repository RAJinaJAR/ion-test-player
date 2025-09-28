export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("Proxy hit:", req.query.url);

  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    res.status(400).send('Missing url parameter');
    return;
  }
  
  try {
    const response = await fetch(targetUrl);
    console.log("Fetched from target:", targetUrl, "status:", response.status);

    if (!response.ok) {
      res.status(response.status).send(`Failed to fetch target file: ${response.statusText}`);
      return;
    }

    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'application/octet-stream'
    );
    response.body.pipe(res);
  } catch (err: any) {
    console.error("Proxy error:", err);
    res.status(500).send(`Proxy error: ${err.message}`);
  }
}
