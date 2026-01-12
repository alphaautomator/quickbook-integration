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

// Shutdown flag and cron task
let isShuttingDown = false;
let currentSyncPromise: Promise<void> | null = null;
let cronTask: cron.ScheduledTask | null = null;

/**
 * Main sync function - syncs all object types for active realm
 */
async function performSync(): Promise<void> {
  // Skip if shutting down
  if (isShuttingDown) {
    logger.info('Skipping sync - shutdown in progress');
    return;
  }

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

    // Sync customers and invoices concurrently
    logger.info('Starting concurrent sync for customers and invoices');

    const [customerResult, invoiceResult] = await Promise.allSettled([
      // Customer sync
      (async () => {
        try {
          const result = await customerSync.sync();
          const stats = await customerSync.getStats();
          logger.info(`Customer stats: ${stats.totalCustomers} total in DB`);
          return result;
        } catch (error: any) {
          logger.error('Customer sync threw unexpected error:', error);
          return { synced: 0, errors: 1 };
        }
      })(),
      
      // Invoice sync
      (async () => {
        try {
          const result = await invoiceSync.sync();
          const stats = await invoiceSync.getStats();
          logger.info(`Invoice stats: ${stats.totalInvoices} total in DB`);
          return result;
        } catch (error: any) {
          logger.error('Invoice sync threw unexpected error:', error);
          return { synced: 0, errors: 1 };
        }
      })()
    ]);

    // Aggregate results
    if (customerResult.status === 'fulfilled') {
      totalSynced += customerResult.value.synced;
      totalErrors += customerResult.value.errors;
    } else {
      logger.error('Customer sync failed:', customerResult.reason);
      totalErrors++;
    }

    if (invoiceResult.status === 'fulfilled') {
      totalSynced += invoiceResult.value.synced;
      totalErrors += invoiceResult.value.errors;
    } else {
      logger.error('Invoice sync failed:', invoiceResult.reason);
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

  logger.info('Next sync in 1 minute');
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
  logger.info('Sync interval: Every minute');
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
  currentSyncPromise = performSync();
  await currentSyncPromise;
  currentSyncPromise = null;

  // Schedule recurring syncs using cron - every minute
  const cronExpression = '*/5 * * * *';  // Every 5 minutes
  logger.info(`Scheduling recurring syncs: ${cronExpression} (every minute)`);

  cronTask = cron.schedule(cronExpression, async () => {
    if (!isShuttingDown) {
      currentSyncPromise = performSync();
      await currentSyncPromise;
      currentSyncPromise = null;
    }
  });

  logger.info('Sync worker is running');
  logger.info('Press Ctrl+C to stop');
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info('');
  logger.info(`Received ${signal}, initiating graceful shutdown...`);
  
  // Set shutdown flag to prevent new syncs
  isShuttingDown = true;

  // Stop cron task
  if (cronTask) {
    cronTask.stop();
    logger.info('Stopped cron scheduler');
  }

  // Wait for current sync to complete
  if (currentSyncPromise) {
    logger.info('Waiting for current sync to complete...');
    try {
      await Promise.race([
        currentSyncPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Sync timeout')), 30000)
        )
      ]);
      logger.info('Current sync completed');
    } catch (error) {
      logger.warn('Sync did not complete within timeout, forcing shutdown');
    }
  }

  // Close database connections
  try {
    const { closeDb } = await import('@quickbooks-integration/lib');
    closeDb();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database:', error);
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

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
