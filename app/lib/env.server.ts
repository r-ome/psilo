import "server-only";

function getServerEnv() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_APP_CLIENT_ID;
  const AWSRegion = process.env.AWS_REGION;
  const nodeEnv = process.env.NODE_ENV;

  if (!userPoolId) {
    throw new Error("Missing COGNITO_USER_POOL_ID");
  }

  if (!clientId) {
    throw new Error("Missing COGNITO_APP_CLIENT_ID");
  }

  if (!AWSRegion) {
    throw new Error("Missing AWS_REGION");
  }

  if (!nodeEnv) {
    throw new Error("Missing NODE_ENV");
  }

  return {
    COGNITO_USER_POOL_ID: userPoolId,
    COGNITO_APP_CLIENT_ID: clientId,
    AWS_REGION: AWSRegion,
    NODE_ENV: nodeEnv,
  };
}

export const env = getServerEnv();
