import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { env } from "../config/env";
import { StorageConstruct } from "./constructs/storage";
import { DatabaseConstruct } from "./constructs/database";
import { AuthConstruct } from "./constructs/auth";
import { UploadPipelineConstruct } from "./constructs/upload-pipeline";
import { VideoPipelineConstruct } from "./constructs/video-pipeline";
import { ApiConstruct } from "./constructs/api";
import { CdnConstruct } from "./constructs/cdn";
import { ZipPipelineConstruct } from "./constructs/zip-pipeline";

export class PsiloStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("project", "psilo");

    const isProd = env.IS_PRODUCTION;

    const storage = new StorageConstruct(this, "Storage", { isProd });
    const database = new DatabaseConstruct(this, "Database", { isProd });
    const auth = new AuthConstruct(this, "Auth", { isProd, bucket: storage.bucket, database });

    const videoPipeline = new VideoPipelineConstruct(this, "VideoPipeline", {
      bucket: storage.bucket,
      database,
    });

    const uploadPipeline = new UploadPipelineConstruct(this, "UploadPipeline", {
      bucket: storage.bucket,
      database,
      videoPipeline,
    });

    const cdn = new CdnConstruct(this, "Cdn", {
      bucket: storage.bucket,
      publicKeyPem: env.CLOUDFRONT_PUBLIC_KEY_PEM,
      privateKeySecretArn: env.CLOUDFRONT_PRIVATE_KEY_SECRET_ARN,
    });

    const zipPipeline = new ZipPipelineConstruct(this, "ZipPipeline", {
      bucket: storage.bucket,
      database,
    });

    const api = new ApiConstruct(this, "Api", {
      bucket: storage.bucket,
      database,
      auth,
      cdn,
      uploadPipeline,
      zipPipeline,
    });

    // Stack outputs
    new cdk.CfnOutput(this, "CloudFrontDomain", { value: cdn.cloudfrontDomain });
    new cdk.CfnOutput(this, "HttpApiUrl",       { value: api.httpApi.url! });
    new cdk.CfnOutput(this, "UserPoolId",       { value: auth.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: auth.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "BucketName",       { value: storage.bucket.bucketName });
    new cdk.CfnOutput(this, "DbClusterArn",     { value: database.cluster.clusterArn });
    new cdk.CfnOutput(this, "DbSecretArn",      { value: database.secret.secretArn });
  }
}
