/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect } from "vitest";

import { installAuthedMediaFallback } from "./authedMediaFallback";

describe("installAuthedMediaFallback", () => {
    it("gives a media image its authenticated blob when no service worker controls the page", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
        vi.stubGlobal("fetch", fetchMock);
        URL.createObjectURL = vi.fn().mockReturnValue("blob:made");
        installAuthedMediaFallback(() => "tok");

        const img = new Image();
        img.src = "https://hs.example/_matrix/media/v3/thumbnail/hs.example/inst?width=32&height=32&method=crop";

        await vi.waitFor(() => expect(img.src).toBe("blob:made"));
        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/_matrix/client/v1/media/thumbnail/"), {
            headers: { Authorization: "Bearer tok" },
        });

        const other = new Image();
        other.src = "https://static.klipy.com/a.gif";
        expect(other.src).toBe("https://static.klipy.com/a.gif");
        vi.unstubAllGlobals();
    });
});
