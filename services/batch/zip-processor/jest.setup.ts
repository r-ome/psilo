process.env.BUCKET_NAME = process.env.BUCKET_NAME ?? "source-bucket";
process.env.ZIP_BUCKET_NAME = process.env.ZIP_BUCKET_NAME ?? "zip-bucket";
process.env.BATCH_ID = process.env.BATCH_ID ?? "batch-1";

const exitMock = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
afterEach(() => {
  exitMock.mockClear();
});
