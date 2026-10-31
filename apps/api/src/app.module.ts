import { Controller, Get, Module } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { serviceStatusSchema } from "@inventory/shared";
import { HealthController } from "./health/health.controller";

@ApiTags("system")
@Controller()
class AppController {
  @Get("status")
  @ApiOperation({ summary: "Check that the API process is responding" })
  getStatus() {
    return serviceStatusSchema.parse({
      service: "inventory-api",
      status: "ok",
    });
  }
}

@Module({ controllers: [AppController, HealthController] })
export class AppModule {}
