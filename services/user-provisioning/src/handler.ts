import { PostConfirmationTriggerEvent } from "aws-lambda";
import { createUserPrefix } from "./s3";

export const handler = async (event: PostConfirmationTriggerEvent) => {
  const userId = event.request.userAttributes.sub;
  const email = event.request.userAttributes.email;

  console.log(`Creating S3 prefix for user: ${email}`);

  await createUserPrefix(userId);

  return event;
};
