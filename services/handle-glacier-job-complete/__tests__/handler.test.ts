import { SNSEvent } from "aws-lambda";

const mockSend = jest.fn();

const mockReqWhere = jest.fn().mockResolvedValue([]);
const mockReqInnerJoin = jest.fn(() => ({ where: mockReqWhere }));
const mockReqFrom = jest.fn(() => ({ innerJoin: mockReqInnerJoin }));
const mockReqSelect = jest.fn().mockImplementation(() => ({ from: mockReqFrom }));

const mockRemainingWhere = jest.fn().mockResolvedValue([{ remaining: 0 }]);
const mockRemainingFrom = jest.fn(() => ({ where: mockRemainingWhere }));
const mockRemainingSelect = jest.fn().mockImplementation(() => ({ from: mockRemainingFrom }));

const mockBatchReturning = jest.fn().mockResolvedValue([{ id: "batch-1" }]);
const mockBatchUpdateWhere = jest.fn(() => ({ returning: mockBatchReturning }));
const mockBatchUpdateSet = jest.fn(() => ({ where: mockBatchUpdateWhere }));
const mockBatchUpdate = jest.fn(() => ({ set: mockBatchUpdateSet }));

const mockReqUpdateWhere = jest.fn().mockResolvedValue([]);
const mockReqUpdateSet = jest.fn(() => ({ where: mockReqUpdateWhere }));
const mockReqUpdate = jest.fn(() => ({ set: mockReqUpdateSet }));

const mockDb = {
  select: jest.fn()
    .mockImplementationOnce(() => ({ from: mockReqFrom }))
    .mockImplementationOnce(() => ({ from: mockRemainingFrom })),
  update: jest.fn((table) => {
    if (table === "retrieval_requests_table") return mockReqUpdate();
    if (table === "retrieval_batches_table") return mockBatchUpdate();
    throw new Error(`Unexpected update table: ${String(table)}`);
  }),
};

jest.mock("../../shared/db", () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock("../../shared/schema", () => ({
  retrievalBatches: "retrieval_batches_table",
  retrievalRequests: "retrieval_requests_table",
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...args) => ({ and: args })),
  count: jest.fn(() => ({ count: true })),
  not: jest.fn((arg) => ({ not: arg })),
  inArray: jest.fn((col, vals) => ({ inArray: { col, vals } })),
}));

jest.mock("@aws-sdk/client-ecs", () => ({
  ECSClient: jest.fn(() => ({ send: mockSend })),
  RunTaskCommand: jest.fn(function(input) {
    return { __type: "RunTaskCommand", input };
  }),
}));

function makeEvent(s3Key: string): SNSEvent {
  return {
    Records: [
      {
        Sns: {
          Message: JSON.stringify({
            Records: [
              {
                s3: {
                  object: {
                    key: encodeURIComponent(s3Key),
                  },
                },
              },
            ],
          }),
        },
      },
    ],
  } as unknown as SNSEvent;
}

beforeEach(() => {
  mockSend.mockReset();
  mockReqWhere.mockReset().mockResolvedValue([{ id: "req-1", batchId: "batch-1" }]);
  mockRemainingWhere.mockReset().mockResolvedValue([{ remaining: 0 }]);
  mockBatchReturning.mockReset().mockResolvedValue([{ id: "batch-1" }]);
  mockBatchUpdateWhere.mockClear();
  mockBatchUpdateSet.mockClear();
  mockBatchUpdate.mockClear();
  mockReqUpdateWhere.mockClear().mockResolvedValue([]);
  mockReqUpdateSet.mockClear();
  mockReqUpdate.mockClear();
  mockDb.select.mockReset()
    .mockImplementationOnce(() => ({ from: mockReqFrom }))
    .mockImplementationOnce(() => ({ from: mockRemainingFrom }));
  mockDb.update.mockClear();
});

describe("handle-glacier-job-complete handler", () => {
  it("marks a batch zipping once when all requests are ready", async () => {
    await import("../src/handler").then(({ handler }) => handler(makeEvent("users/u1/photos/p1.jpg")));

    expect(mockReqUpdateSet).toHaveBeenCalledWith({ status: "READY", availableAt: expect.any(Date) });
    expect(mockBatchUpdateSet).toHaveBeenCalledWith({ status: "ZIPPING" });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].__type).toBe("RunTaskCommand");
  });

  it("does not launch ECS if another invocation already flipped the batch", async () => {
    mockBatchReturning.mockResolvedValueOnce([]);

    await import("../src/handler").then(({ handler }) => handler(makeEvent("users/u1/photos/p1.jpg")));

    expect(mockSend).not.toHaveBeenCalled();
  });
});
