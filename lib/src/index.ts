// Shared library main exports
// This file will export all shared modules

// Database
export { getDb, initializeDatabase, closeDb, transaction } from './database/connection';
export { tokenRepository } from './database/repositories/token.repository';
export type { TokenData } from './database/repositories/token.repository';

// Config and utilities
// export { config, validateConfig } from './config';
export { logger } from './utils/logger';

// QuickBooks client will be exported after it's created
// export { QuickBooks } from './quickbooks/client';
