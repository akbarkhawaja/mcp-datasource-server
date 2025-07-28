# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready **MCP Datasource Server** that provides secure, readonly access to MySQL databases through the Model Context Protocol. It supports three deployment modes: local Claude Desktop integration, public Vercel deployment, and HTTP-to-stdio bridge connection.

## Development Commands

### Build and Development
```bash
npm run build          # Compile TypeScript to dist/
npm run typecheck      # Type checking without compilation
npm run lint          # ESLint validation
npm run dev           # Local Vercel development server
```

### MCP Server Modes
```bash
npm run local         # Local MCP server for direct Claude Desktop integration
npm run bridge        # HTTP-to-stdio bridge for connecting local Claude to Vercel deployment
```

### Testing and Validation
```bash
npm test              # Jest tests
node scripts/test-connection.js    # Database connection testing across environments
```

## Architecture Overview

### Three-Tier Deployment Strategy
1. **Local Mode** (`mcp-clean-claude.ts`): Direct stdio MCP server for Claude Desktop
2. **Production Mode** (`mcp-vercel-public.ts`): Serverless function with enhanced security 
3. **Bridge Mode** (`mcp-vercel-bridge.ts`): Connects local Claude Desktop to live Vercel deployment

### Core Security Architecture
The codebase implements **defense-in-depth** with four security layers:

1. **Input Validation** (`src/security/inputValidator.ts`): Joi schemas with strict patterns
2. **Query Validation** (`src/security/queryValidator.ts`): Whitelist approach - only SELECT/SHOW/DESCRIBE allowed
3. **Runtime Security**: Readonly users, connection pooling, timeouts, result limits
4. **Network Security**: API keys, rate limiting, IP restrictions, SSL/TLS

### Database Integration Pattern
- **Connection Manager** (`src/database/index.ts`): Singleton pattern with environment detection
- **MySQL Handler** (`src/database/mysql.ts`): Pooled connections with SSL certificate support
- **Environment Detection**: Automatically switches between `GCS_DB_*` (local) and `PUBLIC_DB_*` (production) variables

## Key Configuration Points

### Environment Variables
- **Local Development**: Uses `GCS_DB_*` prefix for database connection
- **Production/Staging**: Uses `PUBLIC_DB_*` prefix for database connection
- **SSL Certificates**: Supports both file paths and base64-encoded certificates
- **API Security**: `PUBLIC_API_KEY` for authentication (optional but recommended)

### Claude Desktop Integration
The project provides three integration methods in `claude_desktop_config.json`:

1. **Local Server** (recommended for development):
```json
{
  "datasource-server": {
    "command": "wsl",
    "args": ["-e", "bash", "-c", "cd /path && node dist/mcp-clean-claude.js"]
  }
}
```

2. **Bridge to Vercel** (for testing production deployment):
```json
{
  "vercel-datasource-bridge": {
    "command": "wsl", 
    "args": ["-e", "bash", "-c", "cd /path && node dist/mcp-vercel-bridge.js"]
  }
}
```

### Vercel Deployment Configuration
- **API Endpoint**: `/api/mcp.ts` routes to `src/mcp-vercel-public.ts`
- **Function Timeout**: 30 seconds (configurable in `vercel.json`)
- **Environment Variables**: Must be set in Vercel project settings, not globally
- **SSL Certificates**: Use base64-encoded format (`DB_SSL_*_BASE64` variables)

## Development Workflow

### Adding New Database Tools
1. **Define Tool Schema** in `src/tools/mysql.ts`
2. **Implement Validation** in `src/security/queryValidator.ts` if needed
3. **Add Input Validation** in `src/security/inputValidator.ts`
4. **Register Tool** in both `mcp-clean-claude.ts` and `mcp-vercel-public.ts`
5. **Update Documentation** in README.md

### Security Validation Process
- **Query Patterns**: Use regex whitelist in `queryValidator.ts`
- **Input Sanitization**: Joi schemas in `inputValidator.ts` 
- **Result Limits**: Different limits for local (1000) vs public (100) deployment
- **Rate Limiting**: 10 requests/minute per IP for public deployment

### Testing Database Connections
Use `scripts/test-connection.js` to validate:
- Local database connectivity with `GCS_DB_*` variables
- Production database connectivity with `PUBLIC_DB_*` variables  
- SSL certificate configuration
- Connection pooling behavior

### Debugging MCP Communication
- **stdio Issues**: Check for output contamination in `mcp-clean-claude.ts`
- **JSON-RPC Errors**: Enable debug logging in bridge mode
- **Database Timeouts**: Check SSL certificate configuration and IP whitelisting
- **Rate Limiting**: Monitor winston logs for rate limit violations

## Important Implementation Details

### Database Connection Management
- **Environment Detection**: Automatically selects connection config based on available env variables
- **SSL Configuration**: Supports both file-based and base64-encoded certificates
- **Connection Pooling**: Configurable limits with automatic reconnection
- **Health Monitoring**: Built-in health checks with database connectivity validation

### Security Query Validation
The `queryValidator.ts` implements sophisticated SQL validation:
- **Whitelist Pattern Matching**: Only specific query patterns allowed
- **Function Blacklisting**: Prevents dangerous MySQL functions (LOAD_FILE, SYSTEM, etc.)
- **Multi-statement Prevention**: Blocks semicolon-separated queries
- **Injection Pattern Detection**: Regex patterns for common SQL injection attempts

### Multi-Environment Support
- **Local Development**: Direct database connection with `GCS_DB_*` variables
- **Staging**: Cloud SQL with `PUBLIC_DB_*` variables and SSL certificates
- **Production**: Same as staging but with production database instance
- **Bridge Mode**: Local Claude Desktop connecting to live Vercel deployment

### Logging and Monitoring
- **Winston Logger**: Structured JSON logging with security event tracking
- **Security Events**: Query attempts, rate limits, authentication failures
- **Error Context**: Comprehensive error information with request context
- **Performance Metrics**: Query execution times and connection pool status