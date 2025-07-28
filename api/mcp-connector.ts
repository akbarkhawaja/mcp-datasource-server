import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Simple test first
  res.status(200).json({
    message: 'Cloud SQL Connector endpoint working!',
    timestamp: new Date().toISOString(),
    path: req.url,
    method: req.method,
    headers: Object.keys(req.headers)
  });
}