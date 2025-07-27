import { MySQLQueryValidator } from '../security/queryValidator.js';
import { InputValidator } from '../security/inputValidator.js';
import { databaseManager } from '../database/index.js';
import { MCPToolResponse } from '../types/index.js';
import { SecurityLogger } from '../utils/logger.js';

export class MySQLTools {
  static async queryMySQL(args: any): Promise<MCPToolResponse> {
    try {
      // Validate input parameters
      const validation = InputValidator.validateMySQLQuery(args);
      if (!validation.isValid) {
        SecurityLogger.logQueryAttempt(args.query || '', false, validation.errors);
        return {
          success: false,
          error: `Input validation failed: ${validation.errors.join(', ')}`
        };
      }

      const { query, limit, timeout } = validation.data;

      // Validate query for security
      const queryValidation = MySQLQueryValidator.validate(query);
      if (!queryValidation.isValid) {
        SecurityLogger.logQueryAttempt(query, false, queryValidation.errors);
        return {
          success: false,
          error: `Query validation failed: ${queryValidation.errors.join(', ')}`
        };
      }

      if (!queryValidation.isReadonly) {
        SecurityLogger.logQueryAttempt(query, false, ['Query is not readonly']);
        return {
          success: false,
          error: 'Only readonly queries are allowed'
        };
      }

      // Execute query
      const database = databaseManager.getMySQLDatabase();
      let results = await database.executeQuery(queryValidation.sanitizedQuery!, [], timeout);

      // Apply limit
      if (results.length > limit) {
        results = results.slice(0, limit);
      }

      SecurityLogger.logQueryAttempt(query, true);

      return {
        success: true,
        data: {
          results,
          rowCount: results.length,
          query: queryValidation.sanitizedQuery,
          executionTime: new Date().toISOString()
        },
        metadata: {
          limit,
          timeout,
          truncated: results.length === limit
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecurityLogger.logSecurityEvent('query_mysql_error', {
        error: errorMessage,
        args: JSON.stringify(args).substring(0, 200)
      }, 'error');

      return {
        success: false,
        error: `Query execution failed: ${errorMessage}`
      };
    }
  }

  static async describeSchema(): Promise<MCPToolResponse> {
    try {
      const database = databaseManager.getMySQLDatabase();
      const schema = await database.getSchema();

      SecurityLogger.logSecurityEvent('describe_schema', {
        tableCount: schema.length
      });

      return {
        success: true,
        data: {
          schema,
          tableCount: schema.length,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecurityLogger.logSecurityEvent('describe_schema_error', {
        error: errorMessage
      }, 'error');

      return {
        success: false,
        error: `Schema description failed: ${errorMessage}`
      };
    }
  }

  static async countRecords(args: any): Promise<MCPToolResponse> {
    try {
      // Validate table name
      const validation = InputValidator.validateTableName(args.table);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Table name validation failed: ${validation.errors.join(', ')}`
        };
      }

      const tableName = validation.data!;
      const database = databaseManager.getMySQLDatabase();
      const count = await database.getTableCount(tableName);

      SecurityLogger.logSecurityEvent('count_records', {
        table: tableName,
        count
      });

      return {
        success: true,
        data: {
          table: tableName,
          count,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecurityLogger.logSecurityEvent('count_records_error', {
        error: errorMessage,
        table: args.table
      }, 'error');

      return {
        success: false,
        error: `Record count failed: ${errorMessage}`
      };
    }
  }

  static async searchData(args: any): Promise<MCPToolResponse> {
    try {
      // Validate search request
      const validation = InputValidator.validateSearchRequest(args);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Search validation failed: ${validation.errors.join(', ')}`
        };
      }

      const { table, column, searchTerm, limit } = validation.data;
      const database = databaseManager.getMySQLDatabase();
      const results = await database.searchTable(table, column, searchTerm, limit);

      SecurityLogger.logSecurityEvent('search_data', {
        table,
        column,
        searchTerm: searchTerm.substring(0, 50),
        resultCount: results.length
      });

      return {
        success: true,
        data: {
          results,
          table,
          column,
          searchTerm,
          resultCount: results.length,
          timestamp: new Date().toISOString()
        },
        metadata: {
          limit,
          truncated: results.length === limit
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecurityLogger.logSecurityEvent('search_data_error', {
        error: errorMessage,
        table: args.table,
        column: args.column
      }, 'error');

      return {
        success: false,
        error: `Data search failed: ${errorMessage}`
      };
    }
  }
}