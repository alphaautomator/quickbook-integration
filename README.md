# QuickBooks Integration Service

A Node.js service that syncs Customer and Invoice data from QuickBooks Online to a local database. Built with TypeScript, uses OAuth 2.0 for authentication, and handles token refresh automatically.

## Overview

This service connects to QuickBooks Online via their API and continuously syncs data to a local SQLite database. It runs as a background worker that polls for changes every 5 minutes and stores the raw QuickBooks objects for further processing.

**What it does:**
- Authenticates with QuickBooks using OAuth 2.0
- Performs initial backfill of all Customers and Invoices
- Syncs incremental changes using timestamp-based queries
- Automatically refreshes access tokens when they expire
- Tracks sync progress per object type to recover from failures

## Quick Start

### Prerequisites

- Node.js 18 or higher
- A QuickBooks Developer account with a Sandbox app
- SQLite (usually pre-installed on macOS/Linux)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your QuickBooks credentials:

```env
# Your app credentials from developer.intuit.com
QB_CLIENT_ID=your_client_id
QB_CLIENT_SECRET=your_client_secret

# Get these from OAuth Playground
QB_AUTHORIZATION_CODE=your_auth_code
QB_REALM_ID=your_realm_id

# Optional - defaults provided
QB_ENVIRONMENT=sandbox
QB_MAX_RESULTS=1000
DATABASE_PATH=./quickbooks.db
SYNC_INTERVAL_MINUTES=5
```

**Getting credentials:**
1. Create an app at https://developer.intuit.com/app/developer/myapps
2. Get authorization code from https://developer.intuit.com/app/developer/playground
3. Select scope: `com.intuit.quickbooks.accounting`

### 3. Bootstrap (One-time)

Exchange the authorization code for tokens:

```bash
npm run bootstrap
```

This saves the access and refresh tokens to the database. After this succeeds, remove `QB_AUTHORIZATION_CODE` from your `.env` file (it can only be used once).

### 4. Run the Sync Service

```bash
npm run dev
```

The service will:
- Connect to your QuickBooks company
- Perform initial sync of all customers and invoices
- Continue syncing changes every 5 minutes
- Log all operations to console

## Project Structure

```
quickbook-integration/
├── lib/                          # Shared library used by all services
│   └── src/
│       ├── quickbooks/
│       │   ├── client.ts         # QuickBooks API client with auto-token-refresh
│       │   └── oauth.ts          # OAuth token exchange functions
│       ├── database/
│       │   ├── connection.ts     # SQLite database connection
│       │   ├── schema.ts         # Database table definitions
│       │   └── repositories/
│       │       └── token.repository.ts  # Token storage/retrieval
│       ├── config.ts             # Environment configuration
│       └── utils/
│           └── logger.ts         # Logging utility
│
├── services/
│   └── sync-service/             # Background sync worker
│       └── src/
│           ├── worker.ts         # Main entry point, scheduler
│           ├── repositories/     # Data access layer
│           │   ├── customer.repository.ts
│           │   ├── invoice.repository.ts
│           │   └── sync-state.repository.ts
│           └── services/         # Sync business logic
│               ├── customer-sync.ts
│               └── invoice-sync.ts
│
├── scripts/
│   ├── bootstrap.ts              # One-time token exchange CLI
│   └── inspect-db.sh             # Database inspection tool
│
└── [config files]
```

## How It Works

### Authentication Flow

The service uses OAuth 2.0 with refresh tokens:

1. **Bootstrap**: You provide an authorization code (from QuickBooks OAuth Playground)
2. **Token Exchange**: The bootstrap script exchanges this code for access and refresh tokens
3. **Token Storage**: Tokens are stored in the SQLite database
4. **Auto-Refresh**: Before each API call, the client checks if the token is expired and refreshes it automatically
5. **Token Rotation**: QuickBooks rotates refresh tokens on each refresh - we always save the new one

The QuickBooks client (`lib/quickbooks/client.ts`) handles all of this transparently. Services just create a client instance and make API calls - no need to worry about tokens.

### Data Sync Strategy

We use timestamp-based change data capture:

**Initial Sync:**
```sql
SELECT * FROM Customer MAXRESULTS 1000
```

**Incremental Sync:**
```sql
SELECT * FROM Customer 
WHERE Metadata.LastUpdatedTime > '2024-01-13T10:00:00'
MAXRESULTS 1000
```

The sync state table tracks the last synced timestamp (cursor) for each object type. On each sync:
1. Query records changed since last cursor
2. Upsert them to the database (INSERT or UPDATE)
3. Calculate new cursor = max(LastUpdatedTime) from batch
4. Save new cursor on success

