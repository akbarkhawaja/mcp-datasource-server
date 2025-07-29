#!/usr/bin/env node

/**
 * Bridge between Claude Desktop (stdio) and Vercel Cloud SQL Connector (HTTP)
 * This allows Claude Desktop to use the live Cloud SQL Connector deployment
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Configuration - Environment-based
const VERCEL_URL = process.env.VERCEL_URL || 'https://your-preview-deployment.vercel.app';
const API_KEY = process.env.BRIDGE_API_KEY || 'your-preview-api-key-here';

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

const server = new Server(
  {
    name: 'mcp-datasource-connector-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools by fetching from Vercel Cloud SQL Connector
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const response = await fetch(`${VERCEL_URL}/api/mcp-connector?action=tools`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { tools: data.tools || [] };
  } catch (error) {
    throw new Error(`Failed to fetch tools: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Call tools by proxying to Vercel Cloud SQL Connector
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const response = await fetch(`${VERCEL_URL}/api/mcp-connector?action=call`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: request.params.name,
        arguments: request.params.arguments,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.content || [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
      isError: data.isError || false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);