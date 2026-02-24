import { CognitoUserPool } from "amazon-cognito-identity-js";
import { clientEnv } from "@/app/lib/env.client";

export const userPool = new CognitoUserPool({
  UserPoolId: clientEnv.COGNITO_USER_POOL_ID,
  ClientId: clientEnv.COGNITO_APP_CLIENT_ID,
});
