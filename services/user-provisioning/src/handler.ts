import { PostConfirmationTriggerEvent } from "aws-lambda";
import { createUserPrefix } from "./s3";
import { insertUser } from "./db";

export const handler = async (event: PostConfirmationTriggerEvent) => {
  const userId = event.request.userAttributes.sub;
  const email = event.request.userAttributes.email;
  const givenName = event.request.userAttributes.given_name;
  const familyName = event.request.userAttributes.family_name;

  console.log(`Creating S3 prefix for user: ${email}`);

  await createUserPrefix(userId, givenName, familyName);
  await insertUser(userId, email, givenName, familyName);

  return event;
};
