# Cloud SQL SSL Certificate Setup Guide

This guide explains how to configure SSL certificates for secure connections to Google Cloud SQL MySQL instances.

## Prerequisites

- Google Cloud Project with Cloud SQL instance
- gcloud CLI installed and authenticated
- MCP Datasource Server project

## Step 1: Create Client Certificates

### Using Google Cloud Console

1. **Navigate to Cloud SQL**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to SQL → Your Instance → Connections → Client Certificates

2. **Create Client Certificate**:
   - Click "Create Client Certificate"
   - Enter a name (e.g., `mcp-client-cert`)
   - Click "Create"

3. **Download Certificates**:
   - Download all three files:
     - `client-cert.pem` (Client Certificate)
     - `client-key.pem` (Client Private Key)
     - `server-ca.pem` (Server CA Certificate)

### Using gcloud CLI

```bash
# Set your instance details
export PROJECT_ID="your-project-id"
export INSTANCE_NAME="your-instance-name"
export CERT_NAME="mcp-client-cert"

# Create client certificate
gcloud sql ssl-certs create $CERT_NAME client-key.pem \
    --instance=$INSTANCE_NAME \
    --project=$PROJECT_ID

# Download server CA certificate
gcloud sql instances describe $INSTANCE_NAME \
    --format="value(serverCaCert.cert)" > server-ca.pem
```

## Step 2: Secure Certificate Storage

### For Local Development

```bash
# Create certificates directory
mkdir -p ~/.config/mcp-datasource/certs

# Move certificates to secure location
mv client-cert.pem ~/.config/mcp-datasource/certs/
mv client-key.pem ~/.config/mcp-datasource/certs/
mv server-ca.pem ~/.config/mcp-datasource/certs/

# Set proper permissions (important for security)
chmod 600 ~/.config/mcp-datasource/certs/client-key.pem
chmod 644 ~/.config/mcp-datasource/certs/client-cert.pem
chmod 644 ~/.config/mcp-datasource/certs/server-ca.pem
```

### For Production/Staging (Vercel)

Store certificates as environment variables (base64 encoded):

```bash
# Encode certificates for environment variables
cat ~/.config/mcp-datasource/certs/server-ca.pem | base64 -w 0
cat ~/.config/mcp-datasource/certs/client-cert.pem | base64 -w 0
cat ~/.config/mcp-datasource/certs/client-key.pem | base64 -w 0
```

## Step 3: Configure Environment Variables

### Local Development (.env)

```bash
# SSL Configuration for Local Development
GCS_DB_SSL=true
GCS_DB_SSL_CA=/home/username/.config/mcp-datasource/certs/server-ca.pem
GCS_DB_SSL_CERT=/home/username/.config/mcp-datasource/certs/client-cert.pem
GCS_DB_SSL_KEY=/home/username/.config/mcp-datasource/certs/client-key.pem
```

### Staging Environment (.env.staging)

```bash
# SSL Configuration for Staging
PUBLIC_DB_SSL=true
PUBLIC_DB_SSL_CA=/path/to/certs/server-ca.pem
PUBLIC_DB_SSL_CERT=/path/to/certs/client-cert.pem
PUBLIC_DB_SSL_KEY=/path/to/certs/client-key.pem
```

### Production Environment (Vercel)

Set environment variables in Vercel dashboard or CLI:

```bash
# Using Vercel CLI
vercel env add PUBLIC_DB_SSL
# Enter: true

vercel env add PUBLIC_DB_SSL_CA_BASE64
# Enter: <base64-encoded-server-ca.pem>

vercel env add PUBLIC_DB_SSL_CERT_BASE64
# Enter: <base64-encoded-client-cert.pem>

vercel env add PUBLIC_DB_SSL_KEY_BASE64
# Enter: <base64-encoded-client-key.pem>
```

## Step 4: Update Code for Base64 Certificates (Vercel)

For Vercel deployment, certificates need to be decoded from base64 environment variables:

