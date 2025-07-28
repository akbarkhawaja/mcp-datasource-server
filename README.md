# MCP Datasource Server

A secure, production-ready Model Context Protocol (MCP) server that provides readonly access to MySQL databases. Designed for integration with Claude Desktop and public deployment on Vercel.

## Features

- 🔐 **Security-First**: Readonly database access with comprehensive query validation
- 🚀 **Vercel Ready**: Optimized for serverless deployment
- 🖥️ **Claude Desktop**: Local integration support
- ⚡ **Rate Limited**: Built-in protection against abuse
- 🛡️ **Input Validation**: SQL injection prevention and query sanitization
- 🎯 **Production Ready**: Monitoring, logging, and error handling

## Quick Start

### Local Development (Claude Desktop)

1. **Setup Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your local database credentials
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build**:
   ```bash
   npm run build
   ```

4. **Configure Claude Desktop** (`%APPDATA%\\Claude\\claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "datasource-server": {
         "command": "wsl",
         "args": [
           "-e", "bash", "-c",
           "cd /path/to/mcp-datasource-server && node dist/mcp-clean-claude.js"
         ]
       }
     }
   }
   ```

### Production Deployment (Vercel)

1. **Setup GCP Cloud SQL**:
   - Create staging/production database
   - Configure readonly user
   - Whitelist Vercel IPs

2. **Deploy to Vercel**:
   ```bash
   npm install -g vercel
   vercel login
   
   # Set environment variables
   vercel env add PUBLIC_DB_HOST
   vercel env add PUBLIC_DB_USER
   vercel env add PUBLIC_DB_PASSWORD
   vercel env add PUBLIC_DB_NAME
   vercel env add PUBLIC_API_KEY
   
   # Deploy
   vercel --prod
   ```

3. **Users can then add** to their Claude Desktop:
   ```json
   {
     "mcpServers": {
       "public-datasource": {
         "command": "curl",
         "args": [
           "-X", "POST",
           "https://your-deployment.vercel.app/api/mcp/tools/call",
           "-H", "Content-Type: application/json",
           "-H", "X-API-Key: your-api-key"
         ]
       }
     }
   }
   ```

## Available Tools

- **health_check**: Check server and database status
- **query_mysql**: Execute safe readonly MySQL queries (SELECT, SHOW, DESCRIBE only)

## Security Features

- ✅ Readonly database user
- ✅ Query validation and sanitization
- ✅ SQL injection prevention
- ✅ Rate limiting (10 requests/minute per IP)
- ✅ Result size limits (max 100 rows)
- ✅ API key authentication (optional)
- ✅ Input validation with Joi schemas

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/mcp/tools/list` - List available tools
- `POST /api/mcp/tools/call` - Execute tool calls

## Development

```bash
# Build
npm run build

# Type checking
npm run typecheck

# Lint
npm run lint

# Local development with Vercel
npm run dev

# Local MCP server (for Claude Desktop)
npm run local
```

## Environment Variables

### Local Development
- `GCS_DB_HOST` - Local MySQL host
- `GCS_DB_USER` - Local MySQL user
- `GCS_DB_PASSWORD` - Local MySQL password
- `GCS_DB_NAME` - Local MySQL database
- `GCS_DB_PORT` - Local MySQL port (default: 3306)

### Production/Staging
- `PUBLIC_DB_HOST` - Database host (GCP Cloud SQL)
- `PUBLIC_DB_USER` - Readonly database user
- `PUBLIC_DB_PASSWORD` - Database password
- `PUBLIC_DB_NAME` - Database name
- `PUBLIC_DB_PORT` - Database port (default: 3306)
- `PUBLIC_API_KEY` - API key for access control (optional)

## Architecture

```
├── api/
│   └── mcp.ts                 # Vercel API endpoint
├── src/
│   ├── database/
│   │   ├── index.ts          # Database manager
│   │   └── mysql.ts          # MySQL connection handler
│   ├── security/
│   │   ├── inputValidator.ts # Input validation with Joi
│   │   └── queryValidator.ts # SQL query validation
│   ├── tools/
│   │   └── mysql.ts          # MySQL MCP tools
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   ├── utils/
│   │   └── logger.ts         # Logging utilities
│   ├── mcp-clean-claude.ts   # Local Claude Desktop server
│   └── mcp-vercel-public.ts  # Vercel production server
├── package.json
├── tsconfig.json
└── vercel.json
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details