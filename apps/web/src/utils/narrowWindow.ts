/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SdkConfig from "../SdkConfig";
import UIStore from "../stores/UIStore";

/** Below this window width (px) the side panels give way to the chat (`fragment_x.narrow_collapse`). */
export const NARROW_WINDOW_WIDTH = 1100;

/** Whether the option is on and the window is narrower than {@link NARROW_WINDOW_WIDTH}. */
export function isNarrowWindow(width: number = UIStore.instance.windowWidth): boolean {
    return !!SdkConfig.get().fragment_x?.narrow_collapse && width < NARROW_WINDOW_WIDTH;
}
