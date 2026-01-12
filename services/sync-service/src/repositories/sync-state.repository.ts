import { getDb, logger, ObjectType, SyncStatus } from '@quickbooks-integration/lib';

export { SyncStatus, ObjectType };

export interface SyncState {
  id?: number;
  realmId: string;
  objectType: ObjectType;
  lastSyncAttempt?: number;
  lastSyncSuccess?: number;
  status: SyncStatus;
  cursor?: string;
  errorMessage?: string;
  createdAt?: number;
  updatedAt?: number;
}

export class SyncStateRepository {
  /**
   * Get sync state for a specific object type
   */
  get(realmId: string, objectType: ObjectType): SyncState {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        object_type as objectType,
        last_sync_attempt as lastSyncAttempt,
        last_sync_success as lastSyncSuccess,
        status,
        cursor,
        error_message as errorMessage,
        created_at as createdAt,
        updated_at as updatedAt
      FROM sync_state
      WHERE realm_id = ? AND object_type = ?
    `);

    const row = stmt.get(realmId, objectType) as SyncState | undefined;

    // Return default state if not found
    if (!row) {
      return {
        realmId,
        objectType,
        status: SyncStatus.PENDING,
        cursor: undefined
      };
    }

    return row;
  }

  /**
   * Get all sync states for a realm
   */
  getAllByRealmId(realmId: string): SyncState[] {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        object_type as objectType,
        last_sync_attempt as lastSyncAttempt,
        last_sync_success as lastSyncSuccess,
        status,
        cursor,
        error_message as errorMessage,
        created_at as createdAt,
        updated_at as updatedAt
      FROM sync_state
      WHERE realm_id = ?
      ORDER BY object_type
    `);

    return stmt.all(realmId) as SyncState[];
  }

  /**
   * Mark sync as in progress
   */
  markInProgress(realmId: string, objectType: ObjectType): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO sync_state (realm_id, object_type, last_sync_attempt, status, created_at, updated_at)
      VALUES (?, ?, ?, 'in_progress', ?, ?)
      ON CONFLICT(realm_id, object_type) DO UPDATE SET
        last_sync_attempt = excluded.last_sync_attempt,
        status = 'in_progress',
        updated_at = excluded.updated_at
    `);

    stmt.run(realmId, objectType, now, now, now);
    logger.debug(`Sync marked as in_progress: ${objectType} for realm ${realmId}`);
  }

  /**
   * Mark sync as successful
   */
  markSuccess(realmId: string, objectType: ObjectType, cursor?: string): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO sync_state (
        realm_id, object_type, last_sync_success, status, cursor, 
        error_message, created_at, updated_at
      )
      VALUES (?, ?, ?, 'success', ?, NULL, ?, ?)
      ON CONFLICT(realm_id, object_type) DO UPDATE SET
        last_sync_success = excluded.last_sync_success,
        status = 'success',
        cursor = excluded.cursor,
        error_message = NULL,
        updated_at = excluded.updated_at
    `);

    stmt.run(realmId, objectType, now, cursor || null, now, now);
    logger.info(`Sync marked as success: ${objectType} for realm ${realmId}`);
  }

  /**
   * Mark sync as failed
   */
  markFailure(realmId: string, objectType: ObjectType, errorMessage: string): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO sync_state (
        realm_id, object_type, status, error_message, created_at, updated_at
      )
      VALUES (?, ?, 'failure', ?, ?, ?)
      ON CONFLICT(realm_id, object_type) DO UPDATE SET
        status = 'failure',
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
    `);

    stmt.run(realmId, objectType, errorMessage, now, now);
    logger.warn(`Sync marked as failure: ${objectType} for realm ${realmId} - ${errorMessage}`);
  }

  /**
   * Update cursor without changing status
   */
  updateCursor(realmId: string, objectType: ObjectType, cursor: string): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      UPDATE sync_state
      SET cursor = ?, updated_at = ?
      WHERE realm_id = ? AND object_type = ?
    `);

    stmt.run(cursor, now, realmId, objectType);
    logger.debug(`Cursor updated for ${objectType}: ${cursor}`);
  }

  /**
   * Reset sync state for an object type
   */
  reset(realmId: string, objectType: ObjectType): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO sync_state (
        realm_id, object_type, status, cursor, error_message, created_at, updated_at
      )
      VALUES (?, ?, 'pending', NULL, NULL, ?, ?)
      ON CONFLICT(realm_id, object_type) DO UPDATE SET
        status = 'pending',
        cursor = NULL,
        error_message = NULL,
        updated_at = excluded.updated_at
    `);

    stmt.run(realmId, objectType, now, now);
    logger.info(`Sync state reset for ${objectType} in realm ${realmId}`);
  }

  /**
   * Delete sync state
   */
  delete(realmId: string, objectType: ObjectType): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM sync_state WHERE realm_id = ? AND object_type = ?');
    stmt.run(realmId, objectType);
    logger.info(`Sync state deleted for ${objectType} in realm ${realmId}`);
  }

  /**
   * Delete all sync states for a realm
   */
  deleteByRealmId(realmId: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM sync_state WHERE realm_id = ?');
    const result = stmt.run(realmId);
    logger.info(`Deleted ${result.changes} sync states for realm: ${realmId}`);
  }

  /**
   * Check if a sync is currently in progress
   */
  isInProgress(realmId: string, objectType: ObjectType): boolean {
    const state = this.get(realmId, objectType);
    return state.status === SyncStatus.IN_PROGRESS;
  }
}

// Export singleton instance
export const syncStateRepository = new SyncStateRepository();
