#!/usr/bin/env node

/**
 * Bridge between Claude Desktop (stdio) and Vercel MCP server (HTTP)
 * This allows Claude Desktop to use the live Vercel deployment
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Configuration - Environment-based
const VERCEL_URL = process.env.VERCEL_URL || 'https://your-deployment-url.vercel.app';
const API_KEY = process.env.BRIDGE_API_KEY || 'your-api-key-here';

// Completely silence stdout and stderr except for MCP JSON-RPC
const originalStdout = process.stdout.write;
const originalStderr = process.stderr.write;

// Override stdout to only allow JSON-RPC messages
process.stdout.write = function(chunk: any, encoding?: any, callback?: any): boolean {
  // Only allow JSON-RPC messages (must start with { and contain jsonrpc)
  const str = chunk.toString();
  if (str.trim().startsWith('{') && str.includes('"jsonrpc"')) {
    return originalStdout.call(process.stdout, chunk, encoding, callback);
  }
  // Suppress all other stdout
  if (typeof encoding === 'function') {
    encoding();
  } else if (callback) {
    callback();
  }
  return true;
};

// Completely silence stderr to prevent any contamination
process.stderr.write = function(chunk: any, encoding?: any, callback?: any): boolean {
  if (typeof encoding === 'function') {
    encoding();
  } else if (callback) {
    callback();
  }
  return true;
};

// Load environment variables manually (like mcp-clean-claude.ts)
import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envPath = resolve(process.cwd(), '.env');
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
  // .env file might not exist, that's ok
}

async function makeHttpRequest(endpoint: string, data?: any): Promise<any> {
  const https = await import('https');
  const url = new URL(`${VERCEL_URL}${endpoint}`);
  
  const postData = data ? JSON.stringify(data) : undefined;
  
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(body);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage} - ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

async function main() {
  const server = new Server(
    {
      name: 'vercel-datasource-bridge',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools by forwarding to Vercel
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const response = await makeHttpRequest('/api/mcp/tools/list');
      return {
        tools: response.tools || []
      };
    } catch (error) {
      return {
        tools: []
      };
    }
  });

  // Call tools by forwarding to Vercel
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const response = await makeHttpRequest('/api/mcp/tools/call', {
        name: request.params.name,
        arguments: request.params.arguments || {}
      });

      return {
        content: response.content || [
          {
            type: "text",
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Handle uncaught errors silently
process.on('uncaughtException', () => process.exit(1));
process.on('unhandledRejection', () => process.exit(1));

main().catch(() => process.exit(1));