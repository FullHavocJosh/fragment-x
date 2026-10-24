/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/** The width of the rail with icons only. */
export const RAIL_ICON_WIDTH = 68;
/**
 * The narrowest expanded rail. The names start 58px in, and the row has 14px after them, so this leaves room for about
 * three characters of a name: drag the edge in further than that and the rail collapses to its icons.
 */
export const RAIL_MIN_EXPANDED_WIDTH = 100;
/** The width of the expanded rail until the user drags it. */
export const RAIL_DEFAULT_WIDTH = 272;

const STORAGE_KEY = "mx_fragment_x_rail_width";

/** The width the user dragged the expanded rail to, or null if they never did. */
export function loadRailWidth(): number | null {
    try {
        const width = Number(window.localStorage.getItem(STORAGE_KEY));
        return Number.isFinite(width) && width >= RAIL_MIN_EXPANDED_WIDTH ? width : null;
    } catch {
        return null;
    }
}

export function saveRailWidth(width: number): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
    } catch {
        // the width is a convenience: without storage it lasts until the page reloads
    }
}

export interface RailDrag {
    /** Whether the rail shows icons only. */
    collapsed: boolean;
    /** The width of the expanded rail; the last one when collapsed. */
    width: number;
}

/**
 * Where a drag of the rail's edge puts the rail.
 * @param startWidth the rail's width when the drag began
 * @param dx how far the pointer has moved since then, to the right
 * @param maxWidth the widest the expanded rail may be: the width at which every name is on one line
 */
export function resolveRailDrag(startWidth: number, dx: number, maxWidth: number): RailDrag {
    const raw = startWidth + dx;
    // Close to the icons only rail: it collapses
    if (raw < RAIL_MIN_EXPANDED_WIDTH) return { collapsed: true, width: RAIL_MIN_EXPANDED_WIDTH };
    return { collapsed: false, width: Math.min(raw, Math.max(maxWidth, RAIL_MIN_EXPANDED_WIDTH)) };
}

/**
 * The width at which every name in the rail fits on one line, measured from the rail as it is: the rail's own width, plus
 * how much wider the longest name is than the room it has. Null when the rail shows no names (it is collapsed).
 */
export function measureNeededWidth(rail: HTMLElement): number | null {
    let extra: number | null = null;
    rail.querySelectorAll<HTMLElement>(".mx_SpaceButton_name, .mx_SpaceRoomRow_name").forEach((name) => {
        const shown = name.getBoundingClientRect().width;
        if (shown === 0) return;
        const range = document.createRange();
        range.selectNodeContents(name);
        const natural = range.getBoundingClientRect().width;
        extra = Math.max(extra ?? -Infinity, natural - shown);
    });
    if (extra === null) return null;
    return Math.ceil(rail.getBoundingClientRect().width + (extra as number)) + 1;
}
