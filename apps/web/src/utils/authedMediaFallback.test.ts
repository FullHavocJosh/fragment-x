/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { vi, describe, it, expect } from "vitest";

import { fetchAuthedMediaBlobUrl, toAuthedMediaUrl } from "./authedMediaFallback";

describe("authedMediaFallback", () => {
    const thumb = "https://hs.example/_matrix/media/v3/thumbnail/hs.example/abc?width=32&height=32&method=crop";

    it("rewrites v3 download and thumbnail urls to the authenticated form", () => {
        expect(toAuthedMediaUrl(thumb)).toBe(
            "https://hs.example/_matrix/client/v1/media/thumbnail/hs.example/abc?width=32&height=32&method=crop",
        );
        expect(toAuthedMediaUrl("https://hs.example/_matrix/media/v3/download/hs.example/abc")).toBe(
            "https://hs.example/_matrix/client/v1/media/download/hs.example/abc",
        );
    });

    it("leaves other urls alone", () => {
        expect(toAuthedMediaUrl("https://static.klipy.com/a.gif")).toBeNull();
        expect(toAuthedMediaUrl("blob:https://x/1")).toBeNull();
    });

    it("fetches with the token and returns a blob url", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
        vi.stubGlobal("fetch", fetchMock);
        URL.createObjectURL = vi.fn().mockReturnValue("blob:made");

        await expect(fetchAuthedMediaBlobUrl(thumb, "tok")).resolves.toBe("blob:made");
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/_matrix/client/v1/media/thumbnail/"), {
            headers: { Authorization: "Bearer tok" },
        });
        // cached: a second call does not fetch again
        await fetchAuthedMediaBlobUrl(thumb, "tok");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        vi.unstubAllGlobals();
    });

    it("resolves null without a token, on a refused response and on a network error", async () => {
        await expect(fetchAuthedMediaBlobUrl(thumb, null)).resolves.toBeNull();

        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
        await expect(fetchAuthedMediaBlobUrl(thumb.replace("abc", "denied"), "tok")).resolves.toBeNull();

        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        await expect(fetchAuthedMediaBlobUrl(thumb.replace("abc", "down"), "tok")).resolves.toBeNull();
        vi.unstubAllGlobals();
    });
});
