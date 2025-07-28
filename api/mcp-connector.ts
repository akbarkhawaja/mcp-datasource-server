import { VercelRequest, VercelResponse } from '@vercel/node';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import mysql from 'mysql2/promise';
import cors from 'cors';

// CORS configuration for public access
const corsOptions = {
  origin: '*',
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

// Cloud SQL Connector instance
let connector: Connector | null = null;

function getConnector() {
  if (!connector) {
    connector = new Connector();
  }
  return connector;
}

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

// API Key authentication
function authenticateRequest(req: VercelRequest): boolean {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return true; // No API key required if not set
  
  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  return providedKey === apiKey;
}

// Create database connection using Cloud SQL Connector
async function createConnection() {
  const connector = getConnector();
  
  // Get connection configuration
  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME || 'fresh-analytics-326706:us-central1:analytics-db';
  
  const clientOpts = await connector.getOptions({
    instanceConnectionName,
    ipType: IpAddressTypes.PUBLIC,
  });

  const connection = await mysql.createConnection({
    ...clientOpts,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  return connection;
}

// Execute safe query
async function executeSafeQuery(query: string, limit: number = 50): Promise<any> {
  // Enhanced validation for public access
  const trimmed = query.trim().toUpperCase();
  
  // Only allow very specific, safe queries
  const allowedPatterns = [
    /^SHOW TABLES$/,
    /^SHOW DATABASES$/,
    /^SELECT 1$/,
    /^SELECT \d+$/,
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

  const connection = await createConnection();
  
  try {
    const [results] = await connection.execute(query);
    const resultsArray = Array.isArray(results) ? results : [results];
    const limitedResults = resultsArray.slice(0, limit);
    
    return {
      success: true,
      data: {
        results: limitedResults,
        rowCount: limitedResults.length,
        query: query,
        truncated: resultsArray.length > limit,
        timestamp: new Date().toISOString(),
        connection: 'Cloud SQL Connector'
      }
    };
  } finally {
    await connection.end();
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS
  return new Promise((resolve) => {
    cors(corsOptions)(req, res, async () => {
      try {
        const clientIp = req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || 'unknown';
        
        // Rate limiting
        if (!checkRateLimit(clientIp)) {
          res.status(429).json({ error: 'Rate limit exceeded' });
          return resolve(res);
        }
        
        // Authentication
        if (!authenticateRequest(req)) {
          res.status(401).json({ error: 'Authentication required' });
          return resolve(res);
        }

        const { pathname } = new URL(req.url!, `http://${req.headers.host}`);

        if (pathname === '/api/mcp-connector/health' || pathname === '/api/health') {
          try {
            const connection = await createConnection();
            await connection.execute('SELECT 1');
            await connection.end();
            
            res.status(200).json({
              status: 'healthy',
              timestamp: new Date().toISOString(),
              version: '1.0.0',
              message: 'MCP Datasource Server (Cloud SQL Connector)',
              connection: 'Cloud SQL Connector'
            });
          } catch (error) {
            res.status(500).json({
              status: 'unhealthy',
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : 'Database connection failed'
            });
          }
          return resolve(res);
        }

        if (pathname === '/api/mcp-connector/tools/list' || pathname === '/api/mcp/tools/list') {
          const tools = [
            {
              name: 'health_check',
              description: 'Check server health via Cloud SQL Connector',
              inputSchema: {
                type: 'object',
                properties: {},
                required: []
              }
            },
            {
              name: 'query_database',
              description: 'Execute safe database queries via Cloud SQL Connector',
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
          ];
          
          res.status(200).json({ tools });
          return resolve(res);
        }

        if ((pathname === '/api/mcp-connector/tools/call' || pathname === '/api/mcp/tools/call') && req.method === 'POST') {
          const { name, arguments: args } = req.body;

          if (name === 'health_check') {
            try {
              const connection = await createConnection();
              await connection.execute('SELECT 1');
              await connection.end();
              
              res.status(200).json({
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    message: 'MCP Datasource Server (Cloud SQL Connector) is running',
                    connection: 'Cloud SQL Connector'
                  }, null, 2)
                }]
              });
            } catch (error) {
              res.status(200).json({
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Database connection failed',
                    connection: 'Cloud SQL Connector'
                  }, null, 2)
                }],
                isError: true
              });
            }
            return resolve(res);
          }

          if (name === 'query_database') {
            try {
              const query = args?.query;
              const limit = Math.min(args?.limit || 50, 100);

              if (!query || typeof query !== 'string') {
                throw new Error('Query parameter is required and must be a string');
              }

              const result = await executeSafeQuery(query, limit);
              
              res.status(200).json({
                content: [{
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }]
              });
            } catch (error) {
              res.status(200).json({
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    connection: 'Cloud SQL Connector'
                  }, null, 2)
                }],
                isError: true
              });
            }
            return resolve(res);
          }

          res.status(404).json({ error: 'Tool not found' });
          return resolve(res);
        }

        res.status(404).json({ error: 'Not found', message: 'Endpoint not found' });
        resolve(res);

      } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ 
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        resolve(res);
      }
    });
  });
}