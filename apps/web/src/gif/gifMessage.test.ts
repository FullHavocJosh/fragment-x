/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect, afterEach } from "vitest";

import SdkConfig from "../SdkConfig";
import { getGifContent, getKlipyAppKey, isKlipyMediaUrl, makeGifMessageContent } from "./gifMessage";

const gif = {
    slug: "hello-1",
    title: "Hello",
    previewUrl: "https://static.klipy.com/sm.webp",
    url: "https://static.klipy.com/md.gif",
    width: 200,
    height: 100,
};

describe("gifMessage", () => {
    afterEach(() => SdkConfig.reset());

    describe("getKlipyAppKey", () => {
        it("needs the flag and a key", () => {
            expect(getKlipyAppKey()).toBeUndefined();
            SdkConfig.put({ fragment_x: { gif_picker: true } } as any);
            expect(getKlipyAppKey()).toBeUndefined();
            SdkConfig.put({ fragment_x: { gif_picker: false, klipy_app_key: "K" } } as any);
            expect(getKlipyAppKey()).toBeUndefined();
            SdkConfig.put({ fragment_x: { gif_picker: true, klipy_app_key: "K" } } as any);
            expect(getKlipyAppKey()).toBe("K");
        });
    });

    describe("isKlipyMediaUrl", () => {
        it("accepts https Klipy media hosts only", () => {
            expect(isKlipyMediaUrl("https://static.klipy.com/a.gif")).toBe(true);
            expect(isKlipyMediaUrl("https://static2.klipy.com/a.gif")).toBe(true);
            expect(isKlipyMediaUrl("http://static.klipy.com/a.gif")).toBe(false);
            expect(isKlipyMediaUrl("https://evil.example/a.gif")).toBe(false);
            expect(isKlipyMediaUrl("https://static.klipy.com.evil.example/a.gif")).toBe(false);
            expect(isKlipyMediaUrl("not a url")).toBe(false);
            expect(isKlipyMediaUrl(undefined)).toBe(false);
        });
    });

    describe("makeGifMessageContent", () => {
        it("is a text message with the url in the body and the gif field", () => {
            const content = makeGifMessageContent(gif, undefined, undefined, "fragment.example");
            expect(content).toEqual({
                "msgtype": "m.text",
                "body": `GIF: ${gif.url}\nOpen fragment.example to see it as an inline GIF.`,
                "fragment_x.gif": { url: gif.url, width: 200, height: 100, title: "Hello" },
            });
            expect(getGifContent(content)).toEqual({ url: gif.url, width: 200, height: 100, title: "Hello" });
        });

        it("keeps a thread relation", () => {
            const content = makeGifMessageContent(
                gif,
                { rel_type: "m.thread", event_id: "$root" },
                undefined,
                "fragment.example",
            );
            expect(content["m.relates_to"]).toEqual({ rel_type: "m.thread", event_id: "$root" });
        });
    });

    describe("getGifContent", () => {
        it("ignores a gif field with a foreign url or bad size", () => {
            expect(
                getGifContent({ "fragment_x.gif": { url: "https://evil.example/a.gif", width: 1, height: 1 } }),
            ).toBe(undefined);
            expect(getGifContent({ "fragment_x.gif": { url: gif.url, width: 0, height: 1 } })).toBeUndefined();
            expect(getGifContent({ body: "hi" })).toBeUndefined();
        });
    });
});
