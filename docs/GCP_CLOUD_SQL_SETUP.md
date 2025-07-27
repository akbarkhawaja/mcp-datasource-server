# GCP Cloud SQL Setup Guide

## Prerequisites

1. Google Cloud Project with billing enabled
2. Cloud SQL Admin API enabled
3. gcloud CLI installed and authenticated

## Step 1: Create Cloud SQL Instance

```bash
# Set your project variables
export PROJECT_ID="your-project-id"
export REGION="us-central1"  # Choose your preferred region
export STAGING_INSTANCE_NAME="mcp-staging-mysql"
export PRODUCTION_INSTANCE_NAME="mcp-production-mysql"

# Create staging instance
gcloud sql instances create $STAGING_INSTANCE_NAME \
    --database-version=MYSQL_8_0 \
    --tier=db-f1-micro \
    --region=$REGION \
    --storage-type=SSD \
    --storage-size=10GB \
    --backup-start-time=03:00 \
    --enable-bin-log \
    --deletion-protection

# Create production instance (larger tier)
gcloud sql instances create $PRODUCTION_INSTANCE_NAME \
    --database-version=MYSQL_8_0 \
    --tier=db-n1-standard-1 \
    --region=$REGION \
    --storage-type=SSD \
    --storage-size=20GB \
    --backup-start-time=03:00 \
    --enable-bin-log \
    --deletion-protection \
    --availability-type=REGIONAL
```

## Step 2: Create Databases

```bash
# Create staging database
gcloud sql databases create staging_database \
    --instance=$STAGING_INSTANCE_NAME

# Create production database
gcloud sql databases create production_database \
    --instance=$PRODUCTION_INSTANCE_NAME
```

## Step 3: Create Readonly Users

```bash
# Create staging readonly user
gcloud sql users create readonly_staging_user \
    --instance=$STAGING_INSTANCE_NAME \
    --password="$(openssl rand -base64 32)"

# Create production readonly user
gcloud sql users create readonly_production_user \
    --instance=$PRODUCTION_INSTANCE_NAME \
    --password="$(openssl rand -base64 32)"
```

## Step 4: Configure Network Access

### Option A: Public IP with Authorized Networks (Recommended for Vercel)

```bash
# Get Vercel IP ranges (these may change, check Vercel docs)
# Add your current IP for testing
export YOUR_IP=$(curl -s ifconfig.me)

# Configure staging instance
gcloud sql instances patch $STAGING_INSTANCE_NAME \
    --authorized-networks="$YOUR_IP/32,76.76.19.0/24,76.223.126.0/24"

# Configure production instance
gcloud sql instances patch $PRODUCTION_INSTANCE_NAME \
    --authorized-networks="$YOUR_IP/32,76.76.19.0/24,76.223.126.0/24"
```

### Option B: Private IP with VPC (More Secure)

```bash
# Enable private services access
gcloud services enable servicenetworking.googleapis.com

# Reserve IP range for private connection
gcloud compute addresses create google-managed-services-default \
    --global \
    --purpose=VPC_PEERING \
    --prefix-length=16 \
    --network=default

# Create private connection
gcloud services vpc-peerings connect \
    --service=servicenetworking.googleapis.com \
    --ranges=google-managed-services-default \
    --network=default

# Create instances with private IP
gcloud sql instances patch $STAGING_INSTANCE_NAME \
    --network=default \
    --no-assign-ip
```

## Step 5: Grant Readonly Permissions

Connect to each instance and run:

```sql
-- Connect to staging instance
mysql -h [STAGING_INSTANCE_IP] -u root -p

-- Grant readonly permissions
GRANT SELECT, SHOW DATABASES, SHOW VIEW ON *.* TO 'readonly_staging_user'@'%';
GRANT SELECT ON information_schema.* TO 'readonly_staging_user'@'%';
GRANT SELECT ON performance_schema.* TO 'readonly_staging_user'@'%';
FLUSH PRIVILEGES;

-- Test the user
SHOW GRANTS FOR 'readonly_staging_user'@'%';
```

Repeat for production with `readonly_production_user`.

## Step 6: Get Connection Details

```bash
# Get staging instance details
gcloud sql instances describe $STAGING_INSTANCE_NAME

# Get production instance details
gcloud sql instances describe $PRODUCTION_INSTANCE_NAME

# The important values you need:
# - ipAddresses[0].ipAddress (public IP)
# - connectionName (for private IP: project:region:instance)
```

## Step 7: Update Environment Variables

Update your `.env.staging` and `.env.production` files with:

```bash
# Staging
PUBLIC_DB_HOST=<staging-instance-ip>
PUBLIC_DB_USER=readonly_staging_user
PUBLIC_DB_PASSWORD=<staging-user-password>
PUBLIC_DB_NAME=staging_database

# Production
PUBLIC_DB_HOST=<production-instance-ip>
PUBLIC_DB_USER=readonly_production_user
PUBLIC_DB_PASSWORD=<production-user-password>
PUBLIC_DB_NAME=production_database
```

## Step 8: Test Connection

```bash
# Test staging connection
mysql -h <staging-instance-ip> -u readonly_staging_user -p staging_database

# Test production connection
mysql -h <production-instance-ip> -u readonly_production_user -p production_database
```

## Security Best Practices

1. **Use strong passwords**: Generate with `openssl rand -base64 32`
2. **Limit IP access**: Only allow Vercel IPs and your development IPs
3. **Enable SSL**: Force SSL connections in production
4. **Regular backups**: Automated daily backups are enabled
5. **Monitoring**: Set up Cloud SQL insights and alerts
6. **Least privilege**: Readonly users have minimal permissions

## Troubleshooting

### Connection Issues
- Verify IP is in authorized networks
- Check firewall rules
- Ensure Cloud SQL Admin API is enabled

### Permission Issues
- Verify readonly user permissions
- Check if user can access specific databases
- Test with mysql command line first

### Performance Issues
- Monitor connection pool usage
- Adjust connection limits based on Vercel function concurrency
- Consider upgrading instance tier if needed

## Cost Optimization

- **Staging**: Use `db-f1-micro` (shared CPU, minimal cost)
- **Production**: Use `db-n1-standard-1` or higher based on needs
- **Storage**: Start with 10-20GB, auto-resize enabled
- **Backups**: Keep 7-day retention for staging, 30-day for production