// Shared library main exports
// This file will export all shared modules

// QuickBooks API Client
export { QuickBooks } from './quickbooks/client';
export { 
  getAuthorizationUrl, 
  exchangeCodeForTokens, 
  refreshAccessToken, 
  revokeToken 
} from './quickbooks/oauth';
export type { OAuthTokenResponse } from './quickbooks/oauth';

// Database
export { getDb, initializeDatabase, closeDb, transaction } from './database/connection';
export { tokenRepository } from './database/repositories/token.repository';
export type { TokenData } from './database/repositories/token.repository';

// Config and utilities
export { config, validateConfig } from './config';
export { logger } from './utils/logger';
