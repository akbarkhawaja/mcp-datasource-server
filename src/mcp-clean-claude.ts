#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env file manually
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const envFile = readFileSync(envPath, 'utf8');
    
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key] = valueParts.join('=');
        }
      }
    }
  } catch (error) {
    // .env file not found or unreadable, continue with existing env vars
  }
}

// Load environment variables
loadEnv();

let pool: mysql.Pool | null = null;

// Initialize MySQL connection
async function initMySQL() {
  try {
    if (!process.env.GCS_DB_HOST || !process.env.GCS_DB_NAME || 
        !process.env.GCS_DB_USER || !process.env.GCS_DB_PASSWORD) {
      return false;
    }

    pool = mysql.createPool({
      host: process.env.GCS_DB_HOST,
      port: parseInt(process.env.GCS_DB_PORT || '3306', 10),
      user: process.env.GCS_DB_USER,
      password: process.env.GCS_DB_PASSWORD,
      database: process.env.GCS_DB_NAME,
      connectionLimit: 5,
      charset: 'utf8mb4',
      ssl: process.env.GCS_DB_SSL === 'true' ? {
        rejectUnauthorized: true,
        ca: process.env.GCS_DB_SSL_CA ? readFileSync(process.env.GCS_DB_SSL_CA) : undefined,
        cert: process.env.GCS_DB_SSL_CERT ? readFileSync(process.env.GCS_DB_SSL_CERT) : undefined,
        key: process.env.GCS_DB_SSL_KEY ? readFileSync(process.env.GCS_DB_SSL_KEY) : undefined
      } : undefined,
    });
    
    // Test connection
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    return false;
  }
}

// Execute MySQL query
async function executeQuery(query: string, limit: number = 100): Promise<any> {
  if (!pool) throw new Error('Database not connected');
  
  // Basic validation - only allow readonly queries
  const trimmed = query.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('SHOW') && 
      !trimmed.startsWith('DESCRIBE') && !trimmed.startsWith('DESC')) {
    throw new Error('Only SELECT, SHOW, DESCRIBE queries are allowed');
  }
  
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(query);
    let results = Array.isArray(rows) ? rows as any[] : [];
    
    // Apply limit
    if (results.length > limit) {
      results = results.slice(0, limit);
    }
    
    return {
      success: true,
      data: {
        results,
        rowCount: results.length,
        query: query,
        truncated: results.length === limit
      }
    };
  } finally {
    connection.release();
  }
}

const server = new Server(
  {
    name: 'mcp-datasource-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'health_check',
        description: 'Check server health and database connectivity',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'query_mysql',
        description: 'Execute readonly MySQL queries (SELECT, SHOW, DESCRIBE only)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'SQL query to execute'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 100)'
            }
          },
          required: ['query']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'health_check':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'healthy',
              database: pool ? 'connected' : 'disconnected',
              timestamp: new Date().toISOString(),
              server: 'mcp-datasource-server',
              version: '1.0.0'
            }, null, 2)
          }
        ]
      };

    case 'query_mysql':
      try {
        if (!pool) {
          throw new Error('Database not connected');
        }
        
        const query = (args as any)?.query;
        const limit = (args as any)?.limit || 100;
        
        if (!query) {
          throw new Error('Query parameter is required');
        }
        
        const result = await executeQuery(query, limit);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }, null, 2)
            }
          ]
        };
      }
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  // Initialize database first
  await initMySQL();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(() => {
  process.exit(1);
});