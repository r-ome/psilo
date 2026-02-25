import {
  cognitoClient,
  COGNITO_APP_CLIENT_ID,
} from "@/app/lib/cognito";
import {
  InitiateAuthCommand,
  GlobalSignOutCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  ConfirmForgotPasswordInput,
  ConfirmSignUpInput,
  SignUpInput,
  LoginInput,
} from "@/app/lib/schemas/auth";

export const cognitoService = {
  login: (body: LoginInput) =>
    cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: COGNITO_APP_CLIENT_ID,
        AuthParameters: { USERNAME: body.email, PASSWORD: body.password },
      }),
    ),
  logout: (accessToken: string) =>
    cognitoClient.send(new GlobalSignOutCommand({ AccessToken: accessToken })),
  signup: (body: SignUpInput) =>
    cognitoClient.send(
      new SignUpCommand({
        ClientId: COGNITO_APP_CLIENT_ID,
        Username: body.email,
        Password: body.password,
        UserAttributes: [
          { Name: "given_name", Value: body.given_name },
          { Name: "family_name", Value: body.family_name },
          { Name: "phone_number", Value: body.phone_number },
          { Name: "email", Value: body.email },
        ],
      }),
    ),
  confirmSignUp: (body: ConfirmSignUpInput) =>
    cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: COGNITO_APP_CLIENT_ID,
        Username: body.email,
        ConfirmationCode: body.confirmationCode,
      }),
    ),
  resendSignUpConfirmationCode: (body: { email: string }) =>
    cognitoClient.send(
      new ResendConfirmationCodeCommand({
        ClientId: COGNITO_APP_CLIENT_ID,
        Username: body.email,
      }),
    ),
  forgotPassword: (body: { email: string }) =>
    cognitoClient.send(
      new ForgotPasswordCommand({
        ClientId: COGNITO_APP_CLIENT_ID,
        Username: body.email,
      }),
    ),
  confirmForgotPassword: (body: ConfirmForgotPasswordInput) =>
    cognitoClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: COGNITO_APP_CLIENT_ID,
        Username: body.email,
        ConfirmationCode: body.confirmationCode,
        Password: body.password,
      }),
    ),
};
