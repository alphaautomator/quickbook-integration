import Database from 'better-sqlite3';
import { config } from '../config';
import { initializeSchema } from './schema';
import { logger } from '../utils/logger';

let db: Database.Database | null = null;

/**
 * Get or create database connection
 */
export function getDb(): Database.Database {
  if (!db) {
    logger.info(`Connecting to database: ${config.database.path}`);
    db = new Database(config.database.path);
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    logger.info('Database connection established');
  }
  
  return db;
}

/**
 * Initialize database with schema
 */
export function initializeDatabase(): Database.Database {
  const database = getDb();
  initializeSchema(database);
  return database;
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (db) {
    logger.info('Closing database connection');
    db.close();
    db = null;
  }
}

/**
 * Execute a transaction
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const database = getDb();
  const txn = database.transaction(fn);
  return txn(database);
}
