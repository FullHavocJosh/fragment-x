/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { type MobileRedirectInput, shouldRedirectToMobileGuide } from "./mobileRedirect";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8)";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

const input = (overrides: Partial<MobileRedirectInput> = {}): MobileRedirectInput => ({
    userAgent: IPHONE,
    skipped: false,
    deepLink: false,
    mobileWeb: false,
    ...overrides,
});

describe("shouldRedirectToMobileGuide", () => {
    it.each([IPHONE, ANDROID])("redirects %s", (userAgent) => {
        expect(shouldRedirectToMobileGuide(input({ userAgent }))).toBe(true);
    });

    it("does not redirect a desktop browser", () => {
        expect(shouldRedirectToMobileGuide(input({ userAgent: DESKTOP }))).toBe(false);
    });

    it("does not redirect after the user chose the web app", () => {
        expect(shouldRedirectToMobileGuide(input({ skipped: true }))).toBe(false);
    });

    it("does not redirect a deep link", () => {
        expect(shouldRedirectToMobileGuide(input({ deepLink: true }))).toBe(false);
    });

    it("does not redirect with mobile_web on", () => {
        expect(shouldRedirectToMobileGuide(input({ mobileWeb: true }))).toBe(false);
    });
});
