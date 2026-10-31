import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { serviceStatusSchema } from "@inventory/shared";

@ApiTags("health")
@Controller("health")
export class HealthController {
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
  ready(): never {
    throw new ServiceUnavailableException({
      code: "DEPENDENCIES_UNAVAILABLE",
      message: "Required service adapters are not configured",
    });
  }
}
