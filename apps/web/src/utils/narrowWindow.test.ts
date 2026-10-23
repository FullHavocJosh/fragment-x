/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect, afterEach } from "vitest";

import { isNarrowWindow, NARROW_WINDOW_WIDTH } from "./narrowWindow";
import SdkConfig from "../SdkConfig";

describe("isNarrowWindow", () => {
    afterEach(() => SdkConfig.reset());

    it("is never true without the option", () => {
        expect(isNarrowWindow(300)).toBe(false);
    });

    it("is true below the width and false from it, with the option", () => {
        SdkConfig.put({ fragment_x: { narrow_collapse: true } });
        expect(isNarrowWindow(NARROW_WINDOW_WIDTH - 1)).toBe(true);
        expect(isNarrowWindow(NARROW_WINDOW_WIDTH)).toBe(false);
    });
});