If a sync fails, the cursor is preserved so the next sync resumes from where it left off.

### Database Schema

**tokens** - OAuth tokens (managed by library)
- Stores access_token, refresh_token, expires_at
- One row per QuickBooks company

**customers** - Customer records
- `id`: QuickBooks Customer.Id
- `realm_id`: Company identifier
- `raw_data`: Full JSON from QuickBooks API
- `created_at`, `updated_at`: Timestamps

**invoices** - Invoice records
- `id`: QuickBooks Invoice.Id
- `realm_id`: Company identifier
- `customer_id`: Extracted from Invoice.CustomerRef.value
- `raw_data`: Full JSON from QuickBooks API
- `created_at`, `updated_at`: Timestamps

**sync_state** - Sync progress tracking
- `realm_id`: Company identifier
- `object_type`: 'customer' or 'invoice'
- `status`: 'pending', 'in_progress', 'success', 'failure'
- `cursor`: Last synced timestamp (ISO 8601)
- `last_sync_attempt`, `last_sync_success`: Timestamps
- `error_message`: If failed, why

## Development

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

This builds both the shared library and the sync service.

### Run in Development

```bash
npm run dev
```

This runs the sync service with TypeScript compilation on the fly using `ts-node`.

### Inspect Database

View current database contents and sync status:

```bash
npm run inspect-db
```

Or use SQLite directly:

```bash
sqlite3 quickbooks.db
> SELECT COUNT(*) FROM customers;
> SELECT * FROM sync_state;
```

### Logs

The service logs all operations to stdout with timestamps and severity levels:

```
[INFO] Starting customer sync for realm: 1234567890
[INFO] Fetched 10 customers from QuickBooks
[INFO] Customer sync completed: 10 records synced
```

Set `LOG_LEVEL=debug` in `.env` for more detailed logs.

## Configuration

All configuration is done via environment variables in `.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `QB_CLIENT_ID` | Yes | - | Your QuickBooks app Client ID |
| `QB_CLIENT_SECRET` | Yes | - | Your QuickBooks app Client Secret |
| `QB_AUTHORIZATION_CODE` | Bootstrap only | - | One-time authorization code |
| `QB_REALM_ID` | Bootstrap only | - | QuickBooks company ID |
| `QB_ENVIRONMENT` | No | `sandbox` | `sandbox` or `production` |
| `QB_REDIRECT_URI` | No | OAuth Playground URL | Must match where code was obtained |
| `QB_MAX_RESULTS` | No | `1000` | Max records per API request (1-1000) |
| `DATABASE_PATH` | No | `./quickbooks.db` | Path to SQLite database |
| `SYNC_INTERVAL_MINUTES` | No | `5` | How often to sync |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

## Production Deployment

### Build for Production

```bash
npm run build
```

### Run

```bash
npm start
```

Or use a process manager like PM2:

```bash
pm2 start npm --name quickbooks-sync -- start
```

### Monitoring

- Check logs for sync errors
- Query `sync_state` table for per-object status
- Monitor token expiration dates
- Set up alerts for failed syncs

### Database

For production, consider:
- Using PostgreSQL instead of SQLite
- Setting up regular backups
- Adding indexes if querying frequently
- Encrypting the database file

## Troubleshooting

### "No active realm found"

**Cause:** Bootstrap hasn't been run yet

**Fix:** Run `npm run bootstrap` with valid `QB_AUTHORIZATION_CODE` and `QB_REALM_ID` in `.env`

### "Token refresh failed"

**Cause:** Refresh token expired or invalid

**Fix:** Get a new authorization code and run bootstrap again

### Database not found

**Cause:** Wrong `DATABASE_PATH` or running from wrong directory

**Fix:** Use absolute path in `DATABASE_PATH` or always run from project root

### Sync finds 0 records

**Possible causes:**
- No data in QuickBooks company
- Wrong realm_id
- API permissions not granted

**Fix:** Check realm_id matches your company, verify data exists in QuickBooks UI

## Known Limitations

- Single company support (one realm_id at a time)
- Polling-based (no webhooks)
- Fetches up to `QB_MAX_RESULTS` records per sync cycle (default 1000) to avoid memory issues
- SQLite not suitable for high-concurrency scenarios

## Extending

### Add More Object Types

1. Create a new sync service (e.g., `vendor-sync.ts`)
2. Add a repository (e.g., `vendor.repository.ts`)
3. Create the database table in `schema.ts`
4. Call the sync service from `worker.ts`


## License

MIT

## Support

For QuickBooks API documentation: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account
