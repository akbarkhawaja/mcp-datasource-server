import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'Test Cloud SQL Connector endpoint working',
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method
  });
}