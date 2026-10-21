/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, afterEach } from "vitest";

import SettingsStore from "../SettingsStore";
import SdkConfig from "../../SdkConfig";
import {
    applyColours,
    FragmentXColoursWatcher,
    generateColoursCSS,
    isHexColour,
    mixColours,
} from "./FragmentXColoursWatcher";

const style = (): HTMLStyleElement | null => document.head.querySelector("style[data-fragment-x-colours]");

describe("FragmentXColoursWatcher", () => {
    afterEach(() => {
        applyColours(null);
        SdkConfig.reset();
        vi.restoreAllMocks();
    });

    it("accepts only #rrggbb colours", () => {
        expect(isHexColour("#7c6cf0")).toBe(true);
        expect(isHexColour("#7C6CF0")).toBe(true);
        expect(isHexColour("#fff")).toBe(false);
        expect(isHexColour("red")).toBe(false);
        expect(isHexColour("#7c6cf0; color: red")).toBe(false);
        expect(isHexColour(undefined)).toBe(false);
    });

    it("mixes colours", () => {
        expect(mixColours("#000000", "#ffffff", 0.5)).toBe("#808080");
        expect(mixColours("#102030", "#ffffff", 0)).toBe("#102030");
        expect(mixColours("#102030", "#000000", 1)).toBe("#000000");
    });

    describe("generateColoursCSS", () => {
        it("is empty without colours", () => {
            expect(generateColoursCSS(null)).toBe("");
            expect(generateColoursCSS({})).toBe("");
        });

        it("overrides the accent tokens, derived from the chosen colour", () => {
            const css = generateColoursCSS({ accent: "#7c6cf0" });
            expect(css).toContain("--cpd-color-bg-accent-rest: #7c6cf0;");
            expect(css).toContain(`--cpd-color-bg-accent-hovered: ${mixColours("#7c6cf0", "#ffffff", 0.12)};`);
            expect(css).toContain(`--cpd-color-bg-accent-pressed: ${mixColours("#7c6cf0", "#000000", 0.12)};`);
            expect(css).toContain("--cpd-color-icon-accent-primary: #7c6cf0;");
            expect(css).not.toContain("--cpd-color-bg-subtle-primary");
        });

        it("overrides the rail and panel tokens", () => {
            const css = generateColoursCSS({ rail: "#101010", panels: "#202020" });
            expect(css).toContain("--cpd-color-bg-subtle-primary: #101010;");
            expect(css).toContain("--cpd-color-bg-canvas-default: #202020;");
            expect(css).not.toContain("accent");
        });

        it("is not in a cascade layer, so it wins over the theme tokens", () => {
            expect(generateColoursCSS({ accent: "#7c6cf0" })).not.toContain("@layer");
        });

        it("ignores a value that is not a hex colour", () => {
            expect(generateColoursCSS({ accent: "red; } body { display: none", rail: "#zzzzzz" })).toBe("");
        });
    });

    describe("applyColours", () => {
        it("does not give the style element a title, which would make it an alternative style sheet", () => {
            applyColours({ accent: "#7c6cf0" });
            expect(style()?.hasAttribute("title")).toBe(false);
        });

        it("adds one style element, updates it and removes it", () => {
            applyColours({ accent: "#7c6cf0" });
            expect(style()?.textContent).toContain("#7c6cf0");

            applyColours({ accent: "#00ff00" });
            expect(document.head.querySelectorAll("style[data-fragment-x-colours]")).toHaveLength(1);
            expect(style()?.textContent).toContain("#00ff00");

            applyColours(null);
            expect(style()).toBeNull();
        });
    });

    describe("watcher", () => {
        it("applies the saved colours with the option on, and again when the setting changes", () => {
            SdkConfig.put({ fragment_x: { colour_editor: true } });
            vi.spyOn(SettingsStore, "getValue").mockReturnValue({ accent: "#7c6cf0" });
            let onChange: () => void = () => {};
            vi.spyOn(SettingsStore, "watchSetting").mockImplementation((_setting, _room, callback) => {
                onChange = callback as () => void;
                return "ref";
            });
            vi.spyOn(SettingsStore, "unwatchSetting").mockImplementation(() => {});

            const watcher = new FragmentXColoursWatcher();
            watcher.start();
            expect(style()?.textContent).toContain("#7c6cf0");

            vi.spyOn(SettingsStore, "getValue").mockReturnValue({ rail: "#101010" });
            onChange();
            expect(style()?.textContent).toContain("--cpd-color-bg-subtle-primary: #101010;");
            expect(style()?.textContent).not.toContain("accent");

            watcher.stop();
            expect(style()).toBeNull();
            expect(SettingsStore.unwatchSetting).toHaveBeenCalledWith("ref");
        });

        it("does nothing with the option off", () => {
            vi.spyOn(SettingsStore, "getValue").mockReturnValue({ accent: "#7c6cf0" });
            vi.spyOn(SettingsStore, "watchSetting").mockReturnValue("ref");

            new FragmentXColoursWatcher().start();
            expect(style()).toBeNull();
        });
    });
});
