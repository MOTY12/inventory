import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ReorderingService } from "./reordering.service";

const EVALUATION_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ReorderingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReorderingScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly reordering: ReorderingService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.reordering
        .evaluateAll()
        .then((result) => {
          if (result.failed)
            this.logger.warn(
              `Low-stock evaluation pass completed with ${result.failed} rule failures; the next pass will retry them.`,
            );
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Low-stock evaluation pass failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        })
        .finally(() => {
          this.running = false;
        });
    }, EVALUATION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