```typescript
// In your database connection code
const sslConfig = process.env.PUBLIC_DB_SSL === 'true' ? {
  rejectUnauthorized: true,
  ca: process.env.PUBLIC_DB_SSL_CA_BASE64 
    ? Buffer.from(process.env.PUBLIC_DB_SSL_CA_BASE64, 'base64').toString()
    : process.env.PUBLIC_DB_SSL_CA,
  cert: process.env.PUBLIC_DB_SSL_CERT_BASE64
    ? Buffer.from(process.env.PUBLIC_DB_SSL_CERT_BASE64, 'base64').toString()
    : process.env.PUBLIC_DB_SSL_CERT,
  key: process.env.PUBLIC_DB_SSL_KEY_BASE64
    ? Buffer.from(process.env.PUBLIC_DB_SSL_KEY_BASE64, 'base64').toString()
    : process.env.PUBLIC_DB_SSL_KEY
} : undefined;
```

## Step 5: Test SSL Connection

### Using mysql CLI

```bash
mysql -h YOUR_INSTANCE_IP \
  -u YOUR_USER \
  -p \
  --ssl-ca=~/.config/mcp-datasource/certs/server-ca.pem \
  --ssl-cert=~/.config/mcp-datasource/certs/client-cert.pem \
  --ssl-key=~/.config/mcp-datasource/certs/client-key.pem \
  YOUR_DATABASE
```

### Using MCP Test Script

```bash
# Test staging connection
npm run test:connection staging

# Test production connection  
npm run test:connection production
```

## Step 6: Verify SSL Status

Once connected, verify SSL is working:

```sql
-- Check SSL status
SHOW STATUS LIKE 'Ssl_cipher';

-- Should return a non-empty cipher name
-- Example: Ssl_cipher | AES256-SHA
```

## Security Best Practices

### Certificate Security
- **Never commit certificates to git**
- **Use restrictive file permissions (600 for private keys)**
- **Rotate certificates regularly (every 12 months)**
- **Use separate certificates for staging and production**

### Environment Variables
- **Use base64 encoding for serverless deployments**
- **Store certificates in secure secret management**
- **Audit access to certificate environment variables**

### Network Security
- **Combine SSL with IP whitelisting**
- **Use private IPs when possible**
- **Monitor connection logs for unauthorized access**

## Troubleshooting

### Common SSL Errors

1. **SSL connection error**:
   ```
   Error: SSL connection error: unable to get local issuer certificate
   ```
   - **Solution**: Check server CA certificate path
   - **Verify**: Certificate files exist and are readable

2. **Certificate verify failed**:
   ```
   Error: certificate verify failed: unable to get local issuer certificate
   ```
   - **Solution**: Ensure `rejectUnauthorized: true` and proper CA certificate
   - **Check**: Server CA certificate is valid and matches the instance

3. **Access denied for user**:
   ```
   Error: Access denied for user 'user'@'host' (using password: YES)
   ```
   - **Solution**: SSL certificate doesn't grant database access - check user permissions
   - **Verify**: User exists and has proper database permissions

### Debugging Steps

1. **Check certificate files**:
   ```bash
   openssl x509 -in client-cert.pem -text -noout
   openssl rsa -in client-key.pem -check
   openssl x509 -in server-ca.pem -text -noout
   ```

2. **Test without SSL first**:
   - Temporarily set `SSL=false`
   - Verify basic connectivity
   - Re-enable SSL after confirming base connection works

3. **Check Cloud SQL logs**:
   - Navigate to Cloud SQL → Logs in Google Cloud Console
   - Look for SSL/TLS related errors
   - Check for certificate validation failures

## Certificate Renewal

Set up automatic certificate renewal:

```bash
# Add to crontab for automatic renewal (every 11 months)
0 0 1 */11 * /path/to/your/renewal-script.sh

# renewal-script.sh
#!/bin/bash
gcloud sql ssl-certs create mcp-client-cert-$(date +%Y%m%d) client-key-new.pem \
    --instance=$INSTANCE_NAME --project=$PROJECT_ID

# Update environment variables with new certificates
# Delete old certificates after verification
```

## Production Checklist

- [ ] Client certificates created and downloaded
- [ ] Certificates stored securely with proper permissions
- [ ] Environment variables configured for all environments
- [ ] SSL connection tested successfully
- [ ] Certificate expiration monitoring set up
- [ ] Backup certificates stored securely
- [ ] Documentation updated for team