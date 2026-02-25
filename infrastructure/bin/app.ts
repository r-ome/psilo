import * as cdk from "aws-cdk-lib";
import { PsiloStack } from "../lib/stack";
import { GithubOidcStack } from "../config/github-oidc-stack";
import { env } from "../config/env";

const app = new cdk.App();

new GithubOidcStack(app, "psilo-github-oidc-stack", {
  env: {
    account: env.CDK_DEFAULT_ACCOUNT,
    region: env.CDK_DEFAULT_REGION,
  },
});

new PsiloStack(app, "psilo-dev-apse1-stack", {
  env: {
    account: env.CDK_DEFAULT_ACCOUNT,
    region: env.CDK_DEFAULT_REGION,
  },
});
