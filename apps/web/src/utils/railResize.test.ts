// @vitest-environment happy-dom

/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

import {
    loadRailWidth,
    measureNeededWidth,
    RAIL_DEFAULT_WIDTH,
    RAIL_ICON_WIDTH,
    RAIL_MIN_EXPANDED_WIDTH,
    resolveRailDrag,
    saveRailWidth,
} from "./railResize";

describe("resolveRailDrag", () => {
    it("follows the pointer between the narrowest rail and the widest", () => {
        expect(resolveRailDrag(272, -50, 400)).toEqual({ collapsed: false, width: 222 });
        expect(resolveRailDrag(272, 60, 400)).toEqual({ collapsed: false, width: 332 });
    });

    it("stops at the width where every name is on one line", () => {
        expect(resolveRailDrag(272, 300, 340)).toEqual({ collapsed: false, width: 340 });
    });

    it("collapses to the icons when dragged in to within about three characters of them", () => {
        expect(resolveRailDrag(272, -(272 - RAIL_MIN_EXPANDED_WIDTH) - 1, 400).collapsed).toBe(true);
        expect(resolveRailDrag(272, -(272 - RAIL_MIN_EXPANDED_WIDTH), 400)).toEqual({
            collapsed: false,
            width: RAIL_MIN_EXPANDED_WIDTH,
        });
        expect(resolveRailDrag(272, -500, 400).collapsed).toBe(true);
    });

    it("expands out of the icons only rail once the pointer is past the narrowest rail", () => {
        expect(resolveRailDrag(RAIL_ICON_WIDTH, 10, 400).collapsed).toBe(true);
        expect(resolveRailDrag(RAIL_ICON_WIDTH, RAIL_MIN_EXPANDED_WIDTH - RAIL_ICON_WIDTH, 400)).toEqual({
            collapsed: false,
            width: RAIL_MIN_EXPANDED_WIDTH,
        });
        expect(resolveRailDrag(RAIL_ICON_WIDTH, 150, 400)).toEqual({ collapsed: false, width: 218 });
    });

    it("never gives a rail narrower than the narrowest when the names are short", () => {
        expect(resolveRailDrag(272, 0, 20)).toEqual({ collapsed: false, width: RAIL_MIN_EXPANDED_WIDTH });
    });
});

describe("the saved width", () => {
    beforeEach(() => localStorage.clear());

    it("is null until the user drags, then comes back", () => {
        expect(loadRailWidth()).toBeNull();
        saveRailWidth(301.4);
        expect(loadRailWidth()).toBe(301);
    });

    it("ignores a value that is not a usable width", () => {
        localStorage.setItem("mx_fragment_x_rail_width", "12");
        expect(loadRailWidth()).toBeNull();
        localStorage.setItem("mx_fragment_x_rail_width", "wide");
        expect(loadRailWidth()).toBeNull();
    });

    it("has a default that is a usable width", () => {
        expect(RAIL_DEFAULT_WIDTH).toBeGreaterThan(RAIL_MIN_EXPANDED_WIDTH);
    });
});

describe("measureNeededWidth", () => {
    afterEach(() => vi.restoreAllMocks());

    const rail = (railWidth: number, names: Array<{ shown: number; natural: number }>): HTMLElement => {
        const element = document.createElement("nav");
        vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: railWidth } as DOMRect);
        const naturals = new Map<Node, number>();
        names.forEach(({ shown, natural }, i) => {
            const name = document.createElement("span");
            name.className = i % 2 ? "mx_SpaceRoomRow_name" : "mx_SpaceButton_name";
            vi.spyOn(name, "getBoundingClientRect").mockReturnValue({ width: shown } as DOMRect);
            naturals.set(name, natural);
            element.appendChild(name);
        });
        vi.spyOn(document, "createRange").mockImplementation(() => {
            let node: Node | null = null;
            return {
                selectNodeContents: (n: Node) => {
                    node = n;
                },
                getBoundingClientRect: () => ({ width: naturals.get(node!) ?? 0 }) as DOMRect,
            } as unknown as Range;
        });
        return element;
    };

    it("adds how much the longest name is cut off to the rail's width", () => {
        expect(
            measureNeededWidth(
                rail(272, [
                    { shown: 100, natural: 100 },
                    { shown: 90, natural: 130 },
                ]),
            ),
        ).toBe(313);
    });

    it("takes back the room that the names do not need", () => {
        expect(measureNeededWidth(rail(272, [{ shown: 150, natural: 100 }]))).toBe(223);
    });

    it("is null when the rail shows no names", () => {
        expect(measureNeededWidth(rail(68, []))).toBeNull();
        expect(measureNeededWidth(rail(68, [{ shown: 0, natural: 40 }]))).toBeNull();
    });
});
