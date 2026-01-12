import { getDb, logger, ObjectType, SyncHistoryStatus } from '@quickbooks-integration/lib';

export { ObjectType, SyncHistoryStatus };

export interface SyncHistoryRecord {
  id?: number;
  realmId: string;
  objectType: ObjectType;
  status: SyncHistoryStatus;
  recordsSynced: number;
  recordsFailed: number;
  durationMs?: number;
  cursorBefore?: string;
  cursorAfter?: string;
  errorMessage?: string;
  startedAt: number;
  completedAt?: number;
  createdAt?: number;
}

export interface SyncHistorySummary {
  objectType: ObjectType;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  totalRecordsSynced: number;
  lastSyncTime: string | null;
  lastSyncStatus: SyncHistoryStatus;
}

class SyncHistoryRepository {
  /**
   * Create a new sync history record
   */
  create(record: Omit<SyncHistoryRecord, 'id' | 'createdAt'>): number {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO sync_history (
        realm_id, object_type, status, records_synced, records_failed,
        duration_ms, cursor_before, cursor_after, error_message,
        started_at, completed_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      record.realmId,
      record.objectType,
      record.status,
      record.recordsSynced,
      record.recordsFailed,
      record.durationMs || null,
      record.cursorBefore || null,
      record.cursorAfter || null,
      record.errorMessage || null,
      record.startedAt,
      record.completedAt || null,
      now
    );

    logger.debug(`Sync history record created: ${result.lastInsertRowid}`);
    return result.lastInsertRowid as number;
  }

  /**
   * Get sync history records for a realm and object type
   */
  findByRealmAndType(
    realmId: string,
    objectType: ObjectType,
    limit: number = 50
  ): SyncHistoryRecord[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        object_type as objectType,
        status,
        records_synced as recordsSynced,
        records_failed as recordsFailed,
        duration_ms as durationMs,
        cursor_before as cursorBefore,
        cursor_after as cursorAfter,
        error_message as errorMessage,
        started_at as startedAt,
        completed_at as completedAt,
        created_at as createdAt
      FROM sync_history
      WHERE realm_id = ? AND object_type = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);

    return stmt.all(realmId, objectType, limit) as SyncHistoryRecord[];
  }

  /**
   * Get all sync history for a realm
   */
  findByRealmId(realmId: string, limit: number = 100): SyncHistoryRecord[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        object_type as objectType,
        status,
        records_synced as recordsSynced,
        records_failed as recordsFailed,
        duration_ms as durationMs,
        cursor_before as cursorBefore,
        cursor_after as cursorAfter,
        error_message as errorMessage,
        started_at as startedAt,
        completed_at as completedAt,
        created_at as createdAt
      FROM sync_history
      WHERE realm_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);

    return stmt.all(realmId, limit) as SyncHistoryRecord[];
  }

  /**
   * Get the most recent sync history record
   */
  findMostRecent(realmId: string, objectType: ObjectType): SyncHistoryRecord | null {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        object_type as objectType,
        status,
        records_synced as recordsSynced,
        records_failed as recordsFailed,
        duration_ms as durationMs,
        cursor_before as cursorBefore,
        cursor_after as cursorAfter,
        error_message as errorMessage,
        started_at as startedAt,
        completed_at as completedAt,
        created_at as createdAt
      FROM sync_history
      WHERE realm_id = ? AND object_type = ?
      ORDER BY started_at DESC
      LIMIT 1
    `);

    const row = stmt.get(realmId, objectType) as SyncHistoryRecord | undefined;
    return row || null;
  }

  /**
   * Get summary statistics for sync history
   */
  getSummary(realmId: string): SyncHistorySummary[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        object_type as objectType,
        COUNT(*) as totalSyncs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulSyncs,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failedSyncs,
        SUM(records_synced) as totalRecordsSynced,
        MAX(started_at) as lastSyncTime,
        (SELECT status FROM sync_history sh2 
         WHERE sh2.realm_id = sync_history.realm_id 
         AND sh2.object_type = sync_history.object_type 
         ORDER BY started_at DESC LIMIT 1) as lastSyncStatus
      FROM sync_history
      WHERE realm_id = ?
      GROUP BY object_type
      ORDER BY object_type
    `);

    const rows = stmt.all(realmId) as any[];
    return rows.map(row => ({
      ...row,
      lastSyncTime: row.lastSyncTime ? new Date(row.lastSyncTime).toISOString() : null,
    }));
  }

  /**
   * Delete old sync history records (older than specified days)
   */
  deleteOlderThan(days: number): number {
    const db = getDb();
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    const stmt = db.prepare(`
      DELETE FROM sync_history
      WHERE started_at < ?
    `);

    const result = stmt.run(cutoffTime);
    logger.info(`Deleted ${result.changes} sync history records older than ${days} days`);
    return result.changes;
  }

  /**
   * Get sync history count
   */
  count(realmId?: string, objectType?: ObjectType): number {
    const db = getDb();
    let query = 'SELECT COUNT(*) as count FROM sync_history';
    const params: any[] = [];

    if (realmId && objectType) {
      query += ' WHERE realm_id = ? AND object_type = ?';
      params.push(realmId, objectType);
    } else if (realmId) {
      query += ' WHERE realm_id = ?';
      params.push(realmId);
    }

    const stmt = db.prepare(query);
    const row = stmt.get(...params) as { count: number };
    return row.count;
  }
}

export const syncHistoryRepository = new SyncHistoryRepository();
