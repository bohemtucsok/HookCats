#!/bin/sh
set -e

echo "Starting HookCats with migrations..."

# Run database migrations
echo "Running database migrations..."
node src/scripts/run-migrations.js

# Start the main application
echo "Starting HookCats server..."
exec node src/server.js
