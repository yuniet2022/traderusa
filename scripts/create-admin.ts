import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '../api/queries/connection';
import { hashPassword } from '../api/sessionUtil';
import { users } from '../db/schema';
import type { RowDataPacket } from 'mysql2/promise';

class SetupError extends Error {}

async function main() {
  const ifNeeded = process.argv.includes('--if-needed');
  const db = getDb();
  try {
    const connection = await db.$client.promise().getConnection();
    let locked = false;
    try {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK('traderusa_initial_admin', 60) AS acquired");
      locked = rows[0]?.acquired === 1;
      if (!locked) throw new SetupError('Otra inicialización está en curso. Reintenta el despliegue.');
      const created = await db.transaction(async tx => {
        const existingAdmin = await tx.select({ id: users.id }).from(users).where(eq(users.isAdmin, 1)).limit(1).for('update');
        if (existingAdmin.length) {
          if (ifNeeded) return false;
          throw new SetupError('Ya existe un administrador. No se modificó ninguna cuenta.');
        }
        const credentials = z.object({
          username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
          password: z.string().min(12).max(128),
        }).safeParse({ username: process.env.TRADER_ADMIN_USER, password: process.env.TRADER_ADMIN_PASSWORD });
        if (!credentials.success) throw new SetupError('Configura TRADER_ADMIN_USER (3–32 caracteres) y TRADER_ADMIN_PASSWORD (12–128 caracteres).');
        const { username, password } = credentials.data;
        const existingUser = await tx.query.users.findFirst({ where: eq(users.username, username) });
        if (existingUser) throw new SetupError('Ese usuario ya existe. No se modificó su contraseña ni sus permisos.');
        await tx.insert(users).values({ username, displayName: username, passHash: hashPassword(password), isAdmin: 1, expiresAt: null });
        return true;
      });
      console.log(created ? 'Administrador inicial creado. Ya puedes iniciar sesión mediante HTTPS.' : 'El administrador ya existe. Se conservaron todas las cuentas.');
    } finally {
      try {
        if (locked) await connection.query("SELECT RELEASE_LOCK('traderusa_initial_admin')");
      } finally {
        connection.release();
      }
    }
  } finally {
    await db.$client.promise().end();
  }
}

main().catch(error => {
  console.error(error instanceof SetupError ? error.message : 'No se pudo crear el administrador. Comprueba la conexión y el esquema de la base de datos.');
  process.exitCode = 1;
});
