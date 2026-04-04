import { EventBridgeEvent } from "aws-lambda";

const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockCreateDb = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn((input) => ({ input })),
}));

jest.mock("@aws-sdk/client-ses", () => ({
  SESClient: jest.fn(() => ({ send: jest.fn() })),
  SendEmailCommand: jest.fn((input) => ({ input })),
}));

jest.mock(
  "@aws-sdk/client-cognito-identity-provider",
  () => ({
    CognitoIdentityProviderClient: jest.fn(() => ({ send: jest.fn() })),
    AdminGetUserCommand: jest.fn((input) => ({ input })),
  }),
  { virtual: true },
);

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

jest.mock("../../shared/db", () => ({
  createDb: mockCreateDb,
}));

jest.mock("../../shared/schema", () => ({
  photos: { s3Key: "photos.s3Key", userId: "photos.userId" },
  users: { id: "users.id" },
  retrievalBatches: { id: "retrievalBatches.id", batchType: "retrievalBatches.batchType", status: "retrievalBatches.status" },
  retrievalRequests: { batchId: "retrievalRequests.batchId", s3Key: "retrievalRequests.s3Key", status: "retrievalRequests.status" },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((...args) => ({ eq: args })),
  and: jest.fn((...args) => ({ and: args })),
  inArray: jest.fn((...args) => ({ inArray: args })),
  not: jest.fn((...args) => ({ not: args })),
}));

import { handler } from "../src/handler";

const mockSelectResults: unknown[][] = [];

const makeQuery = () => {
  const limit = jest.fn(() => Promise.resolve(mockSelectResults.shift() ?? []));
  const whereWithLimit = jest.fn(() => ({ limit }));
  const whereDirect = jest.fn(() => Promise.resolve(mockSelectResults.shift() ?? []));
  const innerJoin = jest.fn(() => ({ where: whereDirect }));
  const from = jest.fn(() => ({ where: whereWithLimit, innerJoin }));
  return { from };
};

describe("handle-restore-completed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectResults.length = 0;
    mockCreateDb.mockReturnValue({
      select: jest.fn(() => makeQuery()),
    });
    mockSend.mockResolvedValue({});
    mockGetSignedUrl.mockResolvedValue("https://example.com/download");
  });

  it("does not send an email for non-SINGLE restore flows", async () => {
    mockSelectResults.push(
      [
        {
          s3Key: "users/u1/photos/photo.jpg",
          userId: "u1",
          filename: "photo.jpg",
        },
      ],
      [],
    );

    const event = {
      detail: { object: { key: "users/u1/photos/photo.jpg" } },
    } as EventBridgeEvent<"Object Restore Completed", { bucket: { name: string }; object: { key: string } }>;

    await handler(event);

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
