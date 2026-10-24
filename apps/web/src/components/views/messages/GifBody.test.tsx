// @vitest-environment happy-dom

/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render } from "test-utils-rtl";
import { describe, it, expect } from "vitest";
import { MatrixEvent } from "matrix-js-sdk/src/matrix";

import GifBody from "./GifBody";

function makeEvent(gif: Record<string, unknown>): MatrixEvent {
    return new MatrixEvent({
        type: "m.room.message",
        content: { "msgtype": "m.text", "body": "x", "fragment_x.gif": gif },
    });
}

describe("GifBody", () => {
    it("shows the GIF straight from Klipy, scaled to fit", () => {
        const { container } = render(
            <GifBody
                mxEvent={makeEvent({ url: "https://static.klipy.com/a.gif", width: 640, height: 320, title: "Hi" })}
            />,
        );
        const img = container.querySelector("img")!;
        expect(img.getAttribute("src")).toBe("https://static.klipy.com/a.gif");
        expect(img.getAttribute("alt")).toBe("Hi");
        expect(img.getAttribute("width")).toBe("320");
        expect(img.getAttribute("height")).toBe("160");
    });

    it("shows nothing for a GIF from another host", () => {
        const { container } = render(
            <GifBody mxEvent={makeEvent({ url: "https://evil.example/a.gif", width: 10, height: 10 })} />,
        );
        expect(container.querySelector("img")).toBeNull();
    });
});
