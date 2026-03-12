import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigatewayv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import { DatabaseConstruct } from "./database";

interface AuthProps {
  isProd: boolean;
  bucket: s3.Bucket;
  database: DatabaseConstruct;
}

export class AuthConstruct extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly authorizer: apigatewayv2Authorizers.HttpJwtAuthorizer;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const { bucket, database } = props;

    const userProvisioningFn = new NodejsFunction(this, "UserProvisioningFn", {
      entry: path.join(__dirname, "../../../services/user-provisioning/src/handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { BUCKET_NAME: bucket.bucketName, ...database.env },
      timeout: cdk.Duration.seconds(10),
      bundling: { esbuildVersion: "0.21" },
    });
    bucket.grantWrite(userProvisioningFn);
    database.grantAccess(userProvisioningFn);

    this.userPool = new cognito.UserPool(this, "UserPool", {
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
      lambdaTriggers: { postConfirmation: userProvisioningFn },
      removalPolicy: props.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: this.userPool,
      authFlows: { userPassword: true },
      generateSecret: false,
    });

    this.authorizer = new apigatewayv2Authorizers.HttpJwtAuthorizer(
      "CognitoAuthorizer",
      `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`,
      { jwtAudience: [this.userPoolClient.userPoolClientId] },
    );
  }
}
