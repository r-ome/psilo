import { Readable } from "stream";

const mockArchiveAppend = jest.fn();
const mockArchiveFinalize = jest.fn();
const mockArchivePipe = jest.fn();
const mockArchiveOn = jest.fn();
const mockArchiver = jest.fn(() => ({
  on: mockArchiveOn,
  pipe: mockArchivePipe,
  append: mockArchiveAppend,
  finalize: mockArchiveFinalize,
}));

const mockUploadDone = jest.fn().mockResolvedValue(undefined);
const mockUploadCtor = jest.fn(() => ({ done: mockUploadDone }));

const mockS3Send = jest.fn();
const mockGetSignedUrl = jest.fn().mockResolvedValue("https://zip.example/batch-1.zip");

const mockBatchLimit = jest.fn().mockResolvedValue([
  { id: "batch-1", status: "ZIPPING" },
]);
const mockBatchWhere = jest.fn(() => ({ limit: mockBatchLimit }));
const mockBatchFrom = jest.fn(() => ({ where: mockBatchWhere }));

const mockRequestsWhere = jest.fn().mockResolvedValue([
  { id: "req-ok", s3Key: "users/u1/photos/ok.jpg" },
  { id: "req-fail", s3Key: "users/u1/photos/fail.jpg" },
]);
const mockRequestsFrom = jest.fn(() => ({ where: mockRequestsWhere }));

const mockReqUpdateWhere = jest.fn().mockResolvedValue([]);
const mockReqUpdateSet = jest.fn(() => ({ where: mockReqUpdateWhere }));
const mockReqUpdate = jest.fn(() => ({ set: mockReqUpdateSet }));

const mockBatchUpdateWhere = jest.fn().mockResolvedValue([]);
const mockBatchUpdateSet = jest.fn(() => ({ where: mockBatchUpdateWhere }));
const mockBatchUpdate = jest.fn(() => ({ set: mockBatchUpdateSet }));

const mockSelect = jest.fn()
  .mockImplementationOnce(() => ({ from: mockBatchFrom }))
  .mockImplementationOnce(() => ({ from: mockRequestsFrom }));

const mockDb = {
  select: mockSelect,
  update: jest.fn((table) => {
    if (table === "retrieval_requests_table") return mockReqUpdate();
    if (table === "retrieval_batches_table") return mockBatchUpdate();
    throw new Error(`Unexpected table: ${String(table)}`);
  }),
};

jest.mock("archiver", () => ({
  __esModule: true,
  default: mockArchiver,
}));

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  GetObjectCommand: jest.fn(function(input) {
    return { __type: "GetObjectCommand", input };
  }),
}));

jest.mock("@aws-sdk/lib-storage", () => ({
  Upload: mockUploadCtor,
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  inArray: jest.fn((col, vals) => ({ inArray: { col, vals } })),
}));

jest.mock("../../../shared/db", () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock("../../../shared/schema", () => ({
  retrievalBatches: "retrieval_batches_table",
  retrievalRequests: "retrieval_requests_table",
}));

describe("zip-processor", () => {
  beforeEach(() => {
    mockArchiveAppend.mockClear();
    mockArchiveFinalize.mockClear();
    mockArchivePipe.mockClear();
    mockArchiveOn.mockClear();
    mockArchiver.mockClear();
    mockUploadDone.mockClear().mockResolvedValue(undefined);
    mockUploadCtor.mockClear();
    mockS3Send.mockReset();
    mockGetSignedUrl.mockClear().mockResolvedValue("https://zip.example/batch-1.zip");
    mockBatchLimit.mockClear().mockResolvedValue([
      { id: "batch-1", status: "ZIPPING" },
    ]);
    mockBatchWhere.mockClear();
    mockBatchFrom.mockClear();
    mockRequestsWhere.mockClear().mockResolvedValue([
      { id: "req-ok", s3Key: "users/u1/photos/ok.jpg" },
      { id: "req-fail", s3Key: "users/u1/photos/fail.jpg" },
    ]);
    mockRequestsFrom.mockClear();
    mockReqUpdateWhere.mockClear().mockResolvedValue([]);
    mockReqUpdateSet.mockClear();
    mockReqUpdate.mockClear();
    mockBatchUpdateWhere.mockClear().mockResolvedValue([]);
    mockBatchUpdateSet.mockClear();
    mockBatchUpdate.mockClear();
    mockSelect.mockReset()
      .mockImplementationOnce(() => ({ from: mockBatchFrom }))
      .mockImplementationOnce(() => ({ from: mockRequestsFrom }));
  });

  it("keeps going when one file fetch fails and marks the batch partial", async () => {
    mockS3Send.mockImplementation(async (command) => {
      if (command.__type === "GetObjectCommand" && command.input.Key.endsWith("ok.jpg")) {
        return { Body: Readable.from(["ok"]) };
      }
      if (command.__type === "GetObjectCommand" && command.input.Key.endsWith("fail.jpg")) {
        throw new Error("boom");
      }
      return {};
    });

    await jest.isolateModulesAsync(async () => {
      await import("../src/index");
    });

    expect(mockArchiveAppend).toHaveBeenCalledTimes(1);
    expect(mockReqUpdateSet).toHaveBeenCalledWith({ status: "FAILED" });
    expect(mockUploadDone).toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
});
