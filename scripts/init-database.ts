import { readFile } from 'node:fs/promises';
import { getDb } from '../api/queries/connection';
import type { RowDataPacket } from 'mysql2/promise';

// This is the initial baseline, not a migration runner. Existing tables are never altered.
async function main() {
  const baseline = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const statements = baseline.replace(/^--.*$/gm, '').split(';').map(sql => sql.trim()).filter(Boolean);
  if (statements.length !== 4 || statements.some(sql => !/^CREATE TABLE `tr_\w+` \(/.test(sql))) {
    throw new Error('Invalid baseline');
  }
  const db = getDb();
  try {
    const connection = await db.$client.promise().getConnection();
    let locked = false;
    try {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK('traderusa_schema_init', 60) AS acquired");
      locked = rows[0]?.acquired === 1;
      if (!locked) throw new Error('Initialization lock unavailable');
      for (const statement of statements) {
        await connection.query(statement.replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS '));
        const table = statement.match(/^CREATE TABLE (`tr_\w+`)/)![1];
        const columns = [...statement.matchAll(/^\s+(`\w+`)\s/gm)].map(match => match[1]);
        // Fail the deployment when an existing table lacks a required column.
        await connection.query(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 0`);
      }
      console.log('Tablas de TraderUSA listas. Se conservaron los datos existentes.');
    } finally {
      try {
        if (locked) await connection.query("SELECT RELEASE_LOCK('traderusa_schema_init')");
      } finally {
        connection.release();
      }
    }
  } finally {
    await db.$client.promise().end();
  }
}

main().catch(() => {
  console.error('No se pudo preparar la base. Comprueba DATABASE_URL, que MySQL esté disponible y la compatibilidad del esquema. No se realizaron migraciones sobre tablas existentes.');
  process.exitCode = 1;
});
