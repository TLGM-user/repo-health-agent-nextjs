#!/usr/bin/env node

const { Client } = require('pg');

async function main() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    console.error('POSTGRES_URL is not set. Add it to .env.local');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Database migration check completed');
  } catch (error) {
    console.error('❌ Database migration failed');
    console.error(error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
