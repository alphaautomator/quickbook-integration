import { getDb, logger } from '@quickbooks-integration/lib';

export interface Invoice {
  id: string;
  realmId: string;
  customerId?: string;
  rawData: string;
  createdAt?: number;
  updatedAt?: number;
}

export class InvoiceRepository {
  /**
   * Upsert invoice (insert or update if exists)
   */
  upsert(invoice: Invoice): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO invoices (id, realm_id, customer_id, raw_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        realm_id = excluded.realm_id,
        customer_id = excluded.customer_id,
        raw_data = excluded.raw_data,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      invoice.id,
      invoice.realmId,
      invoice.customerId || null,
      invoice.rawData,
      now,
      now
    );

    logger.debug(`Invoice upserted: ${invoice.id}`);
  }

  /**
   * Batch upsert multiple invoices (transaction)
   */
  batchUpsert(invoices: Invoice[]): void {
    if (invoices.length === 0) return;

    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO invoices (id, realm_id, customer_id, raw_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        realm_id = excluded.realm_id,
        customer_id = excluded.customer_id,
        raw_data = excluded.raw_data,
        updated_at = excluded.updated_at
    `);

    const insertMany = db.transaction((invoices: Invoice[]) => {
      for (const invoice of invoices) {
        stmt.run(
          invoice.id,
          invoice.realmId,
          invoice.customerId || null,
          invoice.rawData,
          now,
          now
        );
      }
    });

    insertMany(invoices);
    logger.info(`Batch upserted ${invoices.length} invoices`);
  }

  /**
   * Find invoice by ID
   */
  findById(id: string): Invoice | null {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        customer_id as customerId,
        raw_data as rawData,
        created_at as createdAt,
        updated_at as updatedAt
      FROM invoices
      WHERE id = ?
    `);

    const row = stmt.get(id) as Invoice | undefined;
    return row || null;
  }

  /**
   * Find all invoices for a realm
   */
  findByRealmId(realmId: string, limit?: number): Invoice[] {
    const db = getDb();

    const query = `
      SELECT 
        id,
        realm_id as realmId,
        customer_id as customerId,
        raw_data as rawData,
        created_at as createdAt,
        updated_at as updatedAt
      FROM invoices
      WHERE realm_id = ?
      ORDER BY updated_at DESC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const stmt = db.prepare(query);
    const rows = limit 
      ? stmt.all(realmId, limit) as Invoice[]
      : stmt.all(realmId) as Invoice[];

    return rows;
  }

  /**
   * Find invoices by customer ID
   */
  findByCustomerId(customerId: string, limit?: number): Invoice[] {
    const db = getDb();

    const query = `
      SELECT 
        id,
        realm_id as realmId,
        customer_id as customerId,
        raw_data as rawData,
        created_at as createdAt,
        updated_at as updatedAt
      FROM invoices
      WHERE customer_id = ?
      ORDER BY updated_at DESC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const stmt = db.prepare(query);
    const rows = limit 
      ? stmt.all(customerId, limit) as Invoice[]
      : stmt.all(customerId) as Invoice[];

    return rows;
  }

  /**
   * Get total count of invoices for a realm
   */
  countByRealmId(realmId: string): number {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM invoices
      WHERE realm_id = ?
    `);

    const row = stmt.get(realmId) as { count: number };
    return row.count;
  }

  /**
   * Get count of invoices by customer
   */
  countByCustomerId(customerId: string): number {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM invoices
      WHERE customer_id = ?
    `);

    const row = stmt.get(customerId) as { count: number };
    return row.count;
  }

  /**
   * Delete invoice by ID
   */
  delete(id: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM invoices WHERE id = ?');
    stmt.run(id);
    logger.debug(`Invoice deleted: ${id}`);
  }

  /**
   * Delete all invoices for a realm
   */
  deleteByRealmId(realmId: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM invoices WHERE realm_id = ?');
    const result = stmt.run(realmId);
    logger.info(`Deleted ${result.changes} invoices for realm: ${realmId}`);
  }
}

// Export singleton instance
export const invoiceRepository = new InvoiceRepository();
