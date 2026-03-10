import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigatewayv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as path from "path";
import { env } from "../config/env";

export class PsiloStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const isProd = env.IS_PRODUCTION;

    const userBucket = new s3.Bucket(this, "UserBucket", {
      bucketName: `psilo-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    // VPC for Aurora (Lambdas use Data API over HTTPS, no VPC needed for them)
    const vpc = new ec2.Vpc(this, "PsiloVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    // Aurora Serverless v2
    const dbSecret = new secretsmanager.Secret(this, "DbSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "postgres" }),
        generateStringKey: "password",
        excludeCharacters: '/@"',
      },
    });

    const dbCluster = new rds.DatabaseCluster(this, "PsiloDb", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      writer: rds.ClusterInstance.serverlessV2("writer", {
        scaleWithWriter: true,
      }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      enableDataApi: true,
      credentials: rds.Credentials.fromSecret(dbSecret),
      defaultDatabaseName: "psilo",
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    const dbEnv = {
      DB_CLUSTER_ARN: dbCluster.clusterArn,
      DB_SECRET_ARN: dbSecret.secretArn,
      DB_NAME: "psilo",
    };

    const uploadDlq = new sqs.Queue(this, "UploadDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });

    const uploadQueue = new sqs.Queue(this, "UploadQueue", {
      visibilityTimeout: cdk.Duration.seconds(310),
      deadLetterQueue: { queue: uploadDlq, maxReceiveCount: 3 },
    });

    const userProvisioningFn = new NodejsFunction(this, "UserProvisioningFn", {
      entry: path.join(
        __dirname,
        "../../services/user-provisioning/src/handler.ts",
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        BUCKET_NAME: userBucket.bucketName,
        ...dbEnv,
      },
      timeout: cdk.Duration.seconds(10),
      bundling: {
        esbuildVersion: "0.21",
      },
    });

    userBucket.grantWrite(userProvisioningFn);
    dbCluster.grantDataApiAccess(userProvisioningFn);
    dbSecret.grantRead(userProvisioningFn);

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "psilo-user-pool",
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      lambdaTriggers: {
        postConfirmation: userProvisioningFn,
      },
      removalPolicy: isProd
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      authFlows: {
        userPassword: true,
      },
      generateSecret: false,
    });

    const generatePresignedUrlFn = new NodejsFunction(
      this,
      "GeneratePresignedUrlFn",
      {
        entry: path.join(
          __dirname,
          "../../services/generate-presigned-url/src/handler.ts",
        ),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: {
          BUCKET_NAME: userBucket.bucketName,
        },
        timeout: cdk.Duration.seconds(10),
        bundling: {
          esbuildVersion: "0.21",
        },
      },
    );

    userBucket.grantPut(generatePresignedUrlFn);

    const processPhotoMetadataFn = new NodejsFunction(
      this,
      "ProcessPhotoMetadataFn",
      {
        entry: path.join(
          __dirname,
          "../../services/process-photo-metadata/src/handler.ts",
        ),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: {
          BUCKET_NAME: userBucket.bucketName,
          ...dbEnv,
        },
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
      },
    );

    userBucket.grantRead(processPhotoMetadataFn);
    userBucket.grantPut(processPhotoMetadataFn, "users/*/thumbnails/*");
    userBucket.grantWrite(processPhotoMetadataFn, "users/*/thumbnails/*");
    dbCluster.grantDataApiAccess(processPhotoMetadataFn);
    dbSecret.grantRead(processPhotoMetadataFn);
    uploadQueue.grantConsumeMessages(processPhotoMetadataFn);
    processPhotoMetadataFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObjectTagging"],
        resources: [`${userBucket.bucketArn}/users/*`],
      }),
    );
    processPhotoMetadataFn.addEventSource(
      new SqsEventSource(uploadQueue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    );

    userBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(uploadQueue),
      { prefix: "users/" },
    );

    // S3 lifecycle rule: archive originals to Glacier based on tag
    userBucket.addLifecycleRule({
      id: "archive-originals",
      enabled: true,
      tagFilters: { "media-type": "original" },
      transitions: [
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: cdk.Duration.days(0),
        },
      ],
    });

    const handleUploadDlqFn = new NodejsFunction(this, "HandleUploadDlqFn", {
      entry: path.join(
        __dirname,
        "../../services/handle-upload-dlq/src/handler.ts",
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { ...dbEnv },
      timeout: cdk.Duration.seconds(10),
      bundling: { esbuildVersion: "0.21" },
    });

    dbCluster.grantDataApiAccess(handleUploadDlqFn);
    dbSecret.grantRead(handleUploadDlqFn);
    uploadDlq.grantConsumeMessages(handleUploadDlqFn);
    handleUploadDlqFn.addEventSource(
      new SqsEventSource(uploadDlq, {
        batchSize: 1,
        reportBatchItemFailures: true,
      }),
    );

    const lifecycleTransitionFn = new NodejsFunction(this, "LifecycleTransitionFn", {
      entry: path.join(
        __dirname,
        "../../services/lifecycle-transition/src/handler.ts",
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { ...dbEnv },
      timeout: cdk.Duration.seconds(30),
      bundling: { esbuildVersion: "0.21" },
    });

    dbCluster.grantDataApiAccess(lifecycleTransitionFn);
    dbSecret.grantRead(lifecycleTransitionFn);

    const s3TransitionRule = new events.Rule(this, "S3StorageClassChangedRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Storage Class Changed"],
        detail: {
          bucket: { name: [userBucket.bucketName] },
        },
      },
    });
    s3TransitionRule.addTarget(new targets.LambdaFunction(lifecycleTransitionFn));

    const managePhotosFn = new NodejsFunction(this, "ManagePhotosFn", {
      entry: path.join(
        __dirname,
        "../../services/manage-photos/src/handler.ts",
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        BUCKET_NAME: userBucket.bucketName,
        ...dbEnv,
      },
      timeout: cdk.Duration.seconds(29),
      bundling: {
        esbuildVersion: "0.21",
      },
    });

    userBucket.grantRead(managePhotosFn);
    userBucket.grantDelete(managePhotosFn);
    dbCluster.grantDataApiAccess(managePhotosFn);
    dbSecret.grantRead(managePhotosFn);

    const manageAlbumsFn = new NodejsFunction(this, "ManageAlbumsFn", {
      entry: path.join(
        __dirname,
        "../../services/manage-albums/src/handler.ts",
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        BUCKET_NAME: userBucket.bucketName,
        ...dbEnv,
      },
      timeout: cdk.Duration.seconds(29),
      bundling: {
        esbuildVersion: "0.21",
      },
    });

    userBucket.grantRead(manageAlbumsFn);
    dbCluster.grantDataApiAccess(manageAlbumsFn);
    dbSecret.grantRead(manageAlbumsFn);

    const httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.PATCH,
        ],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    const cognitoAuthorizer = new apigatewayv2Authorizers.HttpJwtAuthorizer(
      "CognitoAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
      },
    );

    httpApi.addRoutes({
      path: "/files/presign",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new apigatewayv2Integrations.HttpLambdaIntegration(
        "GeneratePresignedUrlIntegration",
        generatePresignedUrlFn,
      ),
      authorizer: cognitoAuthorizer,
    });

    const managePhotosIntegration =
      new apigatewayv2Integrations.HttpLambdaIntegration(
        "ManagePhotosIntegration",
        managePhotosFn,
      );

    httpApi.addRoutes({
      path: "/photos",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: managePhotosIntegration,
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: "/photos/storage-size",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: managePhotosIntegration,
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: "/photos/{key+}",
      methods: [apigatewayv2.HttpMethod.DELETE, apigatewayv2.HttpMethod.PATCH],
      integration: managePhotosIntegration,
      authorizer: cognitoAuthorizer,
    });

    const manageAlbumsIntegration =
      new apigatewayv2Integrations.HttpLambdaIntegration(
        "ManageAlbumsIntegration",
        manageAlbumsFn,
      );

    httpApi.addRoutes({
      path: "/albums",
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: manageAlbumsIntegration,
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: "/albums/{albumId}",
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.DELETE],
      integration: manageAlbumsIntegration,
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: "/albums/{albumId}/photos",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: manageAlbumsIntegration,
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: "/albums/{albumId}/photos/{photoId}",
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: manageAlbumsIntegration,
      authorizer: cognitoAuthorizer,
    });

    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.url! });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "BucketName", { value: userBucket.bucketName });
    new cdk.CfnOutput(this, "DbClusterArn", { value: dbCluster.clusterArn });
    new cdk.CfnOutput(this, "DbSecretArn", { value: dbSecret.secretArn });
  }
}
