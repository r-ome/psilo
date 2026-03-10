import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

jest.mock("../config/env", () => ({
  env: {
    CDK_DEFAULT_ACCOUNT: "123456789",
    CDK_DEFAULT_REGION: "ap-southeast-1",
    IS_PRODUCTION: false,
  },
}));

import { PsiloStack } from "../lib/stack";

const app = new cdk.App();
const stack = new PsiloStack(app, "TestStack", {
  env: { account: "123456789", region: "ap-southeast-1" },
});
const template = Template.fromStack(stack);

describe("PsiloStack", () => {
  describe("Lambda functions", () => {
    it("application Lambdas use Node.js 22", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs22.x",
      });
    });

    it("application Lambdas have BUCKET_NAME environment variable", () => {
      template.resourcePropertiesCountIs(
        "AWS::Lambda::Function",
        {
          Environment: Match.objectLike({
            Variables: Match.objectLike({
              BUCKET_NAME: Match.anyValue(),
            }),
          }),
        },
        5, // UserProvisioning, GeneratePresignedUrl, ProcessPhotoMetadata, ManagePhotos, ManageAlbums
      );
    });

    it("ProcessPhotoMetadata Lambda exists", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            DB_CLUSTER_ARN: Match.anyValue(),
            DB_SECRET_ARN: Match.anyValue(),
            DB_NAME: "psilo",
          }),
        }),
      });
    });
  });

  describe("S3 bucket", () => {
    it("has versioning enabled", () => {
      template.hasResourceProperties("AWS::S3::Bucket", {
        VersioningConfiguration: { Status: "Enabled" },
      });
    });

    it("has S3 event notification for object created", () => {
      template.hasResourceProperties("Custom::S3BucketNotifications", {
        NotificationConfiguration: Match.objectLike({
          LambdaFunctionConfigurations: Match.arrayWith([
            Match.objectLike({
              Events: ["s3:ObjectCreated:*"],
              Filter: Match.objectLike({
                Key: Match.objectLike({
                  FilterRules: Match.arrayWith([
                    Match.objectLike({ Name: "prefix", Value: "users/" }),
                  ]),
                }),
              }),
            }),
          ]),
        }),
      });
    });
  });

  describe("Cognito User Pool", () => {
    it("has email sign-in enabled", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UsernameAttributes: ["email"],
      });
    });

    it("has UserProvisioning Lambda as post-confirmation trigger", () => {
      template.hasResourceProperties("AWS::Cognito::UserPool", {
        LambdaConfig: {
          PostConfirmation: {
            "Fn::GetAtt": Match.arrayWith([
              Match.stringLikeRegexp("UserProvisioningFn"),
            ]),
          },
        },
      });
    });
  });

  describe("RDS Aurora Serverless", () => {
    it("creates an RDS database cluster", () => {
      template.resourceCountIs("AWS::RDS::DBCluster", 1);
    });

    it("database cluster has Data API enabled", () => {
      template.hasResourceProperties("AWS::RDS::DBCluster", {
        EnableHttpEndpoint: true,
      });
    });

    it("creates a Secrets Manager secret for DB credentials", () => {
      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        GenerateSecretString: Match.objectLike({
          SecretStringTemplate: JSON.stringify({ username: "postgres" }),
          GenerateStringKey: "password",
        }),
      });
    });
  });

  describe("API Gateway", () => {
    it("has POST /files/presign route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "POST /files/presign",
      });
    });

    it("uses JWT authorization on the route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "POST /files/presign",
        AuthorizationType: "JWT",
      });
    });

    it("has a JWT authorizer", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
        AuthorizerType: "JWT",
      });
    });

    it("has GET /photos route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "GET /photos",
        AuthorizationType: "JWT",
      });
    });

    it("has DELETE /photos/{key+} route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "DELETE /photos/{key+}",
        AuthorizationType: "JWT",
      });
    });

    it("has POST /albums route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "POST /albums",
        AuthorizationType: "JWT",
      });
    });

    it("has GET /albums route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "GET /albums",
        AuthorizationType: "JWT",
      });
    });

    it("has GET /albums/{albumId} route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "GET /albums/{albumId}",
        AuthorizationType: "JWT",
      });
    });

    it("has POST /albums/{albumId}/photos route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "POST /albums/{albumId}/photos",
        AuthorizationType: "JWT",
      });
    });

    it("has DELETE /albums/{albumId}/photos/{photoId} route", () => {
      template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
        RouteKey: "DELETE /albums/{albumId}/photos/{photoId}",
        AuthorizationType: "JWT",
      });
    });
  });
});
