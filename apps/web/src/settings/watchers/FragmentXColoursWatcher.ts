/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SettingsStore from "../SettingsStore";
import SdkConfig from "../../SdkConfig";
import type IWatcher from "./Watcher";

/**
 * Fragment X: the colours a user can choose in Appearance settings (`fragment_x.colour_editor`), on top of the theme.
 * Each is a `#rrggbb` hex colour; a missing one leaves the theme's colour.
 */
export interface FragmentXColours {
    /** Accent: buttons, selected items, links. */
    accent?: string;
    /** The server rail and the user panel. */
    rail?: string;
    /** The room list and other side panels. */
    panels?: string;
}

export const COLOUR_KEYS: (keyof FragmentXColours)[] = ["accent", "rail", "panels"];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColour(value: unknown): value is string {
    return typeof value === "string" && HEX.test(value);
}

/** Mixes the hex colour with another by `amount` (0 to 1 of `other`), returning a `#rrggbb` colour. */
export function mixColours(hex: string, other: string, amount: number): string {
    const channel = (value: string, i: number): number => parseInt(value.slice(1 + i * 2, 3 + i * 2), 16);
    const mixed = [0, 1, 2].map((i) =>
        Math.round(channel(hex, i) * (1 - amount) + channel(other, i) * amount)
            .toString(16)
            .padStart(2, "0"),
    );
    return `#${mixed.join("")}`;
}

/**
 * The CSS that applies the chosen colours as Compound token overrides, or an empty string when there are none. The rule
 * is not in a cascade layer, so it wins over the theme's tokens (which are layered) whatever the order of the style
 * elements.
 */
export function generateColoursCSS(colours: FragmentXColours | null | undefined): string {
    const properties: string[] = [];
    if (isHexColour(colours?.accent)) {
        const accent = colours.accent;
        properties.push(
            `--cpd-color-bg-accent-rest: ${accent};`,
            `--cpd-color-bg-accent-hovered: ${mixColours(accent, "#ffffff", 0.12)};`,
            `--cpd-color-bg-accent-pressed: ${mixColours(accent, "#000000", 0.12)};`,
            `--cpd-color-icon-accent-primary: ${accent};`,
            `--cpd-color-icon-accent-tertiary: ${mixColours(accent, "#ffffff", 0.35)};`,
            `--cpd-color-text-action-accent: ${mixColours(accent, "#ffffff", 0.35)};`,
        );
    }
    if (isHexColour(colours?.rail)) properties.push(`--cpd-color-bg-subtle-primary: ${colours.rail};`);
    if (isHexColour(colours?.panels)) properties.push(`--cpd-color-bg-canvas-default: ${colours.panels};`);
    if (properties.length === 0) return "";
    return `:root, [class*="cpd-theme-"] { ${properties.join(" ")} }`;
}

// Not a `title` attribute: a style sheet with a title is an alternative style sheet, and the browser turns it off when
// another titled sheet (the custom theme's) is the preferred one.
const STYLE_ATTRIBUTE = "data-fragment-x-colours";

/** Puts the CSS for the colours in a style element in the head, or removes the element when there is none. */
export function applyColours(colours: FragmentXColours | null | undefined): void {
    const css = generateColoursCSS(colours);
    let style = document.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`);
    if (!css) {
        style?.remove();
        return;
    }
    if (!style) {
        style = document.createElement("style");
        style.setAttribute(STYLE_ATTRIBUTE, "");
        document.head.appendChild(style);
    }
    style.textContent = css;
}

/** Applies the user's saved colours, and again whenever they change. Does nothing without `fragment_x.colour_editor`. */
export class FragmentXColoursWatcher implements IWatcher {
    private settingRef?: string;

    public start(): void {
        this.update();
        this.settingRef = SettingsStore.watchSetting("FragmentX.colours", null, this.update);
    }

    public stop(): void {
        if (this.settingRef) SettingsStore.unwatchSetting(this.settingRef);
        this.settingRef = undefined;
        applyColours(null);
    }

    private readonly update = (): void => {
        const enabled = Boolean(SdkConfig.get().fragment_x?.colour_editor);
        applyColours(enabled ? SettingsStore.getValue("FragmentX.colours") : null);
    };
}
