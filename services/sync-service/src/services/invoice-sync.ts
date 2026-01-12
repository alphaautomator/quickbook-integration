import { QuickBooks, logger } from '@quickbooks-integration/lib';
import { invoiceRepository, syncStateRepository } from '../repositories';

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

    try {
      // Mark sync as in progress
       syncStateRepository.markInProgress(this.realmId, 'invoice');

      // Get last sync cursor
      const state =  syncStateRepository.get(this.realmId, 'invoice');
      const cursor = state.cursor;

      // Build query
      const query = cursor
        ? `SELECT * FROM Invoice WHERE Metadata.LastUpdatedTime > '${cursor}' MAXRESULTS 1000`
        : `SELECT * FROM Invoice MAXRESULTS 1000`;

      logger.debug(`Executing invoice query: ${query}`);

      // Query QuickBooks API
      const result = await this.qb.query(query);

      // Extract invoices from response
      const invoices = result.QueryResponse?.Invoice || [];
      logger.info(`Fetched ${invoices.length} invoices from QuickBooks`);

      if (invoices.length === 0) {
        // No new invoices, mark success with existing cursor
         syncStateRepository.markSuccess(this.realmId, 'invoice', cursor);
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

      // Calculate new cursor (max LastUpdatedTime from batch)
      const newCursor = this.getMaxTimestamp(invoices);
      logger.debug(`New cursor for invoices: ${newCursor}`);

      // Mark sync as successful
       syncStateRepository.markSuccess(this.realmId, 'invoice', newCursor);

      logger.info(`Invoice sync completed: ${invoices.length} records synced`);
      return { synced: invoices.length, errors: 0 };

    } catch (error: any) {
      logger.error(`Invoice sync failed: ${error.message}`);
      
      // Mark sync as failed
       syncStateRepository.markFailure(
        this.realmId,
        'invoice',
        error.message
      );

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
    const state =  syncStateRepository.get(this.realmId, 'invoice');

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
     syncStateRepository.reset(this.realmId, 'invoice');
  }
}
