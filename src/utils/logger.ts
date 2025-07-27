import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-datasource-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export class SecurityLogger {
  static logSecurityEvent(event: string, details: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info') {
    logger.log(level, `Security Event: ${event}`, {
      securityEvent: true,
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  static logQueryAttempt(query: string, isValid: boolean, errors?: string[], clientId?: string) {
    this.logSecurityEvent('query_attempt', {
      query: query.substring(0, 200),
      isValid,
      errors,
      clientId,
      queryLength: query.length
    }, isValid ? 'info' : 'warn');
  }

  static logRateLimitHit(clientId: string, endpoint: string) {
    this.logSecurityEvent('rate_limit_exceeded', {
      clientId,
      endpoint
    }, 'warn');
  }

  static logDatabaseConnection(type: 'mysql' | 'neo4j', success: boolean, error?: string) {
    this.logSecurityEvent('database_connection', {
      databaseType: type,
      success,
      error
    }, success ? 'info' : 'error');
  }
}

export default logger;