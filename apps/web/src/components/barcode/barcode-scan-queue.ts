export class BarcodeScanQueue {
  private readonly pending: string[] = [];
  private running: Promise<void> | null = null;
  private processScan: (barcode: string) => Promise<void> = async () => {};

  enqueue(
    barcode: string,
    processScan: (barcode: string) => Promise<void>,
  ): Promise<void> {
    this.pending.push(barcode);
    this.processScan = processScan;
    if (!this.running) this.running = this.drain();
    return this.running;
  }

  private async drain() {
    try {
      while (this.pending.length > 0) {
        const barcode = this.pending.shift();
        if (barcode !== undefined) await this.processScan(barcode);
      }
    } finally {
      this.running = null;
    }
  }
}

export function submitBarcodeForm(
  event: { preventDefault(): void },
  value: string,
  queue: BarcodeScanQueue,
  processScan: (barcode: string) => Promise<void>,
) {
  event.preventDefault();
  const barcode = value.trim();
  return barcode ? queue.enqueue(barcode, processScan) : undefined;
}
