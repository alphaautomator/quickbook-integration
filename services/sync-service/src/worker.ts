import cron from 'node-cron';
import {
  config,
  validateConfig,
  initializeDatabase,
  tokenRepository,
  logger
} from '@quickbooks-integration/lib';
import { CustomerSyncService } from './services/customer-sync';
import { InvoiceSyncService } from './services/invoice-sync';
import { syncStateRepository } from './repositories';

// Validate configuration before starting
try {
  validateConfig();
  logger.info('Configuration validated successfully');
} catch (error: any) {
  logger.error('Configuration validation failed:', error.message);
  process.exit(1);
}

// Initialize database
initializeDatabase();
logger.info('Database initialized');

/**
 * Main sync function - syncs all object types for active realm
 */
async function performSync(): Promise<void> {
  logger.info('=== Starting sync cycle ===');

  try {
    // Get active realm ID
    const realmId = tokenRepository.getActiveRealmId();
    if (!realmId) {
      logger.warn('No active realm found. Please run bootstrap first.');
      logger.info('Steps:');
      logger.info('  1. Get authorization code from: https://developer.intuit.com/app/developer/playground');
      logger.info('  2. Add QB_AUTHORIZATION_CODE and QB_REALM_ID to .env');
      logger.info('  3. Run: npm run bootstrap');
      return;
    }

    logger.info(`Syncing data for realm: ${realmId}`);

    // Initialize sync services
    const customerSync = new CustomerSyncService(realmId);
    const invoiceSync = new InvoiceSyncService(realmId);

    // Track overall results
    let totalSynced = 0;
    let totalErrors = 0;

    // Sync customers
    try {
      const customerResult = await customerSync.sync();
      totalSynced += customerResult.synced;
      totalErrors += customerResult.errors;

      const customerStats = await customerSync.getStats();
      logger.info(`Customer stats: ${customerStats.totalCustomers} total in DB`);
    } catch (error: any) {
      logger.error('Customer sync threw unexpected error:', error);
      totalErrors++;
    }

    // Sync invoices
    try {
      const invoiceResult = await invoiceSync.sync();
      totalSynced += invoiceResult.synced;
      totalErrors += invoiceResult.errors;

      const invoiceStats = await invoiceSync.getStats();
      logger.info(`Invoice stats: ${invoiceStats.totalInvoices} total in DB`);
    } catch (error: any) {
      logger.error('Invoice sync threw unexpected error:', error);
      totalErrors++;
    }

    // Log summary
    logger.info('=== Sync cycle completed ===');
    logger.info(`Total records synced: ${totalSynced}`);
    logger.info(`Total errors: ${totalErrors}`);

    // Log all sync states
    const allStates = syncStateRepository.getAllByRealmId(realmId);
    logger.info('Current sync states:');
    allStates.forEach(state => {
      logger.info(`  - ${state.objectType}: ${state.status} ${state.cursor ? `(cursor: ${state.cursor})` : ''}`);
    });

  } catch (error: any) {
    logger.error('Sync cycle failed with unexpected error:', error);
  }

  logger.info(`Next sync in ${config.sync.intervalMinutes} minutes`);
  logger.info('');
}

/**
 * Display startup information
 */
function displayStartupInfo(): void {
  logger.info('==========================================================');
  logger.info('QuickBooks Sync Service');
  logger.info('==========================================================');
  logger.info(`Environment: ${config.quickbooks.environment}`);
  logger.info(`Sync interval: Every ${config.sync.intervalMinutes} minutes`);
  logger.info(`Database: ${config.database.path}`);

  // Check if already authorized
  const hasTokens = tokenRepository.hasTokens();
  const realmId = tokenRepository.getActiveRealmId();

  if (hasTokens && realmId) {
    logger.info(`Authorized for realm: ${realmId}`);
    logger.info('Sync service will start automatically');
  } else {
    logger.warn('Not authorized yet');
    logger.info('To authorize:');
    logger.info('  1. Visit: https://developer.intuit.com/app/developer/playground');
    logger.info('  2. Get authorization code and realm ID');
    logger.info('  3. Add to .env: QB_AUTHORIZATION_CODE and QB_REALM_ID');
    logger.info('  4. Run: npm run bootstrap');
    logger.info('Sync service will wait for authorization...');
  }
  logger.info('==========================================================');
}

/**
 * Main entry point
 */
async function main() {
  displayStartupInfo();

  // Run initial sync immediately
  logger.info('Running initial sync...');
  await performSync();

  // Schedule recurring syncs
  const cronExpression = `*/${config.sync.intervalMinutes} * * * *`;
  logger.info(`Scheduling recurring syncs: ${cronExpression}`);

  cron.schedule(cronExpression, async () => {
    await performSync();
  });

  logger.info('✅ Sync worker is running');
  logger.info('Press Ctrl+C to stop');
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('');
  logger.info('Shutting down Sync Service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('');
  logger.info('Shutting down Sync Service...');
  process.exit(0);
});

// Handle unhandled errors
process.on('unhandledRejection', (error: any) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the worker
main().catch(error => {
  logger.error('Fatal error starting sync worker:', error);
  process.exit(1);
});
