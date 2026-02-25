function getServerEnv() {
  const cdkDefaultAccount = process.env.CDK_DEFAULT_ACCOUNT;
  const cdkDefaultRegion = process.env.CDK_DEFAULT_REGION;
  const isProduction = process.env.IS_PRODUCTION === "true";

  if (!cdkDefaultAccount) {
    throw new Error("Missing CDK_DEFAULT_ACCOUNT");
  }

  if (!cdkDefaultRegion) {
    throw new Error("Missing CDK_DEFAULT_REGION");
  }

  return {
    CDK_DEFAULT_ACCOUNT: cdkDefaultAccount,
    CDK_DEFAULT_REGION: cdkDefaultRegion,
    IS_PRODUCTION: isProduction,
  };
}

export const env = getServerEnv();
