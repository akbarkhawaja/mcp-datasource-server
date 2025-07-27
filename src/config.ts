import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  server: {
    port: process.env.MCP_SERVER_PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    apiKey: process.env.API_KEY,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
  },
  mysql: {
    host: process.env.GCS_DB_HOST,
    port: parseInt(process.env.GCS_DB_PORT || '3306', 10),
    user: process.env.GCS_DB_USER,
    password: process.env.GCS_DB_PASSWORD,
    database: process.env.GCS_DB_NAME
  }
};