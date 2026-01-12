import { QuickBooks, logger, config, ObjectType, SyncHistoryStatus } from '@quickbooks-integration/lib';
import { invoiceRepository, syncStateRepository, syncHistoryRepository } from '../repositories';

export class InvoiceSyncService {
  private qb: QuickBooks;
  private realmId: string;

  constructor(realmId: string) {
    this.realmId = realmId;
    this.qb = new QuickBooks(realmId);
  }

  /**
   * Sync invoices from QuickBooks
   * Uses incremental sync based on Metadata.LastUpdatedTime
   */
  async sync(): Promise<{ synced: number; errors: number }> {
    logger.info(`Starting invoice sync for realm: ${this.realmId}`);
    
    const startTime = Date.now();
    let recordsSynced = 0;
    let recordsFailed = 0;
    let cursorBefore: string | undefined;
    let cursorAfter: string | undefined;
    let errorMessage: string | undefined;
    let syncStatus: SyncHistoryStatus = SyncHistoryStatus.SUCCESS;

    try {
      // Mark sync as in progress
      syncStateRepository.markInProgress(this.realmId, ObjectType.INVOICE);

      // Get last sync cursor
      const state = syncStateRepository.get(this.realmId, ObjectType.INVOICE);
      cursorBefore = state.cursor || undefined;

      // Build query
      const maxResults = config.quickbooks.maxResults;
      const query = cursorBefore
        ? `SELECT * FROM Invoice WHERE Metadata.LastUpdatedTime > '${cursorBefore}' MAXRESULTS ${maxResults}`
        : `SELECT * FROM Invoice MAXRESULTS ${maxResults}`;

      logger.debug(`Executing invoice query: ${query}`);

      // Query QuickBooks API
      const result = await this.qb.query(query);

      // Extract invoices from response
      const invoices = result.QueryResponse?.Invoice || [];
      logger.info(`Fetched ${invoices.length} invoices from QuickBooks`);

      if (invoices.length === 0) {
        // No new invoices, mark success with existing cursor
        syncStateRepository.markSuccess(this.realmId, ObjectType.INVOICE, cursorBefore);
        cursorAfter = cursorBefore;
        
        // Log history
        const endTime = Date.now();
        syncHistoryRepository.create({
          realmId: this.realmId,
          objectType: ObjectType.INVOICE,
          status: SyncHistoryStatus.SUCCESS,
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

      // Upsert invoices to database
      const invoicesToUpsert = invoices.map((invoice: any) => ({
        id: invoice.Id,
        realmId: this.realmId,
        customerId: this.extractCustomerId(invoice),
        rawData: JSON.stringify(invoice)
      }));

      invoiceRepository.batchUpsert(invoicesToUpsert);
      recordsSynced = invoices.length;

      // Calculate new cursor (max LastUpdatedTime from batch)
      const newCursor = this.getMaxTimestamp(invoices);
      cursorAfter = newCursor;
      logger.debug(`New cursor for invoices: ${newCursor}`);

      // Mark sync as successful
      syncStateRepository.markSuccess(this.realmId, ObjectType.INVOICE, newCursor);

      logger.info(`Invoice sync completed: ${invoices.length} records synced`);
      
      // Log history
      const endTime = Date.now();
      syncHistoryRepository.create({
        realmId: this.realmId,
        objectType: ObjectType.INVOICE,
        status: SyncHistoryStatus.SUCCESS,
        recordsSynced,
        recordsFailed: 0,
        durationMs: endTime - startTime,
        cursorBefore,
        cursorAfter,
        startedAt: startTime,
        completedAt: endTime,
      });
      
      return { synced: invoices.length, errors: 0 };

    } catch (error: any) {
      logger.error(`Invoice sync failed: ${error.message}`);
      syncStatus = SyncHistoryStatus.FAILURE;
      errorMessage = error.message;
      recordsFailed = 1;
      
      // Mark sync as failed
      syncStateRepository.markFailure(
        this.realmId,
        ObjectType.INVOICE,
        error.message
      );

      // Log history
      const endTime = Date.now();
      syncHistoryRepository.create({
        realmId: this.realmId,
        objectType: ObjectType.INVOICE,
        status: SyncHistoryStatus.FAILURE,
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
   * Extract customer ID from invoice CustomerRef
   */
  private extractCustomerId(invoice: any): string | undefined {
    return invoice.CustomerRef?.value;
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
    totalInvoices: number;
    lastSyncTime?: Date;
    status: string;
    cursor?: string;
  }> {
    const count = invoiceRepository.countByRealmId(this.realmId);
    const state = syncStateRepository.get(this.realmId, ObjectType.INVOICE);

    return {
      totalInvoices: count,
      lastSyncTime: state.lastSyncSuccess ? new Date(state.lastSyncSuccess) : undefined,
      status: state.status,
      cursor: state.cursor
    };
  }

  /**
   * Reset sync state (forces full resync)
   */
  async reset(): Promise<void> {
    logger.warn(`Resetting invoice sync state for realm: ${this.realmId}`);
    syncStateRepository.reset(this.realmId, ObjectType.INVOICE);
  }
}
