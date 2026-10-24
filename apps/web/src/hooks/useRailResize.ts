/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    type Dispatch,
    type KeyboardEvent,
    type PointerEvent,
    type RefObject,
    type SetStateAction,
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import {
    loadRailWidth,
    measureNeededWidth,
    RAIL_DEFAULT_WIDTH,
    RAIL_ICON_WIDTH,
    RAIL_MIN_EXPANDED_WIDTH,
    resolveRailDrag,
    saveRailWidth,
} from "../utils/railResize";

/** How far an arrow key moves the edge of the rail. */
const KEY_STEP = 16;

interface RailResize {
    /** The width of the expanded rail. */
    width: number;
    /** Whether the user is dragging the edge. */
    resizing: boolean;
    /** The current width of the rail, for the handle's value. */
    currentWidth: number;
    handleProps: {
        onPointerDown: (ev: PointerEvent<HTMLElement>) => void;
        onPointerMove: (ev: PointerEvent<HTMLElement>) => void;
        onPointerUp: (ev: PointerEvent<HTMLElement>) => void;
        onPointerCancel: (ev: PointerEvent<HTMLElement>) => void;
        onKeyDown: (ev: KeyboardEvent<HTMLElement>) => void;
    };
}

/**
 * The width of the rail, and a handle on its edge that changes it. Dragging in far enough collapses the rail to its icons,
 * dragging out of the icons only rail expands it, and the rail is never wider than its longest name needs.
 */
export function useRailResize(
    rail: RefObject<HTMLElement | null>,
    collapsed: boolean,
    setCollapsed: Dispatch<SetStateAction<boolean>>,
    enabled: boolean,
): RailResize {
    const [width, setWidth] = useState<number>(() => loadRailWidth() ?? RAIL_DEFAULT_WIDTH);
    const [resizing, setResizing] = useState(false);
    const drag = useRef<{ startX: number; startWidth: number } | null>(null);
    const latestWidth = useRef(width);
    latestWidth.current = width;

    // The Expand button brings back the width the user chose, but not wider than the names need
    useLayoutEffect(() => {
        if (!enabled || collapsed || !rail.current) return;
        const needed = measureNeededWidth(rail.current);
        if (needed !== null && latestWidth.current > needed) setWidth(Math.max(needed, RAIL_MIN_EXPANDED_WIDTH));
    }, [enabled, collapsed, rail]);

    const moveTo = useCallback(
        (startWidth: number, dx: number): number | null => {
            const element = rail.current;
            if (!element) return null;
            const needed = collapsed ? null : measureNeededWidth(element);
            const result = resolveRailDrag(startWidth, dx, needed ?? Math.max(latestWidth.current, RAIL_DEFAULT_WIDTH));
            if (result.collapsed !== collapsed) setCollapsed(result.collapsed);
            if (result.collapsed) return null;
            latestWidth.current = result.width;
            setWidth(result.width);
            return result.width;
        },
        [rail, collapsed, setCollapsed],
    );

    const onPointerDown = useCallback(
        (ev: PointerEvent<HTMLElement>): void => {
            if (ev.button !== 0 || !rail.current) return;
            ev.preventDefault();
            ev.currentTarget.setPointerCapture?.(ev.pointerId);
            drag.current = { startX: ev.clientX, startWidth: rail.current.getBoundingClientRect().width };
            setResizing(true);
        },
        [rail],
    );

    const onPointerMove = useCallback(
        (ev: PointerEvent<HTMLElement>): void => {
            if (drag.current) moveTo(drag.current.startWidth, ev.clientX - drag.current.startX);
        },
        [moveTo],
    );

    const endDrag = useCallback((ev: PointerEvent<HTMLElement>): void => {
        if (!drag.current) return;
        drag.current = null;
        ev.currentTarget.releasePointerCapture?.(ev.pointerId);
        setResizing(false);
        saveRailWidth(latestWidth.current);
    }, []);

    const onKeyDown = useCallback(
        (ev: KeyboardEvent<HTMLElement>): void => {
            if (!rail.current) return;
            if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
                const start = rail.current.getBoundingClientRect().width;
                const saved = moveTo(start, ev.key === "ArrowLeft" ? -KEY_STEP : KEY_STEP);
                if (saved !== null) saveRailWidth(saved);
            } else if (ev.key === "Enter" || ev.key === " ") {
                setCollapsed(!collapsed);
            } else {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
        },
        [rail, moveTo, setCollapsed, collapsed],
    );

    return {
        width,
        resizing,
        currentWidth: collapsed ? RAIL_ICON_WIDTH : width,
        handleProps: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onKeyDown },
    };
}
