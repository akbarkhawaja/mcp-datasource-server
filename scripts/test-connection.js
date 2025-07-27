#!/usr/bin/env node

// Test database connection script
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment based on argument
const env = process.argv[2] || 'local';
let envPath;

if (env === 'local') {
  envPath = join(__dirname, '..', '.env');
} else {
  envPath = join(__dirname, '..', `.env.${env}`);
}

console.log(`🔌 Testing ${env} database connection...`);
console.log(`📁 Loading environment from: ${envPath}`);

dotenv.config({ path: envPath });

// Use GCS_ prefix for local, PUBLIC_ for staging/production
const isLocal = env === 'local';
const prefix = isLocal ? 'GCS_DB_' : 'PUBLIC_DB_';

const config = {
  host: process.env[`${prefix}HOST`],
  user: process.env[`${prefix}USER`],
  password: process.env[`${prefix}PASSWORD`],
  database: process.env[`${prefix}NAME`],
  port: parseInt(process.env[`${prefix}PORT`] || '3306'),
  ssl: process.env[`${prefix}SSL`] === 'true' ? {
    rejectUnauthorized: true,
    ca: process.env[`${prefix}SSL_CA`] ? fs.readFileSync(process.env[`${prefix}SSL_CA`]) : undefined,
    cert: process.env[`${prefix}SSL_CERT`] ? fs.readFileSync(process.env[`${prefix}SSL_CERT`]) : undefined,
    key: process.env[`${prefix}SSL_KEY`] ? fs.readFileSync(process.env[`${prefix}SSL_KEY`]) : undefined
  } : undefined,
  connectTimeout: 30000,
  acquireTimeout: 30000
};

console.log(`🎯 Connecting to: ${config.user}@${config.host}:${config.port}/${config.database}`);

async function testConnection() {
  let connection;
  
  try {
    // Test basic connection
    console.log('⏳ Attempting connection...');
    connection = await mysql.createConnection(config);
    console.log('✅ Connection successful!');
    
    // Test basic query
    console.log('⏳ Testing basic query...');
    const [rows] = await connection.execute('SELECT 1 as test, NOW() as `current_time`');
    console.log('✅ Query successful:', rows[0]);
    
    // Test database access
    console.log('⏳ Testing database access...');
    const [tables] = await connection.execute('SHOW TABLES');
    console.log(`✅ Found ${tables.length} tables in database`);
    
    // Test permissions
    console.log('⏳ Testing user permissions...');
    const [grants] = await connection.execute('SHOW GRANTS');
    console.log('✅ User permissions:');
    grants.forEach(grant => {
      console.log(`   ${Object.values(grant)[0]}`);
    });
    
    console.log('\n🎉 All tests passed! Database connection is working correctly.');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('   💡 Check if the database host and port are correct');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   💡 Check if the username and password are correct');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('   💡 Check if the database name exists');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('   💡 Check if your IP is whitelisted in Cloud SQL');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Connection closed');
    }
  }
}

testConnection();