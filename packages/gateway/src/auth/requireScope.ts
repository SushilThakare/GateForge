/**
 * @file packages/gateway/src/auth/requireScope.ts
 * @description Scope-based authorization middleware factory for GateForge Gateway.
 * Positioned after apiKeyAuth in the middleware pipeline to enforce Role-Based / Scope-Based
 * Access Control (RBAC) on protected management endpoints.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiKeyScope } from '@prisma/client';

/**
 * Higher-order middleware function that restricts route access to API keys containing a specific scope.
 * 
 * @param {ApiKeyScope} requiredScope - The mandatory permission scope required (e.g. ADMIN, WRITE, READ)
 * @returns {RequestHandler} Express middleware handler enforcing scope check
 */
export function requireScope(requiredScope: ApiKeyScope): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const apiKey = req.apiKey;

      // Ensure API key was authenticated earlier in the middleware pipeline
      if (!apiKey) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required prior to scope authorization check.',
        });
        return;
      }

      // Check if caller's key contains the required scope
      const hasScope = apiKey.scopes.includes(requiredScope);

      if (!hasScope) {
        res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions. This operation requires the '${requiredScope}' scope.`,
          requiredScope,
          assignedScopes: apiKey.scopes,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[RequireScope Error] Scope verification failed:', {
        error: error instanceof Error ? error.message : String(error),
        requiredScope,
        path: req.path,
      });
      res.status(500).json({
        error: 'Internal Authorization Error',
        message: 'Unable to evaluate security scope permissions.',
      });
    }
  };
}
