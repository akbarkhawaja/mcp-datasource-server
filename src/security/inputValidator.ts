import Joi from 'joi';

export const mysqlQuerySchema = Joi.object({
  query: Joi.string()
    .min(1)
    .max(10000)
    .pattern(/^[^<>{}]*$/, 'no HTML/script tags')
    .required()
    .messages({
      'string.empty': 'Query cannot be empty',
      'string.max': 'Query too long (max 10000 characters)',
      'string.pattern.name': 'Query contains invalid characters'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(100)
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 1000'
    }),
  timeout: Joi.number()
    .integer()
    .min(1000)
    .max(30000)
    .default(30000)
    .messages({
      'number.min': 'Timeout must be at least 1000ms',
      'number.max': 'Timeout cannot exceed 30000ms'
    })
});

export const cypherQuerySchema = Joi.object({
  query: Joi.string()
    .min(1)
    .max(10000)
    .pattern(/^[^<>{}]*$/, 'no HTML/script tags')
    .required()
    .messages({
      'string.empty': 'Query cannot be empty',
      'string.max': 'Query too long (max 10000 characters)',
      'string.pattern.name': 'Query contains invalid characters'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(100)
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 1000'
    })
});

export const tableNameSchema = Joi.string()
  .pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'valid table name')
  .min(1)
  .max(64)
  .required()
  .messages({
    'string.pattern.name': 'Table name must start with letter and contain only letters, numbers, and underscores',
    'string.max': 'Table name too long (max 64 characters)'
  });

export const searchSchema = Joi.object({
  table: tableNameSchema,
  column: Joi.string()
    .pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'valid column name')
    .min(1)
    .max(64)
    .required()
    .messages({
      'string.pattern.name': 'Column name must start with letter and contain only letters, numbers, and underscores',
      'string.max': 'Column name too long (max 64 characters)'
    }),
  searchTerm: Joi.string()
    .min(1)
    .max(255)
    .pattern(/^[^<>{};"']*$/, 'no dangerous characters')
    .required()
    .messages({
      'string.empty': 'Search term cannot be empty',
      'string.max': 'Search term too long (max 255 characters)',
      'string.pattern.name': 'Search term contains invalid characters'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(100)
});

export class InputValidator {
  static validateMySQLQuery(input: unknown): { isValid: boolean; data?: any; errors: string[] } {
    const { error, value } = mysqlQuerySchema.validate(input, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message)
      };
    }

    return {
      isValid: true,
      data: value,
      errors: []
    };
  }

  static validateCypherQuery(input: unknown): { isValid: boolean; data?: any; errors: string[] } {
    const { error, value } = cypherQuerySchema.validate(input, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message)
      };
    }

    return {
      isValid: true,
      data: value,
      errors: []
    };
  }

  static validateTableName(input: unknown): { isValid: boolean; data?: string; errors: string[] } {
    const { error, value } = tableNameSchema.validate(input, { 
      abortEarly: false 
    });

    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message)
      };
    }

    return {
      isValid: true,
      data: value,
      errors: []
    };
  }

  static validateSearchRequest(input: unknown): { isValid: boolean; data?: any; errors: string[] } {
    const { error, value } = searchSchema.validate(input, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      return {
        isValid: false,
        errors: error.details.map(detail => detail.message)
      };
    }

    return {
      isValid: true,
      data: value,
      errors: []
    };
  }
}