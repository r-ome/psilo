import { s3Service } from "@/app/lib/services/s3.service";
import { api } from "@/app/lib/api";

vi.mock("@/app/lib/api");

describe("s3Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPresignedURL", () => {
    const body = { filename: "test.txt", contentType: "text/plain" };

    it("calls the correct url with the correct body", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        url: "https://s3.example.com/presigned",
        key: "users/123/test.txt",
      });
      await s3Service.getPresignedURL(body);
      expect(api.post).toBeCalledWith("/api/files/upload", body);
    });

    it("returns what api.post returns", async () => {
      const mockResult = {
        url: "https://s3.example.com/presigned",
        key: "users/123/test.txt",
      };
      vi.mocked(api.post).mockResolvedValueOnce(mockResult);
      const result = await s3Service.getPresignedURL(body);
      expect(result).toEqual(mockResult);
    });
  });

  describe("preflightUploads", () => {
    const items = [
      {
        clientId: "file-1",
        filename: "test.jpg",
        contentType: "image/jpeg",
        perceptualHash: "abc123",
      },
    ];

    it("calls the batch preflight endpoint", async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ results: [] });
      await s3Service.preflightUploads(items);
      expect(api.post).toBeCalledWith("/api/files/preflight", { items });
    });
  });

  describe("uploadToS3", () => {
    type MockXhr = {
      open: ReturnType<typeof vi.fn>;
      setRequestHeader: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      upload: { onprogress: ((e: ProgressEvent) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      ontimeout: (() => void) | null;
      status: number;
    };
    let mockXHRs: MockXhr[];

    beforeEach(() => {
      mockXHRs = [];
      vi.useFakeTimers();
      vi.stubGlobal(
        "XMLHttpRequest",
        vi.fn(() => {
          const mockXHR: MockXhr = {
            open: vi.fn(),
            setRequestHeader: vi.fn(),
            send: vi.fn(),
            upload: { onprogress: null },
            onload: null,
            onerror: null,
            ontimeout: null,
            status: 200,
          };
          mockXHRs.push(mockXHR);
          return mockXHR;
        }),
      );
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    const url = "https://s3.amazonaws.com/presigned-url";
    const file = new File(["content"], "test.txt", { type: "text/plain" });

    it("opens XHR with PUT and the given url", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHRs[0].onload!();
      await promise;
      expect(mockXHRs[0].open).toHaveBeenCalledWith("PUT", url);
    });

    it("sets Content-Type header to file.type", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHRs[0].onload!();
      await promise;
      expect(mockXHRs[0].setRequestHeader).toHaveBeenCalledWith(
        "Content-Type",
        file.type,
      );
    });

    it("sends the file", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHRs[0].onload!();
      await promise;
      expect(mockXHRs[0].send).toHaveBeenCalledWith(file);
    });

    it("resolves on status 200", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHRs[0].status = 200;
      mockXHRs[0].onload!();
      await expect(promise).resolves.toBeUndefined();
    });

    it("rejects with upload failed error when status is not 200", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHRs[0].status = 403;
      mockXHRs[0].onload!();
      await expect(promise).rejects.toThrow("Upload failed: 403");
    });

    it("rejects with network error after exhausting retry attempts", async () => {
      const promise = s3Service.uploadToS3(url, file);

      mockXHRs[0].onerror!();
      await vi.advanceTimersByTimeAsync(500);

      mockXHRs[1].onerror!();
      await vi.advanceTimersByTimeAsync(1000);

      mockXHRs[2].onerror!();
      await vi.advanceTimersByTimeAsync(2000);

      mockXHRs[3].onerror!();

      await expect(promise).rejects.toThrow("Upload network error");
      expect(mockXHRs).toHaveLength(4);
    });

    it("calls onProgress with percentage during upload", async () => {
      const onProgress = vi.fn();
      const promise = s3Service.uploadToS3(url, file, onProgress);
      mockXHRs[0].upload.onprogress!({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
      mockXHRs[0].onload!();
      await promise;
      expect(onProgress).toHaveBeenCalledWith(50);
    });

    it("does not call onProgress when lengthComputable is false", async () => {
      const onProgress = vi.fn();
      const promise = s3Service.uploadToS3(url, file, onProgress);
      mockXHRs[0].upload.onprogress!({
        lengthComputable: false,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
      mockXHRs[0].onload!();
      await promise;
      expect(onProgress).not.toHaveBeenCalled();
    });

    it("does not set onprogress when no onProgress callback is provided", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHRs[0].onload!();
      await promise;
      expect(mockXHRs[0].upload.onprogress).toBeNull();
    });

    it("retries retryable 503 responses and eventually succeeds", async () => {
      const promise = s3Service.uploadToS3(url, file);

      mockXHRs[0].status = 503;
      mockXHRs[0].onload!();
      await vi.advanceTimersByTimeAsync(500);

      expect(mockXHRs).toHaveLength(2);
      mockXHRs[1].status = 200;
      mockXHRs[1].onload!();

      await expect(promise).resolves.toBeUndefined();
      expect(mockXHRs).toHaveLength(2);
    });

    it("retries network errors and eventually succeeds", async () => {
      const promise = s3Service.uploadToS3(url, file);

      mockXHRs[0].onerror!();
      await vi.advanceTimersByTimeAsync(500);

      expect(mockXHRs).toHaveLength(2);
      mockXHRs[1].status = 200;
      mockXHRs[1].onload!();

      await expect(promise).resolves.toBeUndefined();
    });

    it("rejects after exhausting retryable attempts", async () => {
      const promise = s3Service.uploadToS3(url, file);

      mockXHRs[0].status = 503;
      mockXHRs[0].onload!();
      await vi.advanceTimersByTimeAsync(500);

      mockXHRs[1].status = 503;
      mockXHRs[1].onload!();
      await vi.advanceTimersByTimeAsync(1000);

      mockXHRs[2].status = 503;
      mockXHRs[2].onload!();
      await vi.advanceTimersByTimeAsync(2000);

      mockXHRs[3].status = 503;
      mockXHRs[3].onload!();

      await expect(promise).rejects.toThrow("Upload failed: 503");
      expect(mockXHRs).toHaveLength(4);
    });
  });
});
