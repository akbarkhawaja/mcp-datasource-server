#!/usr/bin/env node

/**
 * Local MCP server using Cloud SQL Auth Proxy
 * This version connects through the proxy (localhost:3307) instead of direct SSL
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables from .env.proxy
try {
  const envPath = resolve(process.cwd(), '.env.proxy');
  const envContent = readFileSync(envPath, 'utf8');
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=');
        process.env[key.trim()] = value.trim();
      }
    }
  });
} catch (error) {
  console.error('Warning: Could not load .env.proxy file');
}

const server = new Server(
  {
    name: 'mcp-datasource-proxy',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Health check tool
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'health_check',
        description: 'Check server and database health via Cloud SQL Proxy',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'query_database',
        description: 'Execute safe database queries via Cloud SQL Proxy',  
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Safe SQL query (SHOW, DESCRIBE, basic SELECT only)',
            },
            limit: {
              type: 'number',
              description: 'Maximum results (max: 1000)',
              maximum: 1000,
            },
          },
          required: ['query'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === 'health_check') {
      // Validate required environment variables
      if (!process.env.GCS_DB_USER || !process.env.GCS_DB_PASSWORD || !process.env.GCS_DB_NAME) {
        throw new Error('Missing required environment variables: GCS_DB_USER, GCS_DB_PASSWORD, GCS_DB_NAME');
      }

      // Test proxy connection
      const connection = await mysql.createConnection({
        host: process.env.GCS_DB_HOST || '127.0.0.1',
        port: parseInt(process.env.GCS_DB_PORT || '3307'),
        user: process.env.GCS_DB_USER,
        password: process.env.GCS_DB_PASSWORD,
        database: process.env.GCS_DB_NAME,
        ssl: undefined
      });

      await connection.execute('SELECT 1');
      await connection.end();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'healthy',
              timestamp: new Date().toISOString(),
              message: 'MCP Datasource Server (Cloud SQL Proxy) is running',
              connection: 'Cloud SQL Auth Proxy (localhost:3307)'
            }, null, 2)
          }
        ]
      };
    }

    if (request.params.name === 'query_database') {
      const query = request.params.arguments?.query;
      const limit = Math.min(Number(request.params.arguments?.limit) || 50, 1000);

      if (!query || typeof query !== 'string') {
        throw new Error('Query parameter is required and must be a string');
      }

      // Basic query validation
      const upperQuery = query.trim().toUpperCase();
      const allowedStarts = ['SELECT', 'SHOW', 'DESCRIBE', 'DESC'];
      const isAllowed = allowedStarts.some(start => upperQuery.startsWith(start));
      
      if (!isAllowed) {
        throw new Error('Only SELECT, SHOW, and DESCRIBE queries are allowed');
      }

      // Validate required environment variables
      if (!process.env.GCS_DB_USER || !process.env.GCS_DB_PASSWORD || !process.env.GCS_DB_NAME) {
        throw new Error('Missing required environment variables: GCS_DB_USER, GCS_DB_PASSWORD, GCS_DB_NAME');
      }

      // Execute query via proxy
      const connection = await mysql.createConnection({
        host: process.env.GCS_DB_HOST || '127.0.0.1',
        port: parseInt(process.env.GCS_DB_PORT || '3307'),
        user: process.env.GCS_DB_USER,
        password: process.env.GCS_DB_PASSWORD,
        database: process.env.GCS_DB_NAME,
        ssl: undefined
      });

      const [results] = await connection.execute(query);
      await connection.end();

      const resultsArray = Array.isArray(results) ? results : [results];
      const limitedResults = resultsArray.slice(0, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: {
                results: limitedResults,
                rowCount: limitedResults.length,
                query: query,
                truncated: resultsArray.length > limit,
                timestamp: new Date().toISOString(),
                connection: 'Cloud SQL Auth Proxy'
              }
            }, null, 2)
          }
        ]
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
            connection: 'Cloud SQL Auth Proxy'
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);