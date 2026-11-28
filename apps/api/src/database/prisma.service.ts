import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  private connected = false;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL must be configured before the API starts");
    }

    super({
      adapter: new PrismaPg(
        { connectionString },
        process.env.DATABASE_SCHEMA
          ? { schema: process.env.DATABASE_SCHEMA }
          : undefined,
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.DATABASE_CONNECT_ON_STARTUP === "false") return;
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
    } catch {
      throw new ServiceUnavailableException({
        code: "DATABASE_UNAVAILABLE",
        message: "The database is unavailable",
      });
    }
  }

  isReady(): boolean {
    return this.connected;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    this.connected = false;
  }
}
