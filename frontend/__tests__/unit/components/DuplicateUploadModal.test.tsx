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
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
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
        onResolve={vi.fn()}
      />,
    );

    unmount();

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-url");
    vi.unstubAllGlobals();
  });

  it("ignores low-res data previewSrc and uses blob preview from file", () => {
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
        onResolve={vi.fn()}
      />,
    );

    expect(getByAltText("New photo")).toHaveAttribute("src", "blob:preview-url");
    expect(createObjectURL).toHaveBeenCalledWith(file);

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-url");
    vi.unstubAllGlobals();
  });

  it("keeps the clicked photo", () => {
    const createObjectURL = vi.fn(() => "blob:preview-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    const file = new File(["content"], "new.jpg", { type: "image/jpeg" });
    const onResolve = vi.fn();
    const { getByAltText, unmount } = render(
      <DuplicateUploadModal
        file={file}
        duplicate={{ ...duplicate, thumbnailUrl: "https://example.com/existing.jpg" }}
        previewSrc="data:image/jpeg;base64,abc123"
        onResolve={onResolve}
      />,
    );

    fireEvent.click(getByAltText("Existing photo"));
    fireEvent.click(getByAltText("New photo"));

    expect(onResolve).toHaveBeenNthCalledWith(1, "skip", false);
    expect(onResolve).toHaveBeenNthCalledWith(2, "replace", false);
    unmount();
    vi.unstubAllGlobals();
  });

  it("can apply the chosen action to the rest of files", () => {
    const createObjectURL = vi.fn(() => "blob:preview-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    const file = new File(["content"], "new.jpg", { type: "image/jpeg" });
    const onResolve = vi.fn();
    const { getByLabelText, getByText, unmount } = render(
      <DuplicateUploadModal
        file={file}
        duplicate={duplicate}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(getByLabelText("Do this for the rest of files"));
    fireEvent.click(getByText("Keep both"));

    expect(onResolve).toHaveBeenCalledWith("keepBoth", true);
    unmount();
    vi.unstubAllGlobals();
  });
});
