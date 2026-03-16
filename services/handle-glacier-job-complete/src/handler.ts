import { SNSEvent } from "aws-lambda";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { eq, and, count } from "drizzle-orm";
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

    // Find the IN_PROGRESS retrieval request for this s3Key
    const [req] = await db
      .select()
      .from(retrievalRequests)
      .where(
        and(
          eq(retrievalRequests.s3Key, s3Key),
          eq(retrievalRequests.status, "IN_PROGRESS"),
        ),
      )
      .limit(1);

    if (!req) {
      console.warn(`No IN_PROGRESS request for key: ${s3Key}`);
      continue;
    }

    // Mark this request READY
    await db
      .update(retrievalRequests)
      .set({ status: "READY", availableAt: new Date() })
      .where(eq(retrievalRequests.id, req.id));

    // Check if any IN_PROGRESS requests remain (ignore AVAILABLE — those were
    // handled by the email flow before initiateBatchRetrieval marked them IN_PROGRESS)
    const [{ remaining }] = await db
      .select({ remaining: count() })
      .from(retrievalRequests)
      .where(
        and(
          eq(retrievalRequests.batchId, req.batchId),
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
          eq(retrievalBatches.id, req.batchId),
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
              environment: [{ name: "BATCH_ID", value: req.batchId }],
            },
          ],
        },
      }),
    );

    console.log(
      `Triggered Fargate zip task for batch ${req.batchId}`,
    );
  }
};
