import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { env } from "@/app/lib/env.server";

export const cognitoClient = new CognitoIdentityProviderClient({
  region: env.AWS_REGION,
});

export const COGNITO_APP_CLIENT_ID = env.COGNITO_APP_CLIENT_ID;

export function handleCognitoError(error: unknown) {
  if (error instanceof Error) {
    switch (error.name) {
      // Auth errors
      case "NotAuthorizedException":
        return { message: "Incorrect username or password.", status: 401 };
      case "UserNotFoundException":
        return { message: "No account found with this email.", status: 404 };
      case "UserNotConfirmedException":
        return {
          message: "Account not confirmed. Please verify your email.",
          status: 403,
        };
      case "PasswordResetRequiredException":
        return { message: "Password reset is required.", status: 403 };

      // Sign-up errors
      case "UsernameExistsException":
        return {
          message: "An account with this email already exists.",
          status: 409,
        };
      case "AliasExistsException":
        return {
          message: "An account with this email or phone number already exists.",
          status: 409,
        };
      case "InvalidPasswordException":
        return { message: "Password does not meet requirements.", status: 400 };
      case "PasswordHistoryPolicyViolationException":
        return {
          message: "New password matches a previously used password.",
          status: 400,
        };

      // Code errors
      case "CodeMismatchException":
        return { message: "Invalid verification code.", status: 400 };
      case "ExpiredCodeException":
        return {
          message: "Verification code has expired. Request a new one.",
          status: 400,
        };
      case "CodeDeliveryFailureException":
        return {
          message: "Failed to send verification code. Try again.",
          status: 500,
        };

      // Parameter / request errors
      case "InvalidParameterException":
        return { message: "Invalid request parameters.", status: 400 };
      case "UnsupportedOperationException":
        return { message: "This operation is not supported.", status: 400 };

      // Rate limiting
      case "TooManyRequestsException":
        return {
          message: "Too many requests. Slow down and try again.",
          status: 429,
        };
      case "TooManyFailedAttemptsException":
        return {
          message: "Too many failed attempts. Try again later.",
          status: 429,
        };
      case "LimitExceededException":
        return {
          message: "Request limit exceeded. Try again later.",
          status: 429,
        };
      case "ForbiddenException":
        return { message: "Request blocked by security policy.", status: 403 };

      // Configuration errors (server-side misconfigs)
      case "InvalidUserPoolConfigurationException":
        return {
          message: "User pool is not properly configured.",
          status: 500,
        };
      case "InvalidEmailRoleAccessPolicyException":
        return {
          message: "Email sending is not properly configured.",
          status: 500,
        };
      case "InvalidSmsRoleAccessPolicyException":
        return {
          message: "SMS sending is not properly configured.",
          status: 500,
        };
      case "InvalidSmsRoleTrustRelationshipException":
        return {
          message: "SMS role trust relationship is invalid.",
          status: 500,
        };

      // Lambda errors
      case "InvalidLambdaResponseException":
        return {
          message: "An error occurred during request processing.",
          status: 500,
        };
      case "UnexpectedLambdaException":
        return {
          message: "An unexpected error occurred during processing.",
          status: 500,
        };
      case "UserLambdaValidationException":
        return { message: "User validation failed.", status: 400 };

      // Resource / internal errors
      case "ResourceNotFoundException":
        return {
          message: "The requested resource was not found.",
          status: 404,
        };
      case "InternalErrorException":
        return {
          message: "An internal server error occurred. Try again later.",
          status: 500,
        };

      default:
        return { message: "Something went wrong.", status: 500 };
    }
  }
  return { message: "Something went wrong.", status: 500 };
}
