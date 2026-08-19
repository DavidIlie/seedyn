import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";

import { db } from "~/server/db";

type SeedynAdapterUser = AdapterUser & {
  storageLimitBytes?: bigint | null;
  storageReservedBytes?: bigint;
  storageUsedBytes?: bigint;
};

function authUser(user: SeedynAdapterUser): AdapterUser {
  const {
    storageLimitBytes: _storageLimitBytes,
    storageReservedBytes: _storageReservedBytes,
    storageUsedBytes: _storageUsedBytes,
    ...serializableUser
  } = user;

  return serializableUser;
}

/**
 * Auth.js adapters operate on the application's User model, but Auth.js also
 * serializes returned users while completing an OAuth callback. Keep Seedyn's
 * bigint quota accounting server-side and outside that serialization boundary.
 */
export function seedynAuthAdapter(): Adapter {
  const adapter = PrismaAdapter(db);

  return {
    ...adapter,
    async createUser(user) {
      return authUser(await adapter.createUser!(user));
    },
    async getUser(id) {
      const user = await adapter.getUser!(id);
      return user ? authUser(user) : null;
    },
    async getUserByEmail(email) {
      const user = await adapter.getUserByEmail!(email);
      return user ? authUser(user) : null;
    },
    async getUserByAccount(account) {
      const user = await adapter.getUserByAccount!(account);
      return user ? authUser(user) : null;
    },
    async updateUser(user) {
      return authUser(await adapter.updateUser!(user));
    },
    async deleteUser(id) {
      const user = await adapter.deleteUser!(id);
      return user ? authUser(user) : null;
    },
    async getSessionAndUser(sessionToken) {
      const result = await adapter.getSessionAndUser!(sessionToken);
      return result ? { ...result, user: authUser(result.user) } : null;
    },
  };
}
