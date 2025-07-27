import { QueryValidationResult } from '../types/index.js';

export class MySQLQueryValidator {
  private static readonly READONLY_KEYWORDS = new Set([
    'SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'ANALYZE'
  ]);

  private static readonly FORBIDDEN_KEYWORDS = new Set([
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE',
    'REPLACE', 'MERGE', 'CALL', 'EXECUTE', 'GRANT', 'REVOKE', 'LOCK',
    'UNLOCK', 'SET', 'RESET', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
    'LOAD', 'OUTFILE', 'INFILE', 'BACKUP', 'RESTORE'
  ]);

  private static readonly DANGEROUS_FUNCTIONS = new Set([
    'LOAD_FILE', 'INTO OUTFILE', 'INTO DUMPFILE', 'SYSTEM', 'BENCHMARK',
    'SLEEP', 'GET_LOCK', 'RELEASE_LOCK', 'CONNECTION_ID', 'USER',
    'CURRENT_USER', 'SESSION_USER', 'SYSTEM_USER'
  ]);

  static validate(query: string): QueryValidationResult {
    const errors: string[] = [];
    const trimmedQuery = query.trim().toUpperCase();

    if (!trimmedQuery) {
      return {
        isValid: false,
        isReadonly: false,
        errors: ['Query cannot be empty']
      };
    }

    // Check for SQL injection patterns
    if (this.containsSQLInjectionPatterns(query)) {
      errors.push('Query contains potential SQL injection patterns');
    }

    // Check for forbidden keywords
    const firstKeyword = trimmedQuery.split(/\s+/)[0];
    if (this.FORBIDDEN_KEYWORDS.has(firstKeyword)) {
      errors.push(`Operation '${firstKeyword}' is not allowed (readonly access only)`);
    }

    // Check if query starts with allowed readonly keywords
    const isReadonly = this.READONLY_KEYWORDS.has(firstKeyword);
    if (!isReadonly && !this.FORBIDDEN_KEYWORDS.has(firstKeyword)) {
      errors.push(`Query must start with a readonly operation: ${Array.from(this.READONLY_KEYWORDS).join(', ')}`);
    }

    // Check for dangerous functions (must be followed by parentheses or be standalone)
    for (const func of this.DANGEROUS_FUNCTIONS) {
      const funcName = func.replace('()', '');
      // Check for function calls: FUNCTION( or FUNCTION ()
      const functionPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'i');
      if (functionPattern.test(query)) {
        errors.push(`Function '${funcName}' is not allowed`);
      }
    }

    // Check for multiple statements
    if (this.containsMultipleStatements(query)) {
      errors.push('Multiple statements are not allowed');
    }

    // Basic structure validation
    if (isReadonly && !this.hasValidSelectStructure(trimmedQuery)) {
      errors.push('Invalid SELECT query structure');
    }

    const sanitizedQuery = this.sanitizeQuery(query);

    return {
      isValid: errors.length === 0,
      isReadonly,
      errors,
      sanitizedQuery: errors.length === 0 ? sanitizedQuery : undefined
    };
  }

  private static containsSQLInjectionPatterns(query: string): boolean {
    const injectionPatterns = [
      /('|(\\')|(;|%3B)|(--|\#)|(\/\*|\*\/))/i,
      /(union\s+select)/i,
      /(script\s*>)/i,
      /(javascript\s*:)/i,
      /(vbscript\s*:)/i,
      /(onload\s*=)/i,
      /(onerror\s*=)/i,
      /(eval\s*\()/i,
      /(expression\s*\()/i
    ];

    return injectionPatterns.some(pattern => pattern.test(query));
  }

  private static containsMultipleStatements(query: string): boolean {
    const statements = query.split(';').filter(stmt => stmt.trim().length > 0);
    return statements.length > 1;
  }

  private static hasValidSelectStructure(query: string): boolean {
    if (!query.startsWith('SELECT') && !query.startsWith('SHOW') && 
        !query.startsWith('DESCRIBE') && !query.startsWith('DESC') && 
        !query.startsWith('EXPLAIN') && !query.startsWith('ANALYZE')) {
      return false;
    }

    // Basic structure check - allow simple SELECT expressions (like SELECT 1, SELECT NOW())
    // and queries with FROM clauses
    if (query.startsWith('SELECT')) {
      // Allow simple expressions without FROM clause
      const hasFromClause = query.includes('FROM');
      const hasDualTable = query.includes('DUAL');
      const isSimpleExpression = /^SELECT\s+[\w\s,\(\)\*\+\-\/]+(\s+AS\s+\w+)?\s*$/i.test(query);
      
      if (!hasFromClause && !hasDualTable && !isSimpleExpression) {
        return false;
      }
    }

    return true;
  }

  private static sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/;+$/, '');
  }
}

export class CypherQueryValidator {
  private static readonly READONLY_KEYWORDS = new Set([
    'MATCH', 'RETURN', 'WITH', 'UNWIND', 'CALL', 'YIELD'
  ]);

  private static readonly FORBIDDEN_KEYWORDS = new Set([
    'CREATE', 'DELETE', 'DETACH', 'SET', 'REMOVE', 'MERGE',
    'DROP', 'FOREACH', 'LOAD', 'USING'
  ]);

  static validate(query: string): QueryValidationResult {
    const errors: string[] = [];
    const trimmedQuery = query.trim().toUpperCase();

    if (!trimmedQuery) {
      return {
        isValid: false,
        isReadonly: false,
        errors: ['Query cannot be empty']
      };
    }

    // Check for forbidden keywords
    for (const keyword of this.FORBIDDEN_KEYWORDS) {
      if (trimmedQuery.includes(keyword)) {
        errors.push(`Operation '${keyword}' is not allowed (readonly access only)`);
      }
    }

    // Check if query starts with allowed readonly keywords
    const firstKeyword = trimmedQuery.split(/\s+/)[0];
    const isReadonly = this.READONLY_KEYWORDS.has(firstKeyword);
    if (!isReadonly) {
      errors.push(`Query must start with a readonly operation: ${Array.from(this.READONLY_KEYWORDS).join(', ')}`);
    }

    const sanitizedQuery = this.sanitizeQuery(query);

    return {
      isValid: errors.length === 0,
      isReadonly,
      errors,
      sanitizedQuery: errors.length === 0 ? sanitizedQuery : undefined
    };
  }

  private static sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ');
  }
}