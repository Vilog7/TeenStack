import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCryptoContext } from '../../server/security.mjs';
import { initializeDatabase } from '../../server/db.mjs';
import { createPostgresDatabase } from '../../server/postgres_db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverDir = path.resolve(__dirname, '..', '..', 'server');
const sqlitePath = path.join(serverDir, 'teenstack.sqlite');
const pgDumpPath = path.join(serverDir, 'teenstack_pgdata.tar.gz');

async function main() {
  const cryptoCtx = createCryptoContext(process.env);
  const sqliteDb = initializeDatabase({ dbPath: sqlitePath, cryptoCtx, seedDemo: true });
  const pgDb = await createPostgresDatabase({ env: process.env, pgDumpPath });

  await pgDb.syncFromSqlite(sqliteDb, { persist: true });
  const overview = await pgDb.getDatabaseOverview();

  console.log('==============================================================');
  console.log(' TeenStack PostgreSQL Migration & Full Data Sync Complete');
  console.log('==============================================================');
  console.log(` Engine Mode : ${overview.mode}`);
  console.log(` PG Version  : ${overview.version}`);
  console.log(` Base Tables : ${overview.totalTables}`);
  console.log(` SQL Views   : ${overview.totalViews} (${overview.views.join(', ')})`);
  console.log(` Custom ENUMs: ${overview.totalEnums}`);
  console.log('--------------------------------------------------------------');
  for (const [table, count] of Object.entries(overview.tables)) {
    console.log(`  ${table.padEnd(30)} : ${count} rows`);
  }

  await pgDb.close();
  sqliteDb.close();
}

main().catch((err) => {
  console.error('[PostgreSQL Migration Failed]', err);
  process.exit(1);
});
