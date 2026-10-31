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
  ready() {
    if (this.prisma.isReady()) {
      return serviceStatusSchema.parse({
        service: "inventory-api",
        status: "ok",
      });
    }
    throw new ServiceUnavailableException({
      code: "DEPENDENCIES_UNAVAILABLE",
      message: "Required service adapters are not configured",
    });
  }
}
