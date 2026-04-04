import { render, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import { UploadProvider, useUpload } from "@/app/context/UploadContext";
import { s3Service } from "@/app/lib/services/s3.service";
import { getImageDataForHash } from "@/app/lib/utils/image-hash";

type UploadState = {
  isUploading: boolean;
  activeUploads: number;
  completedFiles: number;
  startUpload: (files: File[]) => void;
};

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/app/lib/api", () => ({
  api: {
    delete: vi.fn(),
  },
}));

vi.mock("@/app/lib/services/s3.service", () => ({
  s3Service: {
    getPresignedURL: vi.fn(),
    uploadToS3: vi.fn(),
  },
}));

vi.mock("@/app/lib/utils/image-hash", () => ({
  getImageDataForHash: vi.fn(),
}));

vi.mock("@/app/(protected)/components/DuplicateUploadModal", () => ({
  default: () => null,
}));

describe("UploadProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getImageDataForHash).mockResolvedValue("image-data");
    vi.mocked(s3Service.getPresignedURL).mockResolvedValue({
      status: "ok",
      url: "https://s3.example.com/upload",
      key: "users/123/photo.jpg",
    });
  });

  it("starts multiple uploads in parallel", async () => {
    const uploadStarts: string[] = [];
    const uploadResolvers: Array<() => void> = [];

    vi.mocked(s3Service.uploadToS3).mockImplementation((_url, file) => {
      uploadStarts.push(file.name);
      return new Promise<void>((resolve) => {
        uploadResolvers.push(resolve);
      });
    });

    let uploadState: UploadState | null = null;

    function CaptureUploadState({
      onReady,
    }: {
      onReady: (state: UploadState) => void;
    }) {
      const state = useUpload();

      useEffect(() => {
        onReady(state);
      }, [onReady, state]);

      return null;
    }

    const handleReady = (state: UploadState) => {
      uploadState = state;
    };

    render(
      <UploadProvider>
        <CaptureUploadState onReady={handleReady} />
      </UploadProvider>,
    );

    await waitFor(() => expect(uploadState).not.toBeNull());

    const firstFile = new File(["a"], "first.jpg", { type: "image/jpeg" });
    const secondFile = new File(["b"], "second.jpg", { type: "image/jpeg" });

    await act(async () => {
      uploadState?.startUpload([firstFile, secondFile]);
    });

    await waitFor(() => expect(uploadStarts).toHaveLength(2));

    const requireState = () => {
      if (!uploadState) {
        throw new Error("Upload state was not captured");
      }
      return uploadState;
    };

    expect(requireState().activeUploads).toBe(2);
    expect(requireState().isUploading).toBe(true);

    uploadResolvers.forEach((resolve) => resolve());

    await waitFor(() => expect(requireState().isUploading).toBe(false));
    expect(requireState().completedFiles).toBe(2);
  });
});
