import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

export class GithubOidcStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubOrg = "r-ome";
    const githubRepo = "PSILO";

    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GithubOidcProvider",
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    const role = new iam.Role(this, "GithubActionsRole", {
      roleName: "psilo-github-actions-role",
      assumedBy: new iam.WebIdentityPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${githubOrg}/${githubRepo}:ref:refs/heads/main`,
          },
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
        },
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("PowerUserAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess"),
      ],
    });

    new cdk.CfnOutput(this, "RoleArn", { value: role.roleArn });
  }
}
