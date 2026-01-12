#!/usr/bin/env ts-node

import {
  config,
  validateConfig,
  initializeDatabase,
  tokenRepository,
  logger
} from '../lib/src/index';
import { syncHistoryRepository } from '../services/sync-service/src/repositories';

/**
 * View sync history - displays historical sync operations
 *
 * Usage:
 *   npm run sync-history              # Show summary
 *   npm run sync-history -- --full    # Show detailed history
 *   npm run sync-history -- --limit 20  # Show last 20 records
 */

interface Options {
  full: boolean;
  limit: number;
  objectType?: 'customer' | 'invoice';
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    full: false,
    limit: 10,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--full':
        options.full = true;
        break;
      case '--limit':
        options.limit = parseInt(args[i + 1] || '10', 10);
        i++;
        break;
      case '--type':
        const type = args[i + 1];
        if (type === 'customer' || type === 'invoice') {
          options.objectType = type;
        }
        i++;
        break;
    }
  }

  return options;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString();
}

async function displaySummary(realmId: string) {
  console.log('');
  console.log('==========================================================');
  console.log('SYNC HISTORY SUMMARY');
  console.log('==========================================================');
  console.log('');

  const summary = syncHistoryRepository.getSummary(realmId);

  if (summary.length === 0) {
    console.log('No sync history found.');
    return;
  }

  summary.forEach(s => {
    console.log(`Object Type: ${s.objectType.toUpperCase()}`);
    console.log(`  Total Syncs:      ${s.totalSyncs}`);
    console.log(`  Successful:       ${s.successfulSyncs}`);
    console.log(`  Failed:           ${s.failedSyncs}`);
    console.log(`  Records Synced:   ${s.totalRecordsSynced}`);
    console.log(`  Last Sync:        ${s.lastSyncTime ? new Date(s.lastSyncTime).toLocaleString() : 'Never'}`);
    console.log(`  Last Status:      ${s.lastSyncStatus}`);
    console.log('');
  });
}

async function displayDetailedHistory(realmId: string, options: Options) {
  console.log('');
  console.log('==========================================================');
  console.log('DETAILED SYNC HISTORY');
  console.log('==========================================================');
  console.log('');

  const history = options.objectType
    ? syncHistoryRepository.findByRealmAndType(realmId, options.objectType, options.limit)
    : syncHistoryRepository.findByRealmId(realmId, options.limit);

  if (history.length === 0) {
    console.log('No sync history found.');
    return;
  }

  console.log(`Showing last ${history.length} sync operation(s):\n`);

  history.forEach((record, index) => {
    console.log(`[${index + 1}] ${record.objectType.toUpperCase()} Sync`);
    console.log(`  Status:           ${record.status.toUpperCase()}`);
    console.log(`  Records Synced:   ${record.recordsSynced}`);
    console.log(`  Records Failed:   ${record.recordsFailed}`);
    console.log(`  Duration:         ${formatDuration(record.durationMs)}`);
    console.log(`  Started At:       ${formatDate(record.startedAt)}`);
    console.log(`  Completed At:     ${formatDate(record.completedAt)}`);
    
    if (record.cursorBefore) {
      console.log(`  Cursor Before:    ${record.cursorBefore}`);
    }
    if (record.cursorAfter) {
      console.log(`  Cursor After:     ${record.cursorAfter}`);
    }
    if (record.errorMessage) {
      console.log(`  Error:            ${record.errorMessage}`);
    }
    console.log('');
  });

  const totalRecords = syncHistoryRepository.count(
    realmId,
    options.objectType
  );
  
  if (totalRecords > history.length) {
    console.log(`Showing ${history.length} of ${totalRecords} total records.`);
    console.log(`Use --limit ${totalRecords} to see all records.`);
    console.log('');
  }
}

async function main() {
  console.log('==========================================================');
  console.log('QuickBooks Sync History Viewer');
  console.log('==========================================================');

  try {
    // Validate config
    validateConfig();

    // Initialize database
    initializeDatabase();

    // Get active realm ID
    const realmId = tokenRepository.getActiveRealmId();

    if (!realmId) {
      console.error('\n[ERROR] No active realm found. Please run bootstrap first.\n');
      process.exit(1);
    }

    console.log(`\nRealm ID: ${realmId}`);

    // Parse command line options
    const options = parseArgs();

    if (options.full) {
      await displayDetailedHistory(realmId, options);
    } else {
      await displaySummary(realmId);
      console.log('');
      console.log('TIP: Use --full to see detailed history');
      console.log('     Use --limit N to show last N records');
      console.log('     Use --type customer|invoice to filter by type');
    }

    console.log('==========================================================');

  } catch (error: any) {
    logger.error('Failed to display sync history:', error.message);
    process.exit(1);
  }
}

main();
