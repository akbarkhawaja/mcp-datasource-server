#!/bin/bash

# GCP Cloud SQL Setup Script
# Run this script to create staging and production MySQL instances

set -e

# Configuration - Update these values
PROJECT_ID=${PROJECT_ID:-"your-project-id"}
REGION=${REGION:-"us-central1"}
STAGING_INSTANCE_NAME="mcp-staging-mysql"
PRODUCTION_INSTANCE_NAME="mcp-production-mysql"

echo "🚀 Setting up GCP Cloud SQL instances for MCP Datasource Server"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Check if gcloud is installed and authenticated
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Not authenticated with gcloud. Please run 'gcloud auth login'"
    exit 1
fi

# Set the project
echo "🔧 Setting GCP project to $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable sqladmin.googleapis.com
gcloud services enable servicenetworking.googleapis.com

# Create staging instance
echo "🏗️  Creating staging Cloud SQL instance: $STAGING_INSTANCE_NAME"
if gcloud sql instances describe $STAGING_INSTANCE_NAME &>/dev/null; then
    echo "⚠️  Staging instance already exists, skipping creation"
else
    gcloud sql instances create $STAGING_INSTANCE_NAME \
        --database-version=MYSQL_8_0 \
        --tier=db-f1-micro \
        --region=$REGION \
        --storage-type=SSD \
        --storage-size=10GB \
        --backup-start-time=03:00 \
        --enable-bin-log \
        --deletion-protection
fi

# Create production instance
echo "🏗️  Creating production Cloud SQL instance: $PRODUCTION_INSTANCE_NAME"
if gcloud sql instances describe $PRODUCTION_INSTANCE_NAME &>/dev/null; then
    echo "⚠️  Production instance already exists, skipping creation"
else
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
fi

# Wait for instances to be ready
echo "⏳ Waiting for instances to be ready..."
gcloud sql instances patch $STAGING_INSTANCE_NAME --quiet
gcloud sql instances patch $PRODUCTION_INSTANCE_NAME --quiet

# Create databases
echo "🗄️  Creating databases..."
gcloud sql databases create staging_database --instance=$STAGING_INSTANCE_NAME --quiet || echo "Database might already exist"
gcloud sql databases create production_database --instance=$PRODUCTION_INSTANCE_NAME --quiet || echo "Database might already exist"

# Generate secure passwords
STAGING_PASSWORD=$(openssl rand -base64 32)
PRODUCTION_PASSWORD=$(openssl rand -base64 32)

# Create readonly users
echo "👤 Creating readonly users..."
gcloud sql users create readonly_staging_user \
    --instance=$STAGING_INSTANCE_NAME \
    --password="$STAGING_PASSWORD" \
    --quiet || echo "User might already exist"

gcloud sql users create readonly_production_user \
    --instance=$PRODUCTION_INSTANCE_NAME \
    --password="$PRODUCTION_PASSWORD" \
    --quiet || echo "User might already exist"

# Get your current IP for initial access
YOUR_IP=$(curl -s ifconfig.me 2>/dev/null || echo "0.0.0.0")

# Configure network access (add your IP and common Vercel IPs)
echo "🌐 Configuring network access..."
gcloud sql instances patch $STAGING_INSTANCE_NAME \
    --authorized-networks="$YOUR_IP/32,76.76.19.0/24,76.223.126.0/24" \
    --quiet

gcloud sql instances patch $PRODUCTION_INSTANCE_NAME \
    --authorized-networks="$YOUR_IP/32,76.76.19.0/24,76.223.126.0/24" \
    --quiet

# Get connection details
echo "📋 Getting connection details..."
STAGING_IP=$(gcloud sql instances describe $STAGING_INSTANCE_NAME --format="value(ipAddresses[0].ipAddress)")
PRODUCTION_IP=$(gcloud sql instances describe $PRODUCTION_INSTANCE_NAME --format="value(ipAddresses[0].ipAddress)")

# Create environment files with the actual values
echo "📝 Creating environment configuration files..."

cat > .env.staging.generated << EOF
# Generated Staging Environment Variables
NODE_ENV=staging

# GCP Cloud SQL Staging Database Configuration
PUBLIC_DB_HOST=$STAGING_IP
PUBLIC_DB_USER=readonly_staging_user
PUBLIC_DB_PASSWORD=$STAGING_PASSWORD
PUBLIC_DB_NAME=staging_database
PUBLIC_DB_PORT=3306

# Generate a secure API key for staging
PUBLIC_API_KEY=$(openssl rand -hex 32)

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=5

# Connection Pool Settings
DB_CONNECTION_LIMIT=10
DB_ACQUIRE_TIMEOUT=60000
DB_TIMEOUT=30000
DB_RECONNECT=true
EOF

cat > .env.production.generated << EOF
# Generated Production Environment Variables
NODE_ENV=production

# GCP Cloud SQL Production Database Configuration
PUBLIC_DB_HOST=$PRODUCTION_IP
PUBLIC_DB_USER=readonly_production_user
PUBLIC_DB_PASSWORD=$PRODUCTION_PASSWORD
PUBLIC_DB_NAME=production_database
PUBLIC_DB_PORT=3306

# Generate a secure API key for production
PUBLIC_API_KEY=$(openssl rand -hex 32)

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10

# Connection Pool Settings
DB_CONNECTION_LIMIT=20
DB_ACQUIRE_TIMEOUT=60000
DB_TIMEOUT=30000
DB_RECONNECT=true
EOF

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Summary:"
echo "  Staging Instance: $STAGING_INSTANCE_NAME"
echo "  Staging IP: $STAGING_IP"
echo "  Production Instance: $PRODUCTION_INSTANCE_NAME"
echo "  Production IP: $PRODUCTION_IP"
echo ""
echo "📁 Environment files created:"
echo "  .env.staging.generated"
echo "  .env.production.generated"
echo ""
echo "🔐 Next steps:"
echo "1. Review the generated environment files"
echo "2. Copy them to .env.staging and .env.production"
echo "3. Test database connections"
echo "4. Configure readonly user permissions (see docs/GCP_CLOUD_SQL_SETUP.md)"
echo "5. Set up Vercel environment variables"
echo ""
echo "⚠️  Important: Store the passwords securely and remove the .generated files after copying!"