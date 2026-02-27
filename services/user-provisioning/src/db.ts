import { createDb } from '../../shared/db';
import { users } from '../../shared/schema';

export async function insertUser(
  userId: string,
  email: string,
  givenName: string,
  familyName: string,
): Promise<void> {
  const db = createDb();
  await db.insert(users).values({ id: userId, email, givenName, familyName }).onConflictDoNothing();
}
