import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import * as path from "path";
import { DatabaseConstruct } from "./database";

interface UploadPipelineProps {
  bucket: s3.Bucket;
  database: DatabaseConstruct;
}

export class UploadPipelineConstruct extends Construct {
  constructor(scope: Construct, id: string, props: UploadPipelineProps) {
    super(scope, id);

    const { bucket, database } = props;

    const uploadDlq = new sqs.Queue(this, "UploadDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });

    const uploadQueue = new sqs.Queue(this, "UploadQueue", {
      visibilityTimeout: cdk.Duration.seconds(310),
      deadLetterQueue: { queue: uploadDlq, maxReceiveCount: 3 },
    });

    // S3 → SQS notification
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(uploadQueue),
      { prefix: "users/" },
    );

    const processPhotoMetadataFn = new NodejsFunction(this, "ProcessPhotoMetadataFn", {
      entry: path.join(__dirname, "../../../services/process-photo-metadata/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { BUCKET_NAME: bucket.bucketName, ...database.env },
      timeout: cdk.Duration.seconds(300),
      memorySize: 3008,
      bundling: {
        esbuildVersion: "0.21",
        nodeModules: ["sharp"],
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDir: string, outputDir: string) => [
            `cd ${outputDir} && rm -rf node_modules/sharp node_modules/@img && npm install --os=linux --cpu=x64 sharp`,
          ],
        },
      },
    });
    bucket.grantRead(processPhotoMetadataFn);
    bucket.grantPut(processPhotoMetadataFn, "users/*/thumbnails/*");
    bucket.grantWrite(processPhotoMetadataFn, "users/*/thumbnails/*");
    database.grantAccess(processPhotoMetadataFn);
    uploadQueue.grantConsumeMessages(processPhotoMetadataFn);
    processPhotoMetadataFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObjectTagging"],
        resources: [`${bucket.bucketArn}/users/*`],
      }),
    );
    processPhotoMetadataFn.addEventSource(
      new SqsEventSource(uploadQueue, { batchSize: 1, reportBatchItemFailures: true }),
    );

    const handleUploadDlqFn = new NodejsFunction(this, "HandleUploadDlqFn", {
      entry: path.join(__dirname, "../../../services/handle-upload-dlq/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { ...database.env },
      timeout: cdk.Duration.seconds(10),
      bundling: { esbuildVersion: "0.21" },
    });
    database.grantAccess(handleUploadDlqFn);
    uploadDlq.grantConsumeMessages(handleUploadDlqFn);
    handleUploadDlqFn.addEventSource(
      new SqsEventSource(uploadDlq, { batchSize: 1, reportBatchItemFailures: true }),
    );
  }
}
