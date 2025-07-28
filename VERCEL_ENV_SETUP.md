# Vercel Environment Variables Setup for Cloud SQL Connector

## Required Environment Variables

To enable the Cloud SQL Connector endpoint (`/api/mcp-connector`), add these environment variables in the Vercel dashboard:

### 1. Database Connection Settings

| Variable | Value | Description |
|----------|-------|-------------|
| `INSTANCE_CONNECTION_NAME` | `your-project:region:instance-name` | Cloud SQL instance connection name |
| `DB_USER` | `your-db-user` | Database username |
| `DB_PASSWORD` | `your-db-password` | Database password |
| `DB_NAME` | `your-database-name` | Database name |

### 2. Google Cloud Service Account

| Variable | Value | Description |
|----------|-------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | See below | Service account JSON (compact format) |

#### Service Account JSON Value:
```json
{"type":"service_account","project_id":"your-project-id","private_key_id":"your-private-key-id","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_CONTENT\n-----END PRIVATE KEY-----\n","client_email":"your-service-account@your-project.iam.gserviceaccount.com","client_id":"your-client-id","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com","universe_domain":"googleapis.com"}
```

## Setup Instructions

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable above for all environments (Development, Preview, Production)
4. Deploy or wait for automatic deployment

## Testing

Once configured, test the connector endpoint:

- Health check: `GET /api/mcp-connector/health`
- List tools: `GET /api/mcp-connector/tools/list`
- Execute query: `POST /api/mcp-connector/tools/call`

The endpoint provides the same security and functionality as the proxy version but uses Cloud SQL Connector for enhanced security.