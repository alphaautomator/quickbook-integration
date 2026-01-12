#!/bin/bash

# Script to inspect QuickBooks integration database

DB_PATH="${DATABASE_PATH:-./quickbooks.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "❌ Database not found at: $DB_PATH"
    echo "Run the services first to create the database."
    exit 1
fi

echo "╔══════════════════════════════════════════════════╗"
echo "║   QuickBooks Integration Database Inspector      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check if sqlite3 is installed
if ! command -v sqlite3 &> /dev/null; then
    echo "❌ sqlite3 command not found. Please install SQLite."
    exit 1
fi

echo "📊 Database: $DB_PATH"
echo ""

# Tokens
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 TOKENS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sqlite3 "$DB_PATH" <<EOF
.mode column
.headers on
SELECT 
    realm_id,
    CASE 
        WHEN expires_at > strftime('%s', 'now') * 1000 THEN '✅ Valid'
        ELSE '⚠️  Expired'
    END as status,
    datetime(expires_at/1000, 'unixepoch') as expires_at,
    datetime(updated_at/1000, 'unixepoch') as updated_at
FROM tokens;
EOF
echo ""

# Customers
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👥 CUSTOMERS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CUSTOMER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM customers;")
echo "Total: $CUSTOMER_COUNT"
if [ "$CUSTOMER_COUNT" -gt 0 ]; then
    echo ""
    sqlite3 "$DB_PATH" <<EOF
.mode column
.headers on
SELECT 
    id,
    realm_id,
    datetime(updated_at/1000, 'unixepoch') as last_updated
FROM customers
ORDER BY updated_at DESC
LIMIT 5;
EOF
fi
echo ""

# Invoices
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 INVOICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
INVOICE_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM invoices;")
echo "Total: $INVOICE_COUNT"
if [ "$INVOICE_COUNT" -gt 0 ]; then
    echo ""
    sqlite3 "$DB_PATH" <<EOF
.mode column
.headers on
SELECT 
    id,
    realm_id,
    customer_id,
    datetime(updated_at/1000, 'unixepoch') as last_updated
FROM invoices
ORDER BY updated_at DESC
LIMIT 5;
EOF
fi
echo ""

# Sync State
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 SYNC STATE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sqlite3 "$DB_PATH" <<EOF
.mode column
.headers on
SELECT 
    realm_id,
    object_type,
    status,
    CASE 
        WHEN last_sync_success IS NOT NULL THEN datetime(last_sync_success/1000, 'unixepoch')
        ELSE 'Never'
    END as last_success,
    cursor,
    error_message
FROM sync_state
ORDER BY object_type;
EOF
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 Tips:"
echo "  - Use 'sqlite3 $DB_PATH' for interactive SQL"
echo "  - View raw JSON: SELECT json(raw_data) FROM customers LIMIT 1;"
echo "  - Reset sync: DELETE FROM sync_state;"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
