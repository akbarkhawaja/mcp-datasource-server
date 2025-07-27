import { MySQLDatabase } from './mysql.js';
import { DatabaseConfig } from '../types/index.js';
import logger from '../utils/logger.js';
import { config } from '../config.js';

export class DatabaseManager {
  private mysqlDatabase: MySQLDatabase | null = null;

  async initializeMySQL(): Promise<void> {
    const dbConfig: DatabaseConfig = {
      type: 'mysql',
      host: config.mysql.host || 'localhost',
      port: config.mysql.port,
      database: config.mysql.database || '',
      username: config.mysql.user || '',
      password: config.mysql.password || '',
      maxConnections: 10,
      timeout: 30000,
      ssl: config.server.nodeEnv === 'production'
    };

    if (!dbConfig.host || !dbConfig.database || !dbConfig.username || !dbConfig.password) {
      throw new Error('MySQL configuration incomplete. Check environment variables.');
    }

    this.mysqlDatabase = new MySQLDatabase(dbConfig);
    await this.mysqlDatabase.connect();
    logger.info('MySQL database initialized');
  }

  getMySQLDatabase(): MySQLDatabase {
    if (!this.mysqlDatabase) {
      throw new Error('MySQL database not initialized');
    }
    return this.mysqlDatabase;
  }

  async disconnect(): Promise<void> {
    if (this.mysqlDatabase) {
      await this.mysqlDatabase.disconnect();
    }
  }

  isConnected(): boolean {
    return this.mysqlDatabase?.isConnected() || false;
  }
}

export const databaseManager = new DatabaseManager();