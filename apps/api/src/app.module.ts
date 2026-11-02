import { Controller, Get, Module } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { serviceStatusSchema } from "@inventory/shared";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./database/prisma.module";
import { AuthModule } from "./identity/auth.module";
import { OrganizationModule } from "./organizations/organization.module";
import { LocationsModule } from "./locations/locations.module";
import { CatalogModule } from "./catalog/catalog.module";

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

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    OrganizationModule,
    LocationsModule,
    CatalogModule,
  ],
  controllers: [AppController, HealthController],
})
export class AppModule {}
