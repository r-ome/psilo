import { fireEvent, render } from "@testing-library/react";
import DuplicateUploadModal from "@/app/(protected)/components/DuplicateUploadModal";
import type { DuplicatePhoto } from "@/app/lib/services/s3.service";

vi.mock("@/app/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/app/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

describe("DuplicateUploadModal", () => {
  const duplicate: DuplicatePhoto = {
    id: "dup-1",
    filename: "existing.jpg",
    thumbnailUrl: null,
    s3Key: "users/user-1/photos/existing.jpg",
    distance: 0,
  };

  it("revokes the preview blob url on unmount", () => {
    const createObjectURL = vi.fn(() => "blob:preview-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    const file = new File(["content"], "new.jpg", { type: "image/jpeg" });
    const { unmount } = render(
      <DuplicateUploadModal
        file={file}
        duplicate={duplicate}
        onKeepBoth={vi.fn()}
        onSkip={vi.fn()}
        onReplaceExisting={vi.fn()}
      />,
    );

    unmount();

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-url");
    vi.unstubAllGlobals();
  });

  it("uses provided previewSrc without creating a blob url", () => {
    const createObjectURL = vi.fn(() => "blob:preview-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    const file = new File(["content"], "new.jpg", { type: "image/jpeg" });
    const { getByAltText, unmount } = render(
      <DuplicateUploadModal
        file={file}
        duplicate={duplicate}
        previewSrc="data:image/jpeg;base64,abc123"
        onKeepBoth={vi.fn()}
        onSkip={vi.fn()}
        onReplaceExisting={vi.fn()}
      />,
    );

    expect(getByAltText("New photo")).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,abc123",
    );
    expect(createObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps the clicked photo", () => {
    const file = new File(["content"], "new.jpg", { type: "image/jpeg" });
    const onSkip = vi.fn();
    const onReplaceExisting = vi.fn();
    const { getByAltText } = render(
      <DuplicateUploadModal
        file={file}
        duplicate={{ ...duplicate, thumbnailUrl: "https://example.com/existing.jpg" }}
        previewSrc="data:image/jpeg;base64,abc123"
        onKeepBoth={vi.fn()}
        onSkip={onSkip}
        onReplaceExisting={onReplaceExisting}
      />,
    );

    fireEvent.click(getByAltText("Existing photo"));
    fireEvent.click(getByAltText("New photo"));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onReplaceExisting).toHaveBeenCalledTimes(1);
  });
});
