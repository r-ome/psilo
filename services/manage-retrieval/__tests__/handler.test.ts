import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const mockListOrderBy = jest.fn().mockResolvedValue([]);
const mockListWhere = jest.fn(() => ({ orderBy: mockListOrderBy }));
const mockListFrom = jest.fn(() => ({ where: mockListWhere }));

const mockDetailLimit = jest.fn().mockResolvedValue([]);
const mockDetailWhere = jest.fn(() => ({ limit: mockDetailLimit }));
const mockDetailFrom = jest.fn(() => ({ where: mockDetailWhere }));

const mockRequestsWhere = jest.fn().mockResolvedValue([]);
const mockRequestsLeftJoin = jest.fn(() => ({ where: mockRequestsWhere }));
const mockRequestsFrom = jest.fn(() => ({ leftJoin: mockRequestsLeftJoin }));

const mockSelect = jest.fn();

const mockDb = {
  select: mockSelect,
};

jest.mock("../../shared/db", () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock("../../shared/schema", () => ({
  retrievalBatches: "retrieval_batches_table",
  retrievalRequests: "retrieval_requests_table",
  photos: "photos_table",
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  desc: jest.fn((col) => ({ desc: col })),
}));

function makeEvent(routeKey: string, pathParameters?: Record<string, string>): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey,
    pathParameters,
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
  mockListOrderBy.mockReset().mockResolvedValue([]);
  mockListWhere.mockClear();
  mockListFrom.mockClear();
  mockDetailLimit.mockReset().mockResolvedValue([]);
  mockDetailWhere.mockClear();
  mockDetailFrom.mockClear();
  mockRequestsWhere.mockReset().mockResolvedValue([]);
  mockRequestsLeftJoin.mockClear();
  mockRequestsFrom.mockClear();
  mockSelect.mockReset();
});

describe("manage-retrieval handler", () => {
  it("marks expired retrieval batches as EXPIRED in list responses", async () => {
    mockSelect.mockImplementationOnce(() => ({ from: mockListFrom }));
    mockListOrderBy.mockResolvedValueOnce([
      {
        id: "batch-1",
        userId: "user-1",
        status: "COMPLETED",
        expiresAt: new Date("2024-01-01T00:00:00.000Z"),
        requestedAt: new Date("2023-12-01T00:00:00.000Z"),
      },
    ]);

    const result = await callHandler(makeEvent("GET /retrieval/batches"));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.batches[0].status).toBe("EXPIRED");
  });

  it("marks expired request rows as EXPIRED in batch detail responses", async () => {
    mockSelect
      .mockImplementationOnce(() => ({ from: mockDetailFrom }))
      .mockImplementationOnce(() => ({ from: mockRequestsFrom }));

    mockDetailLimit.mockResolvedValueOnce([
      {
        id: "batch-1",
        userId: "user-1",
        status: "COMPLETED",
        expiresAt: new Date("2024-01-01T00:00:00.000Z"),
        requestedAt: new Date("2023-12-01T00:00:00.000Z"),
      },
    ]);

    mockRequestsWhere.mockResolvedValueOnce([
      {
        id: "request-1",
        batchId: "batch-1",
        photoId: "photo-1",
        s3Key: "users/user-1/photos/photo-1.jpg",
        filename: "photo-1.jpg",
        fileSize: 10,
        status: "READY",
        retrievalLink: "https://signed.example",
        requestedAt: new Date("2023-12-01T00:00:00.000Z"),
        availableAt: new Date("2023-12-02T00:00:00.000Z"),
        expiresAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await callHandler(makeEvent("GET /retrieval/batches/{batchId}", { batchId: "batch-1" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body as string);
    expect(body.batch.status).toBe("EXPIRED");
    expect(body.requests[0].status).toBe("EXPIRED");
  });
});
