import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { DatabaseConfig, MySQLTableInfo, MySQLColumnInfo } from '../types/index.js';
import { SecurityLogger } from '../utils/logger.js';
import logger from '../utils/logger.js';

export class MySQLDatabase {
  private pool: mysql.Pool | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.username,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: this.config.maxConnections || 10,
        ssl: this.config.ssl ? {
          rejectUnauthorized: true,
          ca: this.config.sslCA ? readFileSync(this.config.sslCA) : undefined,
          cert: this.config.sslCert ? readFileSync(this.config.sslCert) : undefined,
          key: this.config.sslKey ? readFileSync(this.config.sslKey) : undefined
        } : undefined,
        charset: 'utf8mb4'
      });

      // Test connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      SecurityLogger.logDatabaseConnection('mysql', true);
      logger.info('MySQL database connected successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecurityLogger.logDatabaseConnection('mysql', false, errorMessage);
      throw new Error(`Failed to connect to MySQL: ${errorMessage}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('MySQL database disconnected');
    }
  }

  async executeQuery(query: string, params: any[] = [], timeout: number = 30000): Promise<any[]> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const startTime = Date.now();
    let connection: mysql.PoolConnection | null = null;

    try {
      connection = await this.pool.getConnection();
      
      // Skip timeout setting for compatibility - rely on connection timeout instead
      // Some MySQL versions don't support max_execution_time or handle it differently
      
      const [rows] = await connection.execute(query, params);
      const duration = Date.now() - startTime;

      SecurityLogger.logSecurityEvent('query_executed', {
        queryType: 'mysql',
        duration,
        rowCount: Array.isArray(rows) ? rows.length : 0,
        success: true
      });

      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      SecurityLogger.logSecurityEvent('query_failed', {
        queryType: 'mysql',
        duration,
        error: errorMessage,
        success: false
      }, 'error');

      throw new Error(`Query execution failed: ${errorMessage}`);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  async getSchema(): Promise<MySQLTableInfo[]> {
    const query = `
      SELECT 
        t.TABLE_NAME as tableName,
        c.COLUMN_NAME as columnName,
        c.DATA_TYPE as dataType,
        c.IS_NULLABLE as isNullable,
        c.COLUMN_KEY as columnKey,
        c.EXTRA as extra,
        t.TABLE_ROWS as rowCount
      FROM 
        information_schema.TABLES t
        LEFT JOIN information_schema.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME 
          AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
      WHERE 
        t.TABLE_SCHEMA = DATABASE()
        AND t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY 
        t.TABLE_NAME, c.ORDINAL_POSITION
    `;

    const rows = await this.executeQuery(query);
    const tablesMap = new Map<string, MySQLTableInfo>();

    for (const row of rows) {
      const tableName = row.tableName;
      
      if (!tablesMap.has(tableName)) {
        tablesMap.set(tableName, {
          tableName,
          columns: [],
          rowCount: Number(row.rowCount) || 0
        });
      }

      const table = tablesMap.get(tableName)!;
      
      if (row.columnName) {
        table.columns.push({
          columnName: row.columnName,
          dataType: row.dataType,
          isNullable: row.isNullable === 'YES',
          columnKey: row.columnKey || '',
          extra: row.extra || ''
        });
      }
    }

    return Array.from(tablesMap.values());
  }

  async getTableCount(tableName: string): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM ??';
    const rows = await this.executeQuery(query, [tableName]);
    return rows[0]?.count || 0;
  }

  async searchTable(tableName: string, columnName: string, searchTerm: string, limit: number = 100): Promise<any[]> {
    const query = `SELECT * FROM ?? WHERE ?? LIKE ? LIMIT ?`;
    const searchPattern = `%${searchTerm}%`;
    return await this.executeQuery(query, [tableName, columnName, searchPattern, limit]);
  }

  isConnected(): boolean {
    return this.pool !== null;
  }
}