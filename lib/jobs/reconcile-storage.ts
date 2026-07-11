import { ListObjectsV2Command, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { rawPrisma as prisma } from "@/lib/db/raw-client";
import { env } from "@/lib/env";
import { s3Configured } from "@/lib/storage/s3";

function getS3(): S3Client | null {
  if (!s3Configured() || !env.S3_BUCKET) return null;
  return new S3Client({
    region: env.S3_REGION ?? "us-east-1",
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_ENDPOINT ? env.S3_FORCE_PATH_STYLE !== false : false,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function reconcileStorage(): Promise<number> {
  const s3 = getS3();
  if (!s3 || !env.S3_BUCKET) return 0;

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let updated = 0;

  for (const tenant of tenants) {
    const prefix = `tenants/${tenant.id}/`;
    let total = BigInt(0);
    let token: string | undefined;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({
          Bucket: env.S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const obj of list.Contents ?? []) {
        if (obj.Size != null) total += BigInt(obj.Size);
      }
      token = list.NextContinuationToken;
    } while (token);

    const current = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { storageUsedBytes: true },
    });
    if (current && current.storageUsedBytes !== total) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { storageUsedBytes: total },
      });
      updated++;
    }
  }
  return updated;
}
