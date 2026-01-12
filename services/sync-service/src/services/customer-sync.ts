import { QuickBooks, logger, config } from '@quickbooks-integration/lib';
import { customerRepository, syncStateRepository, syncHistoryRepository } from '../repositories';

export class CustomerSyncService {
  private qb: QuickBooks;
  private realmId: string;

  constructor(realmId: string) {
    this.realmId = realmId;
    this.qb = new QuickBooks(realmId);
  }

  /**
   * Sync customers from QuickBooks
   * Uses incremental sync based on Metadata.LastUpdatedTime
   */
  async sync(): Promise<{ synced: number; errors: number }> {
    logger.info(`Starting customer sync for realm: ${this.realmId}`);
    
    const startTime = Date.now();
    let recordsSynced = 0;
    let recordsFailed = 0;
    let cursorBefore: string | undefined;
    let cursorAfter: string | undefined;
    let errorMessage: string | undefined;
    let syncStatus: 'success' | 'failure' | 'partial' = 'success';

    try {
      // Mark sync as in progress
      syncStateRepository.markInProgress(this.realmId, 'customer');

      // Get last sync cursor
      const state = syncStateRepository.get(this.realmId, 'customer');
      cursorBefore = state.cursor || undefined;

      // Build query
      const maxResults = config.quickbooks.maxResults;
      const query = cursorBefore
        ? `SELECT * FROM Customer WHERE Metadata.LastUpdatedTime > '${cursorBefore}' MAXRESULTS ${maxResults}`
        : `SELECT * FROM Customer MAXRESULTS ${maxResults}`;

      logger.debug(`Executing customer query: ${query}`);

      // Query QuickBooks API
      const result = await this.qb.query(query);

      // Extract customers from response
      const customers = result.QueryResponse?.Customer || [];
      logger.info(`Fetched ${customers.length} customers from QuickBooks`);

      if (customers.length === 0) {
        // No new customers, mark success with existing cursor
        syncStateRepository.markSuccess(this.realmId, 'customer', cursorBefore);
        cursorAfter = cursorBefore;
        
        // Log history
        const endTime = Date.now();
        syncHistoryRepository.create({
          realmId: this.realmId,
          objectType: 'customer',
          status: 'success',
          recordsSynced: 0,
          recordsFailed: 0,
          durationMs: endTime - startTime,
          cursorBefore,
          cursorAfter,
          startedAt: startTime,
          completedAt: endTime,
        });
        
        return { synced: 0, errors: 0 };
      }

      // Upsert customers to database
      const customersToUpsert = customers.map((customer: any) => ({
        id: customer.Id,
        realmId: this.realmId,
        rawData: JSON.stringify(customer)
      }));

      customerRepository.batchUpsert(customersToUpsert);
      recordsSynced = customers.length;

      // Calculate new cursor (max LastUpdatedTime from batch)
      const newCursor = this.getMaxTimestamp(customers);
      cursorAfter = newCursor;
      logger.debug(`New cursor for customers: ${newCursor}`);

      // Mark sync as successful
      syncStateRepository.markSuccess(this.realmId, 'customer', newCursor);

      logger.info(`Customer sync completed: ${customers.length} records synced`);
      
      // Log history
      const endTime = Date.now();
      syncHistoryRepository.create({
        realmId: this.realmId,
        objectType: 'customer',
        status: 'success',
        recordsSynced,
        recordsFailed: 0,
        durationMs: endTime - startTime,
        cursorBefore,
        cursorAfter,
        startedAt: startTime,
        completedAt: endTime,
      });
      
      return { synced: customers.length, errors: 0 };

    } catch (error: any) {
      logger.error(`Customer sync failed: ${error.message}`);
      syncStatus = 'failure';
      errorMessage = error.message;
      recordsFailed = 1;
      
      // Mark sync as failed
      syncStateRepository.markFailure(
        this.realmId,
        'customer',
        error.message
      );

      // Log history
      const endTime = Date.now();
      syncHistoryRepository.create({
        realmId: this.realmId,
        objectType: 'customer',
        status: 'failure',
        recordsSynced,
        recordsFailed,
        durationMs: endTime - startTime,
        cursorBefore,
        cursorAfter: cursorBefore, // Keep same cursor on failure
        errorMessage,
        startedAt: startTime,
        completedAt: endTime,
      });

      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Get maximum LastUpdatedTime from a batch of records
   */
  private getMaxTimestamp(records: any[]): string | undefined {
    if (records.length === 0) return undefined;

    const timestamps = records
      .map(r => r.MetaData?.LastUpdatedTime)
      .filter(t => t)
      .map(t => new Date(t).getTime());

    if (timestamps.length === 0) return undefined;

    const maxTimestamp = Math.max(...timestamps);
    return new Date(maxTimestamp).toISOString();
  }

  /**
   * Get sync statistics
   */
  async getStats(): Promise<{
    totalCustomers: number;
    lastSyncTime?: Date;
    status: string;
    cursor?: string;
  }> {
    const count = customerRepository.countByRealmId(this.realmId);
    const state = syncStateRepository.get(this.realmId, 'customer');

    return {
      totalCustomers: count,
      lastSyncTime: state.lastSyncSuccess ? new Date(state.lastSyncSuccess) : undefined,
      status: state.status,
      cursor: state.cursor
    };
  }

  /**
   * Reset sync state (forces full resync)
   */
  async reset(): Promise<void> {
    logger.warn(`Resetting customer sync state for realm: ${this.realmId}`);
     syncStateRepository.reset(this.realmId, 'customer');
  }
}
