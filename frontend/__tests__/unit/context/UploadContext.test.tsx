import { render, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import { UploadProvider, useUpload } from "@/app/context/UploadContext";
import { s3Service } from "@/app/lib/services/s3.service";
import { getImageHashData } from "@/app/lib/utils/image-hash";

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

vi.mock("@/app/lib/utils/image-hash", async () => {
  const actual = await vi.importActual<typeof import("@/app/lib/utils/image-hash")>(
    "@/app/lib/utils/image-hash",
  );
  return {
    ...actual,
    getImageHashData: vi.fn(),
  };
});

let duplicateModalProps:
  | {
      onResolve: (
        action: "keepBoth" | "skip" | "replace",
        applyToRest: boolean,
      ) => void;
    }
  | null = null;

vi.mock("@/app/(protected)/components/DuplicateUploadModal", () => ({
  default: (props: {
    onResolve: (
      action: "keepBoth" | "skip" | "replace",
      applyToRest: boolean,
    ) => void;
  }) => {
    duplicateModalProps = props;
    return null;
  },
}));

describe("UploadProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    duplicateModalProps = null;
    vi.mocked(getImageHashData).mockImplementation(async (file) => ({
      imageData: `${file.name}-image-data`,
      perceptualHash: `${file.name}-hash`,
    }));
    vi.mocked(s3Service.getPresignedURL).mockResolvedValue({
      status: "ok",
      url: "https://s3.example.com/upload",
      key: "users/123/photo.jpg",
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("uploads files one at a time", async () => {
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

    await waitFor(() => expect(uploadStarts).toEqual(["first.jpg"]));

    const requireState = () => {
      if (!uploadState) {
        throw new Error("Upload state was not captured");
      }
      return uploadState;
    };

    expect(requireState().activeUploads).toBe(1);
    expect(requireState().isUploading).toBe(true);

    uploadResolvers[0]?.();

    await waitFor(() => expect(uploadStarts).toEqual(["first.jpg", "second.jpg"]));

    expect(requireState().activeUploads).toBe(1);

    uploadResolvers[1]?.();

    await waitFor(() => expect(requireState().isUploading).toBe(false));
    expect(requireState().completedFiles).toBe(2);
  });

  it("pauses the queue when a same-batch duplicate prompt is shown", async () => {
    vi.mocked(getImageHashData)
      .mockResolvedValueOnce({
        imageData: "image-data-1",
        perceptualHash: "d3ff971c0e20a5c3",
      })
      .mockResolvedValueOnce({
        imageData: "image-data-2",
        perceptualHash: "c3ff971c0e22a5c3",
      });

    const uploadStarts: string[] = [];
    vi.mocked(s3Service.uploadToS3).mockImplementation(async (_url, file) => {
      uploadStarts.push(file.name);
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

    render(
      <UploadProvider>
        <CaptureUploadState
          onReady={(state) => {
            uploadState = state;
          }}
        />
      </UploadProvider>,
    );

    await waitFor(() => expect(uploadState).not.toBeNull());

    const firstFile = new File(["a"], "first.jpg", { type: "image/jpeg" });
    const secondFile = new File(["a"], "second.jpg", { type: "image/jpeg" });

    await act(async () => {
      uploadState?.startUpload([firstFile, secondFile]);
    });

    await waitFor(() => expect(duplicateModalProps).not.toBeNull());
    expect(uploadStarts).toEqual([]);

    await act(async () => {
      duplicateModalProps?.onResolve("skip", false);
    });

    await waitFor(() => expect(uploadStarts).toEqual(["first.jpg"]));
    await waitFor(() => expect(uploadState?.completedFiles).toBe(2));
  });

  it("applies duplicate action to the rest when requested", async () => {
    vi.mocked(getImageHashData)
      .mockResolvedValueOnce({
        imageData: "image-data-1",
        perceptualHash: "d3ff971c0e20a5c3",
      })
      .mockResolvedValueOnce({
        imageData: "image-data-2",
        perceptualHash: "c3ff971c0e22a5c3",
      })
      .mockResolvedValueOnce({
        imageData: "image-data-3",
        perceptualHash: "c3ff971c0e22a5c2",
      });

    const uploadStarts: string[] = [];
    vi.mocked(s3Service.uploadToS3).mockImplementation(async (_url, file) => {
      uploadStarts.push(file.name);
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

    render(
      <UploadProvider>
        <CaptureUploadState
          onReady={(state) => {
            uploadState = state;
          }}
        />
      </UploadProvider>,
    );

    await waitFor(() => expect(uploadState).not.toBeNull());

    const firstFile = new File(["a"], "first.jpg", { type: "image/jpeg" });
    const secondFile = new File(["a"], "second.jpg", { type: "image/jpeg" });
    const thirdFile = new File(["a"], "third.jpg", { type: "image/jpeg" });

    await act(async () => {
      uploadState?.startUpload([firstFile, secondFile, thirdFile]);
    });

    await waitFor(() => expect(duplicateModalProps).not.toBeNull());
    const firstModalProps = duplicateModalProps;

    await act(async () => {
      firstModalProps?.onResolve("skip", true);
    });

    await waitFor(() => expect(uploadStarts).toEqual(["first.jpg"]));
    await waitFor(() => expect(uploadState?.completedFiles).toBe(3));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
