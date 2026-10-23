/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useWindowWidth } from "./useWindowWidth";
import { isNarrowWindow } from "../utils/narrowWindow";

/** Fragment X (`fragment_x.narrow_collapse`): true while the window is too narrow for both side panels. */
export const useNarrowWindow = (): boolean => isNarrowWindow(useWindowWidth());
