import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";
import type { Prisma } from "./generated/client.js";

export type ProductTransaction = Prisma.TransactionClient;

export class Database {
  readonly client: PrismaClient;
  constructor(url: string) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
  }
  transaction<T>(
    operation: (tx: ProductTransaction) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        return operation(tx);
      },
      { isolationLevel: "ReadCommitted", timeout: 10000 },
    );
  }
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
