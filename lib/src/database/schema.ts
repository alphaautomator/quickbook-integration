import { Database } from 'better-sqlite3';
import { logger } from '../utils/logger';

/**
 * Initialize all database tables
 */
export function initializeSchema(db: Database): void {
  logger.info('Initializing database schema...');

  // Tokens table - stores OAuth access and refresh tokens
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      realm_id TEXT UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Customers table - stores Customer records from QuickBooks
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      realm_id TEXT NOT NULL,
      raw_data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Add index on realm_id for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_customers_realm_id 
    ON customers(realm_id)
  `);

  // Invoices table - stores Invoice records from QuickBooks
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      realm_id TEXT NOT NULL,
      customer_id TEXT,
      raw_data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Add indexes for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoices_realm_id 
    ON invoices(realm_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_id 
    ON invoices(customer_id)
  `);

  // Sync state table - tracks sync progress per object type
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      realm_id TEXT NOT NULL,
      object_type TEXT NOT NULL,
      last_sync_attempt INTEGER,
      last_sync_success INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      cursor TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      UNIQUE(realm_id, object_type)
    )
  `);

  logger.info('Database schema initialized successfully');
}
