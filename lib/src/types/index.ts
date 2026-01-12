/**
 * Shared types and enums for QuickBooks integration
 */

/**
 * QuickBooks object types that can be synced
 */
export enum ObjectType {
  CUSTOMER = 'customer',
  INVOICE = 'invoice',
}

/**
 * Sync operation status
 */
export enum SyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  FAILURE = 'failure',
}

/**
 * Sync history status (includes partial)
 */
export enum SyncHistoryStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial',
}
