import { api } from "@/app/lib/api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockResponse = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });

describe("api.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const body = { sample: "body" };

  describe("get", () => {
    it("calls fetch with correct headers and URL", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ ok: true }));
      await api.get("/endpoint");

      expect(fetch).toBeCalledWith(
        "/endpoint",
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("returns data on success", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ ok: true }));
      const result = await api.get("/endpoint");
      expect(result).toEqual({ ok: true });
    });

    it("throws error message on failure", async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ message: "Unauthorized" }, false),
      );
      await expect(api.get("/endpoint")).rejects.toThrow("Unauthorized");
    });

    it("throws fallback message when there's no message in response", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({}, false));
      await expect(api.get("/endpoint")).rejects.toThrow(
        "Something went wrong",
      );
    });
  });

  describe("post", () => {
    it("calls fetch with the correct headers, body and URL", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ ok: true }));
      await api.post("/endpoint", body);
      expect(fetch).toBeCalledWith(
        "/endpoint",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    });

    it("returns data on success", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ ok: true }));
      const result = await api.post("/endpoint", body);
      expect(result).toEqual({ ok: true });
    });

    it("throws error on failure", async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ message: "Invalid" }, false),
      );

      await expect(api.post("/endpoint", body)).rejects.toThrow("Invalid");
    });

    it("throws fallback message when there's no message in response", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({}, false));
      await expect(api.post("/endpoint", { sample: "body" })).rejects.toThrow(
        "Something went wrong",
      );
    });
  });

  describe("put", () => {
    it("calls fetch with correct headers, body and URL", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ ok: true }));
      await api.put("/endpoint/id", body);
      expect(fetch).toBeCalledWith(
        "/endpoint/id",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("returns data on success", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({ ok: true }));
      const result = await api.put("/endpoint/id", body);
      expect(result).toEqual({ ok: true });
    });

    it("throws error on failure", async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ message: "Invalid" }, false),
      );
      await expect(api.put("/endpoint/id", body)).rejects.toThrow("Invalid");
    });

    it("throws fallback message when there's no message in response", async () => {
      mockFetch.mockReturnValueOnce(mockResponse({}, false));
      await expect(api.put("/endpoint/id", body)).rejects.toThrow(
        "Something went wrong",
      );
    });
  });
});
