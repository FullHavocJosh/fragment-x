/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type Room } from "matrix-js-sdk/src/matrix";

/** Fragment X pinned messages: a pinned room is a favourite, the same tag as in every other client. */
export function isPinnedRoom(room: Room): boolean {
    return Boolean(room.tags?.["m.favourite"]);
}
