import { cognitoService } from "@/app/lib/services/cognito.service";
import {
  InitiateAuthCommand,
  GlobalSignOutCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock("@/app/lib/cognito", () => ({
  cognitoClient: { send: mockSend },
  COGNITO_APP_CLIENT_ID: "test-client-id",
}));

describe("cognitoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("login", () => {
    const body = { email: "test@test.com", password: "This1sValid" };

    it("sends InitiateAuthCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});
      await cognitoService.login(body);
      const command = mockSend.mock.calls[0][0] as InitiateAuthCommand;
      expect(command).toBeInstanceOf(InitiateAuthCommand);
      expect(command.input).toEqual({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: "test-client-id",
        AuthParameters: { USERNAME: body.email, PASSWORD: body.password },
      });
    });

    it("returns what cognitoClient.send returns", async () => {
      const mockResult = {
        $metadata: {},
        AuthenticationResult: { AccessToken: "token" },
      };
      mockSend.mockResolvedValueOnce(mockResult);
      const result = await cognitoService.login(body);
      expect(result).toEqual(mockResult);
    });
  });

  describe("logout", () => {
    const accessToken = "mock-access-token";

    it("sends GlobalSignOutCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});
      await cognitoService.logout(accessToken);
      const command = mockSend.mock.calls[0][0] as GlobalSignOutCommand;
      expect(command).toBeInstanceOf(GlobalSignOutCommand);
      expect(command.input).toEqual({ AccessToken: accessToken });
    });

    it("returns what cognitoClient.send returns", async () => {
      const mockResult = { $metadata: {} };
      mockSend.mockResolvedValueOnce(mockResult);
      const result = await cognitoService.logout(accessToken);
      expect(result).toEqual(mockResult);
    });
  });

  describe("signup", () => {
    const body = {
      given_name: "John",
      family_name: "Doe",
      phone_number: "+639999999999",
      email: "test@test.com",
      password: "Th1sIsValid",
      confirm_password: "Th1sIsValid",
    };

    it("sends SignUpCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});
      await cognitoService.signup(body);
      const command = mockSend.mock.calls[0][0] as SignUpCommand;
      expect(command).toBeInstanceOf(SignUpCommand);
      expect(command.input).toEqual({
        ClientId: "test-client-id",
        Username: body.email,
        Password: body.password,
        UserAttributes: [
          { Name: "given_name", Value: body.given_name },
          { Name: "family_name", Value: body.family_name },
          { Name: "phone_number", Value: body.phone_number },
          { Name: "email", Value: body.email },
        ],
      });
    });

    it("returns what cognitoClient.send returns", async () => {
      const mockResult = { $metadata: {}, UserSub: "some-uuid" };
      mockSend.mockResolvedValueOnce(mockResult);
      const result = await cognitoService.signup(body);
      expect(result).toEqual(mockResult);
    });
  });

  describe("confirmSignUp", () => {
    const body = { email: "test@test.com", confirmationCode: "123456" };

    it("sends ConfirmSignUpCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});
      await cognitoService.confirmSignUp(body);
      const command = mockSend.mock.calls[0][0] as ConfirmSignUpCommand;
      expect(command).toBeInstanceOf(ConfirmSignUpCommand);
      expect(command.input).toEqual({
        ClientId: "test-client-id",
        Username: body.email,
        ConfirmationCode: body.confirmationCode,
      });
    });

    it("returns what cognitoClient.send returns", async () => {
      const mockResult = { $metadata: {} };
      mockSend.mockResolvedValueOnce(mockResult);
      const result = await cognitoService.confirmSignUp(body);
      expect(result).toEqual(mockResult);
    });
  });

  describe("resendSignUpConfirmationCode", () => {
    const body = { email: "test@test.com" };

    it("sends ResendConfirmationCodeCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});
      await cognitoService.resendSignUpConfirmationCode(body);
      const command =
        mockSend.mock.calls[0][0] as ResendConfirmationCodeCommand;
      expect(command).toBeInstanceOf(ResendConfirmationCodeCommand);
      expect(command.input).toEqual({
        ClientId: "test-client-id",
        Username: body.email,
      });
    });

    it("returns what cognitoClient.send returns", async () => {
      const mockResult = { $metadata: {} };
      mockSend.mockResolvedValueOnce(mockResult);
      const result = await cognitoService.resendSignUpConfirmationCode(body);
      expect(result).toEqual(mockResult);
    });
  });

  describe("forgotPassword", () => {
    const body = { email: "test@test.com" };

    it("sends ForgotPasswordCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});
      await cognitoService.forgotPassword(body);
      const command = mockSend.mock.calls[0][0] as ForgotPasswordCommand;
      expect(command).toBeInstanceOf(ForgotPasswordCommand);
      expect(command.input).toEqual({
        ClientId: "test-client-id",
        Username: body.email,
      });
    });

    it("returns what cognitoClient.send returns", async () => {
      const mockResult = { $metadata: {} };
      mockSend.mockResolvedValueOnce(mockResult);
      const result = await cognitoService.forgotPassword(body);
      expect(result).toEqual(mockResult);
    });
  });

  describe("confirmForgotPassword", () => {
    const body = {
      email: "test@test.com",
      confirmationCode: "123456",
      password: "Th1sIsValid",
    };

    it("sends ConfirmForgotPasswordCommand with correct params", async () => {
      mockSend.mockResolvedValueOnce({});
      await cognitoService.confirmForgotPassword(body);
      const command =
        mockSend.mock.calls[0][0] as ConfirmForgotPasswordCommand;
      expect(command).toBeInstanceOf(ConfirmForgotPasswordCommand);
      expect(command.input).toEqual({
        ClientId: "test-client-id",
        Username: body.email,
        ConfirmationCode: body.confirmationCode,
        Password: body.password,
      });
    });

    it("returns what cognitoClient.send returns", async () => {
      const mockResult = { $metadata: {} };
      mockSend.mockResolvedValueOnce(mockResult);
      const result = await cognitoService.confirmForgotPassword(body);
      expect(result).toEqual(mockResult);
    });
  });
});
