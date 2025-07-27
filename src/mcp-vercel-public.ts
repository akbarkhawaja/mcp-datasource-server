import { VercelRequest, VercelResponse } from '@vercel/node';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import cors from 'cors';

// CORS configuration for public access
const corsOptions = {
  origin: '*', // Be more restrictive in production
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
};

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limiting configuration
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute per IP
};

// Simple rate limiter
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const clientData = rateLimitStore.get(ip);
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT.windowMs });
    return true;
  }
  
  if (clientData.count >= RATE_LIMIT.maxRequests) {
    return false;
  }
  
  clientData.count++;
  return true;
}

// API Key authentication (optional but recommended)
function authenticateRequest(req: VercelRequest): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return true; // No API key required if not set
  
  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  return providedKey === apiKey;
}

// Database connection with connection pooling
let pool: mysql.Pool | null = null;

function getDbPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 5,
      charset: 'utf8mb4',
      ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: true,
        ca: process.env.DB_SSL_CA_BASE64 
          ? Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64')
          : process.env.DB_SSL_CA ? readFileSync(process.env.DB_SSL_CA) : undefined,
        cert: process.env.DB_SSL_CERT_BASE64
          ? Buffer.from(process.env.DB_SSL_CERT_BASE64, 'base64')
          : process.env.DB_SSL_CERT ? readFileSync(process.env.DB_SSL_CERT) : undefined,
        key: process.env.DB_SSL_KEY_BASE64
          ? Buffer.from(process.env.DB_SSL_KEY_BASE64, 'base64')
          : process.env.DB_SSL_KEY ? readFileSync(process.env.DB_SSL_KEY) : undefined
      } : undefined,
    });
  }
  return pool;
}

// Execute safe query with whitelist
async function executeSafeQuery(query: string, limit: number = 50): Promise<any> {
  const dbPool = getDbPool();
  
  // Enhanced validation for public access
  const trimmed = query.trim().toUpperCase();
  
  // Only allow very specific, safe queries
  const allowedPatterns = [
    /^SHOW TABLES$/,
    /^SHOW DATABASES$/,
    /^SELECT \* FROM \w+ LIMIT \d+$/,
    /^SELECT .+ FROM \w+ LIMIT \d+$/,
    /^DESCRIBE \w+$/,
    /^DESC \w+$/,
    /^SHOW COLUMNS FROM \w+$/,
  ];
  
  const isAllowed = allowedPatterns.some(pattern => pattern.test(trimmed));
  if (!isAllowed) {
    throw new Error('Query not allowed. Only basic SELECT, SHOW, and DESCRIBE queries are permitted.');
  }
  
  // Additional security: limit result size
  if (limit > 100) limit = 100;
  
  const connection = await dbPool.getConnection();
  try {
    const [rows] = await connection.execute(query);
    let results = Array.isArray(rows) ? rows as any[] : [];
    
    if (results.length > limit) {
      results = results.slice(0, limit);
    }
    
    return {
      success: true,
      data: {
        results,
        rowCount: results.length,
        query,
        truncated: results.length === limit,
        timestamp: new Date().toISOString()
      }
    };
  } finally {
    connection.release();
  }
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Get client IP for rate limiting
    const clientIP = req.headers['x-forwarded-for'] as string || 
                     req.headers['x-real-ip'] as string || 
                     '127.0.0.1';
    
    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: 60
      });
    }
    
    // Check authentication (if API key is set)
    if (!authenticateRequest(req)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid API key required'
      });
    }
    
    // Handle different endpoints
    const { pathname } = new URL(req.url!, `https://${req.headers.host}`);
    
    if (pathname === '/api/health') {
      return res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        message: 'Public MCP Datasource Server'
      });
    }
    
    if (pathname === '/api/mcp/tools/list') {
      return res.json({
        tools: [
          {
            name: 'health_check',
            description: 'Check server health',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'query_database',
            description: 'Execute safe database queries (limited access)',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Safe SQL query (SHOW, DESCRIBE, basic SELECT only)'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum results (max: 100)',
                  maximum: 100
                }
              },
              required: ['query']
            }
          }
        ]
      });
    }
    
    if (pathname === '/api/mcp/tools/call' && req.method === 'POST') {
      const { name, arguments: args } = req.body;
      
      if (name === 'health_check') {
        return res.json({
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'healthy',
              timestamp: new Date().toISOString(),
              message: 'Public MCP Datasource Server is running'
            }, null, 2)
          }]
        });
      }
      
      if (name === 'query_database') {
        try {
          const query = args?.query;
          const limit = Math.min(args?.limit || 50, 100);
          
          if (!query) {
            throw new Error('Query parameter is required');
          }
          
          const result = await executeSafeQuery(query, limit);
          
          return res.json({
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          });
        } catch (error) {
          return res.json({
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }]
          });
        }
      }
      
      return res.status(400).json({
        error: `Unknown tool: ${name}`
      });
    }
    
    // Default 404
    return res.status(404).json({
      error: 'Not found',
      message: 'Endpoint not found'
    });
    
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong'
    });
  }
}

// Export as default for Vercel
export default handler;