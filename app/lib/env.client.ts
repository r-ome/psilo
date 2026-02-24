function getClientEnv() {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID;

  if (!userPoolId) {
    throw new Error("Missing NEXT_PUBLIC_COGNITO_USER_POOL_ID");
  }

  if (!clientId) {
    throw new Error("Missing NEXT_PUBLIC_COGNITO_APP_CLIENT_ID");
  }

  return {
    COGNITO_USER_POOL_ID: userPoolId,
    COGNITO_APP_CLIENT_ID: clientId,
  };
}

export const clientEnv = getClientEnv();
