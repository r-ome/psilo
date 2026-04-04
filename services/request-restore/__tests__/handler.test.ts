import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn().mockResolvedValue("https://signed.example/standard");

const mockBatchReturning = jest.fn();
const mockBatchInsertValues = jest.fn(() => ({ returning: mockBatchReturning }));
const mockBatchInsert = jest.fn(() => ({ values: mockBatchInsertValues }));

const mockRequestInsertValues = jest.fn();
const mockRequestInsert = jest.fn(() => ({ values: mockRequestInsertValues }));

const mockRequestUpdateWhere = jest.fn().mockResolvedValue([]);
const mockRequestUpdateSet = jest.fn(() => ({ where: mockRequestUpdateWhere }));
const mockRequestUpdate = jest.fn(() => ({ set: mockRequestUpdateSet }));

const mockBatchUpdateWhere = jest.fn().mockResolvedValue([]);
const mockBatchUpdateSet = jest.fn(() => ({ where: mockBatchUpdateWhere }));
const mockBatchUpdate = jest.fn(() => ({ set: mockBatchUpdateSet }));

const mockBatchLimit = jest.fn();
const mockBatchWhere = jest.fn(() => ({ limit: mockBatchLimit }));
const mockPendingWhere = jest.fn().mockResolvedValue([]);
const mockPendingFrom = jest.fn(() => ({ where: mockPendingWhere }));
const mockBatchFrom = jest.fn(() => ({ where: mockBatchWhere }));
const mockPhotoOwnershipWhere = jest.fn().mockResolvedValue([]);
const mockActiveWhere = jest.fn().mockResolvedValue([]);
const mockPhotoFrom = jest.fn(() => ({ where: mockPhotoOwnershipWhere }));
const mockActiveFrom = jest.fn(() => ({ innerJoin: jest.fn(() => ({ where: mockActiveWhere })) }));

const mockSelect = jest.fn()
  .mockImplementationOnce(() => ({ from: mockPhotoFrom }))
  .mockImplementationOnce(() => ({ from: mockActiveFrom }))
  .mockImplementationOnce(() => ({ from: mockBatchFrom }))
  .mockImplementationOnce(() => ({ from: mockPendingFrom }));

const mockInsert = jest.fn((table) => {
  if (table === "retrieval_batches_table") return mockBatchInsert();
  if (table === "retrieval_requests_table") return mockRequestInsert();
  throw new Error(`Unexpected insert table: ${String(table)}`);
});

const mockUpdate = jest.fn((table) => {
  if (table === "retrieval_requests_table") return mockRequestUpdate();
  if (table === "retrieval_batches_table") return mockBatchUpdate();
  throw new Error(`Unexpected update table: ${String(table)}`);
});

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
};

jest.mock("../../shared/db", () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock("../../shared/schema", () => ({
  photos: "photos_table",
  retrievalBatches: "retrieval_batches_table",
  retrievalRequests: "retrieval_requests_table",
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...args) => ({ and: args })),
  inArray: jest.fn((col, vals) => ({ inArray: { col, vals } })),
  not: jest.fn((arg) => ({ not: arg })),
  or: jest.fn((...args) => ({ or: args })),
  isNull: jest.fn((col) => ({ isNull: col })),
  gt: jest.fn((col, val) => ({ col, val })),
}));

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn(function(input) {
    return { __type: "GetObjectCommand", input };
  }),
  HeadObjectCommand: jest.fn(function(input) {
    return { __type: "HeadObjectCommand", input };
  }),
  RestoreObjectCommand: jest.fn(function(input) {
    return { __type: "RestoreObjectCommand", input };
  }),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

function makeEvent(keys: string[], body?: Partial<Record<string, unknown>>): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body: JSON.stringify({ keys, ...body }),
    requestContext: {
      authorizer: {
        jwt: { claims: { sub: "user-1" } },
      },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

async function callHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const { handler } = await import("../src/handler");
  return handler(event) as Promise<APIGatewayProxyStructuredResultV2>;
}

beforeEach(() => {
  mockSend.mockReset();
  mockGetSignedUrl.mockClear().mockResolvedValue("https://signed.example/standard");
  mockBatchReturning.mockReset();
  mockBatchInsertValues.mockClear();
  mockBatchInsert.mockClear();
  mockRequestInsertValues.mockClear();
  mockRequestInsert.mockClear();
  mockRequestUpdateWhere.mockClear().mockResolvedValue([]);
  mockRequestUpdateSet.mockClear();
  mockRequestUpdate.mockClear();
  mockBatchUpdateWhere.mockClear().mockResolvedValue([]);
  mockBatchUpdateSet.mockClear();
  mockBatchUpdate.mockClear();
  mockBatchLimit.mockClear();
  mockBatchWhere.mockClear();
  mockPendingWhere.mockClear().mockResolvedValue([]);
  mockPendingFrom.mockClear();
  mockBatchFrom.mockClear();
  mockPhotoOwnershipWhere.mockClear().mockResolvedValue([]);
  mockActiveWhere.mockClear().mockResolvedValue([]);
  mockPhotoFrom.mockClear();
  mockActiveFrom.mockClear();
  mockSelect.mockClear()
    .mockImplementationOnce(() => ({ from: mockPhotoFrom }))
    .mockImplementationOnce(() => ({ from: mockActiveFrom }))
    .mockImplementationOnce(() => ({ from: mockBatchFrom }))
    .mockImplementationOnce(() => ({ from: mockPendingFrom }));
});

describe("request-restore handler", () => {
  it("splits mixed standard and glacier input correctly", async () => {
    mockPhotoOwnershipWhere.mockResolvedValueOnce([
      { id: "p1", userId: "user-1", s3Key: "users/user-1/photos/p1.jpg", filename: "p1.jpg", size: 10 },
      { id: "p2", userId: "user-1", s3Key: "users/user-1/photos/p2.jpg", filename: "p2.jpg", size: 20 },
    ]);

    mockActiveWhere.mockResolvedValueOnce([]);
    mockBatchReturning.mockResolvedValueOnce([{ id: "batch-1" }]);
    mockBatchLimit.mockResolvedValueOnce([
      {
        id: "batch-1",
        retrievalTier: "STANDARD",
        status: "PENDING",
      },
    ]);
    mockPendingWhere.mockResolvedValueOnce([{ id: "req-2", s3Key: "users/user-1/photos/p2.jpg" }]);

    mockSend.mockImplementation(async (command) => {
      if (command.__type === "HeadObjectCommand") {
        if (command.input.Key.endsWith("p1.jpg")) {
          return { StorageClass: "STANDARD", Restore: 'ongoing-request="false"' };
        }
        return { StorageClass: "GLACIER", Restore: 'ongoing-request="true"' };
      }

      if (command.__type === "RestoreObjectCommand") {
        return {};
      }

      return {};
    });

    const result = await callHandler(makeEvent(["users/user-1/photos/p1.jpg", "users/user-1/photos/p2.jpg"]));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.standardUrls).toEqual([
      { key: "users/user-1/photos/p1.jpg", url: "https://signed.example/standard" },
    ]);
    expect(body.glacierInitiated).toBe(true);
    expect(body.alreadyActive).toEqual([]);
    expect(mockBatchInsertValues).toHaveBeenCalledWith({
      userId: "user-1",
      batchType: "MANUAL",
      sourceId: null,
      retrievalTier: "STANDARD",
      status: "PENDING",
      totalFiles: 1,
      totalSize: 20,
    });
    expect(mockSend).toHaveBeenCalled();
  });
});
