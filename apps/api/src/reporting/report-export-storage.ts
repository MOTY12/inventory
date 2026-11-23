import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export class MissingReportExportObjectError extends Error {
  constructor() {
    super("Report export object is missing");
    this.name = "MissingReportExportObjectError";
  }
}

@Injectable()
export class ReportExportStorage implements OnModuleDestroy {
  private readonly bucket = process.env.S3_BUCKET ?? "inventory-local";
  private readonly client = this.createClient();

  private createClient() {
    const production = process.env.NODE_ENV === "production";
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (
      production &&
      (!accessKeyId || !secretAccessKey || !process.env.S3_ENDPOINT)
    )
      throw new Error(
        "Production report storage requires explicit endpoint and credentials",
      );
    return new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9090",
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKeyId ?? "inventory-local-access",
        secretAccessKey:
          secretAccessKey ?? "inventory-local-secret-change-before-deploy",
      },
    });
  }

  async putFile(key: string, path: string, contentLength: number) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: contentLength,
        ContentType: "text/csv; charset=utf-8",
      }),
    );
  }

  async open(key: string) {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) throw new Error("Export object has no response body");
      return {
        body: Readable.from(result.Body as AsyncIterable<Uint8Array>),
        contentLength: result.ContentLength,
      };
    } catch (error) {
      if (isMissingObject(error)) throw new MissingReportExportObjectError();
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  onModuleDestroy() {
    this.client.destroy();
  }
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
