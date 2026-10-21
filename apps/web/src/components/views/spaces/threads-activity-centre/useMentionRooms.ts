/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useState } from "react";
import { KnownMembership, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { NotificationLevel } from "../../../../stores/notifications/NotificationLevel";
import {
    RoomNotificationStateStore,
    UPDATE_STATUS_INDICATOR,
} from "../../../../stores/notifications/RoomNotificationStateStore";
import { useEventEmitter } from "../../../../hooks/useEventEmitter";

/** A room the user has unread mentions in. */
export interface MentionRoom {
    room: Room;
    /** The number of unread mentions (highlights) in the room. */
    count: number;
}

/**
 * The joined rooms with unread mentions, most recently active first. Spaces and muted rooms are left out: a mention in a
 * muted room is one the user chose not to be told about.
 */
export function getMentionRooms(client: MatrixClient, store = RoomNotificationStateStore.instance): MentionRoom[] {
    const rooms: MentionRoom[] = [];
    for (const room of client.getRooms()) {
        if (room.getMyMembership() !== KnownMembership.Join || room.isSpaceRoom()) continue;
        const state = store.getRoomState(room);
        if (state.level !== NotificationLevel.Highlight || state.muted) continue;
        rooms.push({ room, count: state.count });
    }
    return rooms.sort((a, b) => b.room.getLastActiveTimestamp() - a.room.getLastActiveTimestamp());
}

/** The rooms with unread mentions, kept current as the notification counts change. */
export function useMentionRooms(client: MatrixClient | null, enabled: boolean): MentionRoom[] {
    const compute = useCallback(
        (): MentionRoom[] => (enabled && client ? getMentionRooms(client) : []),
        [client, enabled],
    );
    const [rooms, setRooms] = useState<MentionRoom[]>(compute);
    useEventEmitter(RoomNotificationStateStore.instance, UPDATE_STATUS_INDICATOR, () => setRooms(compute()));
    return rooms;
}
