export interface DatabaseConfig {
  readonly type: 'mysql' | 'neo4j';
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly connectionString?: string;
  readonly maxConnections?: number;
  readonly timeout?: number;
  readonly ssl?: boolean;
  readonly sslCA?: string;
  readonly sslCert?: string;
  readonly sslKey?: string;
}

export interface QueryValidationResult {
  readonly isValid: boolean;
  readonly isReadonly: boolean;
  readonly errors: string[];
  readonly sanitizedQuery?: string;
}

export interface MCPToolRequest {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface MCPToolResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface SecurityContext {
  readonly clientId?: string;
  readonly timestamp: number;
  readonly rateLimitRemaining: number;
}

export interface MySQLTableInfo {
  readonly tableName: string;
  readonly columns: MySQLColumnInfo[];
  readonly rowCount?: number;
}

export interface MySQLColumnInfo {
  readonly columnName: string;
  readonly dataType: string;
  readonly isNullable: boolean;
  readonly columnKey: string;
  readonly extra: string;
}