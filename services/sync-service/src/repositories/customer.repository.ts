import { getDb, logger } from '@quickbooks-integration/lib';

export interface Customer {
  id: string;
  realmId: string;
  rawData: string;
  createdAt?: number;
  updatedAt?: number;
}

export class CustomerRepository {
  /**
   * Upsert customer (insert or update if exists)
   */
  upsert(customer: Customer): void {
    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO customers (id, realm_id, raw_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        realm_id = excluded.realm_id,
        raw_data = excluded.raw_data,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      customer.id,
      customer.realmId,
      customer.rawData,
      now,
      now
    );

    logger.debug(`Customer upserted: ${customer.id}`);
  }

  /**
   * Batch upsert multiple customers (transaction)
   */
  batchUpsert(customers: Customer[]): void {
    if (customers.length === 0) return;

    const db = getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO customers (id, realm_id, raw_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        realm_id = excluded.realm_id,
        raw_data = excluded.raw_data,
        updated_at = excluded.updated_at
    `);

    const insertMany = db.transaction((customers: Customer[]) => {
      for (const customer of customers) {
        stmt.run(
          customer.id,
          customer.realmId,
          customer.rawData,
          now,
          now
        );
      }
    });

    insertMany(customers);
    logger.info(`Batch upserted ${customers.length} customers`);
  }

  /**
   * Find customer by ID
   */
  findById(id: string): Customer | null {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT 
        id,
        realm_id as realmId,
        raw_data as rawData,
        created_at as createdAt,
        updated_at as updatedAt
      FROM customers
      WHERE id = ?
    `);

    const row = stmt.get(id) as Customer | undefined;
    return row || null;
  }

  /**
   * Find all customers for a realm
   */
  findByRealmId(realmId: string, limit?: number): Customer[] {
    const db = getDb();

    const query = `
      SELECT 
        id,
        realm_id as realmId,
        raw_data as rawData,
        created_at as createdAt,
        updated_at as updatedAt
      FROM customers
      WHERE realm_id = ?
      ORDER BY updated_at DESC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const stmt = db.prepare(query);
    const rows = limit 
      ? stmt.all(realmId, limit) as Customer[]
      : stmt.all(realmId) as Customer[];

    return rows;
  }

  /**
   * Get total count of customers for a realm
   */
  countByRealmId(realmId: string): number {
    const db = getDb();

    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM customers
      WHERE realm_id = ?
    `);

    const row = stmt.get(realmId) as { count: number };
    return row.count;
  }

  /**
   * Delete customer by ID
   */
  delete(id: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM customers WHERE id = ?');
    stmt.run(id);
    logger.debug(`Customer deleted: ${id}`);
  }

  /**
   * Delete all customers for a realm
   */
  deleteByRealmId(realmId: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM customers WHERE realm_id = ?');
    const result = stmt.run(realmId);
    logger.info(`Deleted ${result.changes} customers for realm: ${realmId}`);
  }
}

// Export singleton instance
export const customerRepository = new CustomerRepository();
