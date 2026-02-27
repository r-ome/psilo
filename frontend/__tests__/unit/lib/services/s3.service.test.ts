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

  describe("uploadToS3", () => {
    let mockXHR: {
      open: ReturnType<typeof vi.fn>;
      setRequestHeader: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      upload: { onprogress: ((e: ProgressEvent) => void) | null };
      onload: (() => void) | null;
      onerror: (() => void) | null;
      status: number;
    };

    beforeEach(() => {
      mockXHR = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { onprogress: null },
        onload: null,
        onerror: null,
        status: 200,
      };
      vi.stubGlobal("XMLHttpRequest", vi.fn(() => mockXHR));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const url = "https://s3.amazonaws.com/presigned-url";
    const file = new File(["content"], "test.txt", { type: "text/plain" });

    it("opens XHR with PUT and the given url", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHR.onload!();
      await promise;
      expect(mockXHR.open).toHaveBeenCalledWith("PUT", url);
    });

    it("sets Content-Type header to file.type", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHR.onload!();
      await promise;
      expect(mockXHR.setRequestHeader).toHaveBeenCalledWith(
        "Content-Type",
        file.type,
      );
    });

    it("sends the file", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHR.onload!();
      await promise;
      expect(mockXHR.send).toHaveBeenCalledWith(file);
    });

    it("resolves on status 200", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHR.status = 200;
      mockXHR.onload!();
      await expect(promise).resolves.toBeUndefined();
    });

    it("rejects with upload failed error when status is not 200", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHR.status = 403;
      mockXHR.onload!();
      await expect(promise).rejects.toThrow("Upload failed: 403");
    });

    it("rejects with network error on onerror", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHR.onerror!();
      await expect(promise).rejects.toThrow("Upload network error");
    });

    it("calls onProgress with percentage during upload", async () => {
      const onProgress = vi.fn();
      const promise = s3Service.uploadToS3(url, file, onProgress);
      mockXHR.upload.onprogress!({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
      mockXHR.onload!();
      await promise;
      expect(onProgress).toHaveBeenCalledWith(50);
    });

    it("does not call onProgress when lengthComputable is false", async () => {
      const onProgress = vi.fn();
      const promise = s3Service.uploadToS3(url, file, onProgress);
      mockXHR.upload.onprogress!({
        lengthComputable: false,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
      mockXHR.onload!();
      await promise;
      expect(onProgress).not.toHaveBeenCalled();
    });

    it("does not set onprogress when no onProgress callback is provided", async () => {
      const promise = s3Service.uploadToS3(url, file);
      mockXHR.onload!();
      await promise;
      expect(mockXHR.upload.onprogress).toBeNull();
    });
  });
});
