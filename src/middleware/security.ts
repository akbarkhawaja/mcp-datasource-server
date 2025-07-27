import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { SecurityLogger } from '../utils/logger.js';

export const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  })
];

export const createRateLimiter = () => rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const clientId = req.ip || 'unknown';
    SecurityLogger.logRateLimitHit(clientId, req.path);
    
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(60) // seconds
    });
  }
});

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const clientId = req.ip || 'unknown';
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    SecurityLogger.logSecurityEvent('request_completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      clientId,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
};

export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    return next();
  }
  
  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!providedKey || providedKey !== apiKey) {
    SecurityLogger.logSecurityEvent('unauthorized_access', {
      clientId: req.ip,
      path: req.path,
      providedKey: providedKey ? 'present' : 'missing'
    }, 'warn');
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }
  
  next();
};