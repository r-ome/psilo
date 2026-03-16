import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { NodejsFunction, NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import { DatabaseConstruct } from "./database";
import { AuthConstruct } from "./auth";
import { CdnConstruct } from "./cdn";
import { ZipPipelineConstruct } from "./zip-pipeline";

const { GET, POST, DELETE, PUT, PATCH } = apigatewayv2.HttpMethod;
const { GET: CORS_GET, POST: CORS_POST, DELETE: CORS_DELETE, PATCH: CORS_PATCH } = apigatewayv2.CorsHttpMethod;

interface ApiProps {
  bucket: s3.Bucket;
  database: DatabaseConstruct;
  auth: AuthConstruct;
  cdn: CdnConstruct;
  zipPipeline: ZipPipelineConstruct;
}

export class ApiConstruct extends Construct {
  readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const { bucket, database, auth, cdn, zipPipeline } = props;

    // -------------------------------------------------------------------------
    // Background Lambdas (event-driven, no API routes)
    // -------------------------------------------------------------------------

    const lifecycleTransitionFn = this.createFn("LifecycleTransitionFn", {
      service: "lifecycle-transition",
      environment: { ...database.env },
      timeout: cdk.Duration.seconds(30),
    });
    database.grantAccess(lifecycleTransitionFn);

    new events.Rule(this, "S3StorageClassChangedRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Storage Class Changed"],
        detail: { bucket: { name: [bucket.bucketName] } },
      },
    }).addTarget(new targets.LambdaFunction(lifecycleTransitionFn));

    const purgeDeletedPhotosFn = this.createFn("PurgeDeletedPhotosFn", {
      service: "purge-deleted-photos",
      environment: { BUCKET_NAME: bucket.bucketName, ...database.env },
      timeout: cdk.Duration.minutes(5),
    });
    bucket.grantDelete(purgeDeletedPhotosFn);
    database.grantAccess(purgeDeletedPhotosFn);

    new events.Rule(this, "DailyPurgeCronRule", {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      description: "Daily purge of soft-deleted photos past 90-day retention",
    }).addTarget(new targets.LambdaFunction(purgeDeletedPhotosFn));

    const handleRestoreCompletedFn = this.createFn("HandleRestoreCompletedFn", {
      service: "handle-restore-completed",
      environment: {
        BUCKET_NAME: bucket.bucketName,
        SES_FROM_EMAIL: "jerome.arceo.agapay@gmail.com",
        USER_POOL_ID: auth.userPool.userPoolId,
        RESTORE_RETENTION_DAYS: "7",
        ...database.env,
      },
      timeout: cdk.Duration.seconds(30),
    });
    bucket.grantRead(handleRestoreCompletedFn);
    database.grantAccess(handleRestoreCompletedFn);
    handleRestoreCompletedFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ["ses:SendEmail"], resources: ["*"] }),
    );
    handleRestoreCompletedFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminGetUser"],
        resources: [auth.userPool.userPoolArn],
      }),
    );

    new events.Rule(this, "S3RestoreCompletedRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Restore Completed"],
        detail: { bucket: { name: [bucket.bucketName] } },
      },
    }).addTarget(new targets.LambdaFunction(handleRestoreCompletedFn));

    // SNS-based glacier restore completion → zip flow
    const glacierRestoreTopic = new sns.Topic(this, "GlacierRestoreCompletedTopic");

    bucket.addEventNotification(
      s3.EventType.OBJECT_RESTORE_COMPLETED,
      new s3n.SnsDestination(glacierRestoreTopic),
    );

    const handleGlacierJobCompleteFn = this.createFn("HandleGlacierJobCompleteFn", {
      service: "handle-glacier-job-complete",
      environment: {
        ECS_CLUSTER_ARN: zipPipeline.cluster.clusterArn,
        ECS_TASK_DEFINITION_ARN: zipPipeline.taskDefinition.taskDefinitionArn,
        ECS_CONTAINER_NAME: zipPipeline.containerName,
        ECS_SUBNET_IDS: zipPipeline.vpc.publicSubnets.map((s) => s.subnetId).join(","),
        ECS_SECURITY_GROUP_IDS: zipPipeline.securityGroup.securityGroupId,
        ...database.env,
      },
      timeout: cdk.Duration.seconds(30),
    });
    zipPipeline.taskDefinition.grantRun(handleGlacierJobCompleteFn);
    database.grantAccess(handleGlacierJobCompleteFn);

    glacierRestoreTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(handleGlacierJobCompleteFn),
    );

    // -------------------------------------------------------------------------
    // API Lambdas
    // -------------------------------------------------------------------------

    const cfEnv = {
      CLOUDFRONT_DOMAIN: cdn.cloudfrontDomain,
      CLOUDFRONT_KEY_PAIR_ID: cdn.keyPairId,
      CLOUDFRONT_PRIVATE_KEY_SECRET_ARN: cdn.privateKeySecret.secretArn,
      USE_CLOUDFRONT: "true",
    };

    const generatePresignedUrlFn = new NodejsFunction(this, "GeneratePresignedUrlFn", {
      entry: path.join(__dirname, "../../../services/generate-presigned-url/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        ...database.env,
        ...cfEnv,
      },
      timeout: cdk.Duration.seconds(29),
      memorySize: 512,
      bundling: {
        esbuildVersion: "0.21",
        nodeModules: ["sharp"],
        commandHooks: {
          beforeInstall: () => [],
          beforeBundling: () => [],
          afterBundling: (_inputDir: string, outputDir: string) => [
            `cd ${outputDir} && rm -rf node_modules/sharp node_modules/@img && npm install --os=linux --cpu=x64 sharp`,
          ],
        },
      },
    });
    bucket.grantPut(generatePresignedUrlFn);
    bucket.grantRead(generatePresignedUrlFn);
    database.grantAccess(generatePresignedUrlFn);
    cdn.privateKeySecret.grantRead(generatePresignedUrlFn);

    const managePhotosFn = this.createFn("ManagePhotosFn", {
      service: "manage-photos",
      environment: { BUCKET_NAME: bucket.bucketName, ...database.env, ...cfEnv },
      timeout: cdk.Duration.seconds(29),
    });
    bucket.grantRead(managePhotosFn);
    bucket.grantDelete(managePhotosFn);
    database.grantAccess(managePhotosFn);
    cdn.privateKeySecret.grantRead(managePhotosFn);

    const manageAlbumsFn = this.createFn("ManageAlbumsFn", {
      service: "manage-albums",
      environment: { BUCKET_NAME: bucket.bucketName, ...database.env, ...cfEnv },
      timeout: cdk.Duration.seconds(29),
    });
    bucket.grantRead(manageAlbumsFn);
    database.grantAccess(manageAlbumsFn);
    cdn.privateKeySecret.grantRead(manageAlbumsFn);

    const requestRestoreFn = this.createFn("RequestRestoreFn", {
      service: "request-restore",
      environment: { BUCKET_NAME: bucket.bucketName, RESTORE_RETENTION_DAYS: "7", ...database.env },
      timeout: cdk.Duration.seconds(29),
    });
    bucket.grantRead(requestRestoreFn);
    database.grantAccess(requestRestoreFn);
    requestRestoreFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:RestoreObject"],
        resources: [`${bucket.bucketArn}/users/*`],
      }),
    );

    const manageRetrievalFn = this.createFn("ManageRetrievalFn", {
      service: "manage-retrieval",
      environment: { ...database.env },
      timeout: cdk.Duration.seconds(29),
    });
    database.grantAccess(manageRetrievalFn);

    // -------------------------------------------------------------------------
    // API Gateway
    // -------------------------------------------------------------------------

    this.httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [CORS_GET, CORS_POST, CORS_DELETE, CORS_PATCH],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    const { authorizer } = auth;
    const integration = (id: string, fn: NodejsFunction) =>
      new apigatewayv2Integrations.HttpLambdaIntegration(id, fn);

    const presignIntegration     = integration("GeneratePresignedUrlIntegration", generatePresignedUrlFn);
    const managePhotosIntegration = integration("ManagePhotosIntegration",        managePhotosFn);
    const manageAlbumsIntegration = integration("ManageAlbumsIntegration",        manageAlbumsFn);
    const requestRestoreIntegration = integration("RequestRestoreIntegration",    requestRestoreFn);
    const manageRetrievalIntegration = integration("ManageRetrievalIntegration",  manageRetrievalFn);

    const routes: Array<{
      path: string;
      methods: apigatewayv2.HttpMethod[];
      integration: apigatewayv2Integrations.HttpLambdaIntegration;
    }> = [
      // Files
      { path: "/files/presign",  methods: [POST],                  integration: presignIntegration },
      { path: "/files/restore",  methods: [POST],                  integration: requestRestoreIntegration },

      // Photos
      { path: "/photos",               methods: [GET, DELETE, PATCH], integration: managePhotosIntegration },
      { path: "/photos/storage-size",  methods: [GET],               integration: managePhotosIntegration },
      { path: "/photos/trash",         methods: [GET],               integration: managePhotosIntegration },
      { path: "/photos/trash/restore", methods: [POST],              integration: managePhotosIntegration },
      { path: "/photos/{key+}",        methods: [DELETE, PATCH],     integration: managePhotosIntegration },

      // Albums
      { path: "/albums",                          methods: [GET, POST],         integration: manageAlbumsIntegration },
      { path: "/albums/{albumId}",                methods: [GET, DELETE, PUT],  integration: manageAlbumsIntegration },
      { path: "/albums/{albumId}/photos",         methods: [POST],              integration: manageAlbumsIntegration },
      { path: "/albums/{albumId}/photos/{photoId}", methods: [DELETE],          integration: manageAlbumsIntegration },

      // Retrieval
      { path: "/retrieval/batches",          methods: [GET], integration: manageRetrievalIntegration },
      { path: "/retrieval/batches/{batchId}", methods: [GET], integration: manageRetrievalIntegration },
    ];

    for (const route of routes) {
      this.httpApi.addRoutes({ ...route, authorizer });
    }
  }

  private createFn(
    id: string,
    props: {
      service: string;
      environment: Record<string, string>;
      timeout: cdk.Duration;
      memorySize?: number;
    },
  ): NodejsFunction {
    return new NodejsFunction(this, id, {
      entry: path.join(__dirname, `../../../services/${props.service}/src/handler.ts`),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: props.environment,
      timeout: props.timeout,
      memorySize: props.memorySize,
      bundling: { esbuildVersion: "0.21" },
    } as NodejsFunctionProps);
  }
}
