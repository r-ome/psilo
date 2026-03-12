import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { env } from "../config/env";
import { StorageConstruct } from "./constructs/storage";
import { DatabaseConstruct } from "./constructs/database";
import { AuthConstruct } from "./constructs/auth";
import { UploadPipelineConstruct } from "./constructs/upload-pipeline";
import { ApiConstruct } from "./constructs/api";

export class PsiloStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const isProd = env.IS_PRODUCTION;

    const storage = new StorageConstruct(this, "Storage", { isProd });
    const database = new DatabaseConstruct(this, "Database", { isProd });
    const auth = new AuthConstruct(this, "Auth", { isProd, bucket: storage.bucket, database });

    new UploadPipelineConstruct(this, "UploadPipeline", {
      bucket: storage.bucket,
      database,
    });

    const api = new ApiConstruct(this, "Api", {
      bucket: storage.bucket,
      database,
      auth,
    });

    // Stack outputs
    new cdk.CfnOutput(this, "HttpApiUrl",       { value: api.httpApi.url! });
    new cdk.CfnOutput(this, "UserPoolId",       { value: auth.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: auth.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "BucketName",       { value: storage.bucket.bucketName });
    new cdk.CfnOutput(this, "DbClusterArn",     { value: database.cluster.clusterArn });
    new cdk.CfnOutput(this, "DbSecretArn",      { value: database.secret.secretArn });
  }
}
