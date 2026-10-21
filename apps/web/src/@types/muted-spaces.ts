/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// The content of the muted spaces account data event. In its own file with no imports, because the ambient type
// declarations import it and must not pull the app into every TypeScript project.

/**
 * One muted space: when it was muted, and the notification state (a RoomNotifState value) each of its rooms had before,
 * to put it back on unmute. A room that was already muted is not recorded: the user muted it on purpose and it stays
 * muted.
 */
// Type aliases, not interfaces: account data content must be assignable to Record<string, unknown>.
type MutedSpace = {
    mutedAt: number;
    /** True while the room rules are being written, so an interrupted mute can be seen and finished. */
    pending?: boolean;
    rooms: Record<string, string>;
};

export type MutedSpaces = Record<string, MutedSpace>;
