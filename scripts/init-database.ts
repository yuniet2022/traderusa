import { readFile } from 'node:fs/promises';
import { getDb } from '../api/queries/connection';
import type { RowDataPacket } from 'mysql2/promise';

// Baseline plus explicitly reviewed additive tables. Existing tables are never altered.
async function main() {
  const baseline = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const additions = await readFile(new URL('./002-paper-trading.sql', import.meta.url), 'utf8');
  const statements = `${baseline}\n${additions}`.replace(/^--.*$/gm, '').split(';').map(sql => sql.trim()).filter(Boolean);
  const expected = ['tr_users', 'tr_access_codes', 'tr_positions', 'tr_alerts', 'tr_paper_accounts', 'tr_paper_trades'];
  if (statements.length !== expected.length || statements.some(sql => !/^CREATE TABLE `tr_\w+` \(/.test(sql)) ||
    !expected.every(table => statements.some(sql => sql.startsWith(`CREATE TABLE \`${table}\` (`)))) {
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
