import { SNSEvent } from "aws-lambda";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { eq, and, count, not, inArray } from "drizzle-orm";
import { createDb } from "../../shared/db";
import { retrievalBatches, retrievalRequests } from "../../shared/schema";

const ecs = new ECSClient({});

export const handler = async (event: SNSEvent): Promise<void> => {
  const db = createDb();

  for (const record of event.Records) {
    const s3Event = JSON.parse(record.Sns.Message);
    const rawKey = s3Event?.Records?.[0]?.s3?.object?.key;
    if (!rawKey) {
      console.warn("No s3 key in SNS message, skipping");
      continue;
    }
    const s3Key = decodeURIComponent(rawKey.replace(/\+/g, " "));

    // Find ALL IN_PROGRESS requests for this s3Key in non-SINGLE batches.
    // SINGLE batches are owned by the email flow (handle-restore-completed).
    const reqs = await db
      .select({ id: retrievalRequests.id, batchId: retrievalRequests.batchId })
      .from(retrievalRequests)
      .innerJoin(retrievalBatches, eq(retrievalRequests.batchId, retrievalBatches.id))
      .where(
        and(
          eq(retrievalRequests.s3Key, s3Key),
          eq(retrievalRequests.status, "IN_PROGRESS"),
          not(eq(retrievalBatches.batchType, "SINGLE")),
        ),
      );

    if (reqs.length === 0) {
      console.warn(`No IN_PROGRESS requests for key: ${s3Key}`);
      continue;
    }

    // Mark all of them READY (only non-SINGLE batch requests — already filtered above)
    const now = new Date();
    const reqIds = reqs.map((r) => r.id);
    await db
      .update(retrievalRequests)
      .set({ status: "READY", availableAt: now })
      .where(inArray(retrievalRequests.id, reqIds));

    // For each affected batch, check if all files are ready and trigger Fargate if so
    const affectedBatchIds = [...new Set(reqs.map((r) => r.batchId))];
    for (const batchId of affectedBatchIds) {
      const [{ remaining }] = await db
        .select({ remaining: count() })
        .from(retrievalRequests)
        .where(
          and(
            eq(retrievalRequests.batchId, batchId),
            eq(retrievalRequests.status, "IN_PROGRESS"),
          ),
        );

      if (remaining > 0) continue;

      // Atomic: flip batch from IN_PROGRESS → ZIPPING (only one Lambda wins the race)
      const updated = await db
        .update(retrievalBatches)
        .set({ status: "ZIPPING" })
        .where(
          and(
            eq(retrievalBatches.id, batchId),
            eq(retrievalBatches.status, "IN_PROGRESS"),
          ),
        )
        .returning({ id: retrievalBatches.id });

      if (updated.length === 0) continue; // Another invocation already triggered Fargate

      // Trigger ECS Fargate zip task
      await ecs.send(
        new RunTaskCommand({
          cluster: process.env.ECS_CLUSTER_ARN!,
          taskDefinition: process.env.ECS_TASK_DEFINITION_ARN!,
          launchType: "FARGATE",
          networkConfiguration: {
            awsvpcConfiguration: {
              subnets: process.env.ECS_SUBNET_IDS!.split(","),
              securityGroups: process.env.ECS_SECURITY_GROUP_IDS!.split(","),
              assignPublicIp: "ENABLED",
            },
          },
          overrides: {
            containerOverrides: [
              {
                name: process.env.ECS_CONTAINER_NAME!,
                environment: [{ name: "BATCH_ID", value: batchId }],
              },
            ],
          },
        }),
      );

      console.log(`Triggered Fargate zip task for batch ${batchId}`);
    }
  }
};
