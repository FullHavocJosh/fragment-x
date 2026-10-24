/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect, afterEach, vi } from "vitest";

import { KlipyClient, KlipyError, toGif } from "./KlipyClient";

const media = (name: string): { url: string; width: number; height: number } => ({
    url: `https://static.klipy.com/${name}`,
    width: 200,
    height: 100,
});

const item = {
    slug: "hello-1",
    title: "Hello",
    file: {
        md: { gif: media("md.gif"), webp: media("md.webp") },
        sm: { webp: media("sm.webp") },
    },
};

describe("toGif", () => {
    it("takes the medium gif to send and the small webp to preview", () => {
        expect(toGif(item)).toEqual({
            slug: "hello-1",
            title: "Hello",
            url: "https://static.klipy.com/md.gif",
            previewUrl: "https://static.klipy.com/sm.webp",
            width: 200,
            height: 100,
        });
    });

    it("drops an item with no slug or no usable media", () => {
        expect(toGif({ ...item, slug: undefined })).toBeUndefined();
        expect(toGif({ slug: "x", file: {} })).toBeUndefined();
    });
});

describe("KlipyClient", () => {
    afterEach(() => vi.unstubAllGlobals());

    function stubFetch(body: unknown, ok = true): ReturnType<typeof vi.fn> {
        const fetchMock = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 403, json: async () => body });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    it("searches with the key in the path and returns the gifs in order", async () => {
        const fetchMock = stubFetch({
            result: true,
            data: { data: [item, { ...item, slug: "hello-2" }], has_next: true },
        });
        const page = await new KlipyClient("KEY 1", "customer").search("hi there", 2);

        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe("https://api.klipy.com/api/v1/KEY%201/gifs/search");
        expect(url.searchParams.get("q")).toBe("hi there");
        expect(url.searchParams.get("page")).toBe("2");
        expect(url.searchParams.get("customer_id")).toBe("customer");
        expect(page.gifs.map((gif) => gif.slug)).toEqual(["hello-1", "hello-2"]);
        expect(page.hasNext).toBe(true);
    });

    it("loads trending without a query", async () => {
        const fetchMock = stubFetch({ result: true, data: { data: [item], has_next: false } });
        const page = await new KlipyClient("KEY", "customer").trending();

        expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe("/api/v1/KEY/gifs/trending");
        expect(page.hasNext).toBe(false);
    });

    it("throws a KlipyError on a failed request or an empty result", async () => {
        stubFetch({}, false);
        await expect(new KlipyClient("KEY", "c").trending()).rejects.toBeInstanceOf(KlipyError);
        stubFetch({ result: false });
        await expect(new KlipyClient("KEY", "c").trending()).rejects.toBeInstanceOf(KlipyError);
    });
});
