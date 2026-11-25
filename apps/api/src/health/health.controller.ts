import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { serviceStatusSchema } from "@inventory/shared";
import { PrismaService } from "../database/prisma.service";
import { databaseIdentityFingerprint } from "./database-identity";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirm that the API process is alive" })
  live() {
    return serviceStatusSchema.parse({
      service: "inventory-api",
      status: "ok",
    });
  }

  @Get("ready")
  @ApiOperation({ summary: "Confirm that API dependencies are configured" })
  @ApiResponse({
    status: 503,
    description: "Required service adapters are not configured.",
  })
  async ready() {
    if (this.prisma.isReady()) {
      const status = {
        service: "inventory-api",
        status: "ok" as const,
      };
      if (process.env.NODE_ENV !== "production") {
        const [identity] = await this.prisma.$queryRaw<
          {
            database: string;
            schema: string;
            serverAddress: string;
            serverPort: number;
          }[]
        >`SELECT current_database() AS database,
                 current_schema() AS schema,
                 inet_server_addr()::text AS "serverAddress",
                 inet_server_port() AS "serverPort"`;
        return serviceStatusSchema.parse({
          ...status,
          databaseIdentity: databaseIdentityFingerprint(identity),
        });
      }
      return serviceStatusSchema.parse(status);
    }
    throw new ServiceUnavailableException({
      code: "DEPENDENCIES_UNAVAILABLE",
      message: "Required service adapters are not configured",
    });
  }
}
