import { getDb } from '../connection';
import { logger } from '../../utils/logger';

export interface TokenData {
  id?: number;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  createdAt?: number;
  updatedAt?: number;
}

export class TokenRepository {
  /**
   * Save new token data
   */
  save(data: TokenData): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO tokens (realm_id, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(realm_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      data.realmId,
      data.accessToken,
      data.refreshToken,
      data.expiresAt,
      now,
      now
    );

    logger.info(`Token saved for realm: ${data.realmId}`);
  }

  /**
   * Find token by realm ID
   */
  findByRealmId(realmId: string): TokenData | null {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        access_token as accessToken,
        refresh_token as refreshToken,
        expires_at as expiresAt,
        created_at as createdAt,
        updated_at as updatedAt
      FROM tokens
      WHERE realm_id = ?
    `);

    const row = stmt.get(realmId) as TokenData | undefined;
    return row || null;
  }

  /**
   * Update token data
   */
  update(realmId: string, data: Partial<TokenData>): void {
    const db = getDb();
    const now = Date.now();

    const updates: string[] = [];
    const values: any[] = [];

    if (data.accessToken !== undefined) {
      updates.push('access_token = ?');
      values.push(data.accessToken);
    }
    if (data.refreshToken !== undefined) {
      updates.push('refresh_token = ?');
      values.push(data.refreshToken);
    }
    if (data.expiresAt !== undefined) {
      updates.push('expires_at = ?');
      values.push(data.expiresAt);
    }

    updates.push('updated_at = ?');
    values.push(now);

    values.push(realmId);

    const stmt = db.prepare(`
      UPDATE tokens 
      SET ${updates.join(', ')}
      WHERE realm_id = ?
    `);

    stmt.run(...values);
    logger.debug(`Token updated for realm: ${realmId}`);
  }

  /**
   * Get the first available realm ID (for single-company setups)
   */
  getActiveRealmId(): string | null {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT realm_id as realmId
      FROM tokens
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    const row = stmt.get() as { realmId: string } | undefined;
    return row?.realmId || null;
  }

  /**
   * Check if any tokens exist
   */
  hasTokens(): boolean {
    const db = getDb();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM tokens');
    const row = stmt.get() as { count: number };
    return row.count > 0;
  }

  /**
   * Delete token by realm ID
   */
  delete(realmId: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM tokens WHERE realm_id = ?');
    stmt.run(realmId);
    logger.info(`Token deleted for realm: ${realmId}`);
  }
}

// Export singleton instance
export const tokenRepository = new TokenRepository();
