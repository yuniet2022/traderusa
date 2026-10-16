import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '../api/queries/connection';
import { hashPassword } from '../api/sessionUtil';
import { users } from '../db/schema';

class SetupError extends Error {}

async function main() {
  const credentials = z.object({
    username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
    password: z.string().min(12).max(128),
  }).safeParse({ username: process.env.TRADER_ADMIN_USER, password: process.env.TRADER_ADMIN_PASSWORD });
  if (!credentials.success) throw new SetupError('Introduce un usuario válido (3–32 caracteres) y una contraseña de 12–128 caracteres.');
  const { username, password } = credentials.data;
  const db = getDb();
  try {
    await db.transaction(async tx => {
      const existingAdmin = await tx.select({ id: users.id }).from(users).where(eq(users.isAdmin, 1)).limit(1).for('update');
      if (existingAdmin.length) throw new SetupError('Ya existe un administrador. No se modificó ninguna cuenta.');
      const existingUser = await tx.query.users.findFirst({ where: eq(users.username, username) });
      if (existingUser) throw new SetupError('Ese usuario ya existe. No se modificó su contraseña ni sus permisos.');
      await tx.insert(users).values({ username, displayName: username, passHash: hashPassword(password), isAdmin: 1, expiresAt: null });
    });
    console.log('Administrador inicial creado. Ya puedes iniciar sesión mediante HTTPS.');
  } finally {
    await db.$client.promise().end();
  }
}

main().catch(error => {
  console.error(error instanceof SetupError ? error.message : 'No se pudo crear el administrador. Comprueba la conexión y el esquema de la base de datos.');
  process.exitCode = 1;
});
