/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useContext, useMemo, useReducer } from "react";
import { KnownMembership } from "matrix-js-sdk/src/types";

import { _t } from "../languageHandler";
import MatrixClientContext from "../contexts/MatrixClientContext";
import { SDKContext } from "../contexts/SDKContext";
import SdkConfig from "../SdkConfig";
import { NotificationLevel } from "../stores/notifications/NotificationLevel";
import { type NotificationState, NotificationStateEvents } from "../stores/notifications/NotificationState";
import { RoomNotificationStateStore } from "../stores/notifications/RoomNotificationStateStore";
import { useTypedEventEmitter } from "./useEventEmitter";

/** What is new in a space: the unread messages and the rooms they are in, and the rooms with only unread activity. */
export interface SpaceUnread {
    /** The unread messages in the rooms that notify. */
    messages: number;
    /** The rooms with unread messages that notify. */
    rooms: number;
    /** The rooms with unread activity and no count. */
    activityRooms: number;
}

/** Adds up the notification states of the rooms of a space. Muted rooms count for nothing. */
export function summariseUnread(states: Pick<NotificationState, "level" | "count">[]): SpaceUnread {
    const unread: SpaceUnread = { messages: 0, rooms: 0, activityRooms: 0 };
    for (const state of states) {
        if (
            state.level >= NotificationLevel.Notification &&
            state.level < NotificationLevel.Unsent &&
            state.count > 0
        ) {
            unread.messages += state.count;
            unread.rooms++;
        } else if (state.level === NotificationLevel.Activity) {
            unread.activityRooms++;
        }
    }
    return unread;
}

/** The line under a server's name, such as "3 new messages in 2 rooms"; undefined when there is nothing new. */
export function unreadSummaryText(unread: SpaceUnread): string | undefined {
    if (unread.messages > 0) {
        return _t("fragment_x|unread_summary", {
            messages: _t("fragment_x|unread_messages", { count: unread.messages }),
            rooms: _t("fragment_x|unread_rooms", { count: unread.rooms }),
        });
    }
    if (unread.activityRooms > 0) {
        return _t("fragment_x|unread_activity", {
            rooms: _t("fragment_x|unread_rooms", { count: unread.activityRooms }),
        });
    }
    return undefined;
}

/** Whether there is anything new in the space. */
export function hasUnread(unread: SpaceUnread | undefined): boolean {
    return Boolean(unread && (unread.rooms > 0 || unread.activityRooms > 0));
}

/**
 * Fragment X (`fragment_x.server_unread`): what is new in a space and its subspaces, from the notification state of each
 * joined room, kept up to date as the space's own notification state changes. Undefined without the option.
 */
export function useSpaceUnread(spaceId?: string, notificationState?: NotificationState): SpaceUnread | undefined {
    const client = useContext(MatrixClientContext);
    const sdkContext = useContext(SDKContext);
    const enabled = Boolean(spaceId) && Boolean(SdkConfig.get().fragment_x?.server_unread);
    const [version, refresh] = useReducer((n: number) => n + 1, 0);
    useTypedEventEmitter(enabled ? notificationState : undefined, NotificationStateEvents.Update, refresh);

    return useMemo(() => {
        if (!enabled || !client) return undefined;
        const states = [...sdkContext.spaceStore.getSpaceFilteredRoomIds(spaceId!, true)]
            .map((roomId) => client.getRoom(roomId))
            .filter((room) => room && !room.isSpaceRoom() && room.getMyMembership() === KnownMembership.Join)
            .map((room) => RoomNotificationStateStore.instance.getRoomState(room!));
        return summariseUnread(states);
        // version: the space's notification state changed
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, client, sdkContext, spaceId, version]);
}
