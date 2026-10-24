/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type PropsWithChildren, useContext, useEffect, useReducer, useState } from "react";
import classNames from "classnames";
import { KnownMembership, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import {
    RoomListItemContextMenu,
    RoomListItemMoreOptionsMenu,
    useCreateAutoDisposedViewModel,
} from "@element-hq/web-shared-components";

import SdkConfig from "../../../SdkConfig";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { SDKContext } from "../../../contexts/SDKContext";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { useEventEmitter, useEventEmitterState } from "../../../hooks/useEventEmitter";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import { MetaSpace, UPDATE_HOME_BEHAVIOUR } from "../../../stores/spaces";
import { RoomListItemViewModel } from "../../../viewmodels/room-list/RoomListItemViewModel";
import { MessagePreviewStore } from "../../../stores/message-preview";
import { DefaultTagID } from "../../../stores/room-list-v3/skip-list/tag";
import DMRoomMap from "../../../utils/DMRoomMap";
import {
    RoomNotificationStateStore,
    UPDATE_STATUS_INDICATOR,
} from "../../../stores/notifications/RoomNotificationStateStore";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";
import { isPinnedRoom } from "../../../utils/room/isPinnedRoom";
import AccessibleButton from "../elements/AccessibleButton";
import RoomAvatar from "../avatars/RoomAvatar";
import { NotificationBadge } from "../rooms/NotificationBadge/NotificationBadge";

/** Whether the Fragment X unified tree (`fragment_x.unified_tree`) is on: rooms are listed under their spaces in the rail. */
export function isUnifiedTree(): boolean {
    return Boolean(SdkConfig.get().fragment_x?.unified_tree);
}

/** Whether the Fragment X Messages entry (`fragment_x.messages_entry`) is on: Home lists only direct messages, with a preview line. */
export function isMessagesEntry(): boolean {
    return isUnifiedTree() && Boolean(SdkConfig.get().fragment_x?.messages_entry);
}

/** Whether the pinned list of Messages is on (`fragment_x.pinned_messages`, with the Messages entry). */
export function isPinnedMessages(): boolean {
    return isMessagesEntry() && Boolean(SdkConfig.get().fragment_x?.pinned_messages);
}

/** Whether a room has unread messages or activity. A muted room does not count. */
export function isUnreadRoom(room: Room): boolean {
    const state = RoomNotificationStateStore.instance.getRoomState(room);
    return state.level !== NotificationLevel.Muted && (state.isUnread || state.hasUnreadCount);
}

/**
 * The direct messages that Messages lists in the rail: the pinned ones first, by name, then the unread ones, newest first,
 * and nothing else (all of them are on the Home page, which a click on Messages opens). The open one is kept while it is
 * read, so the conversation being read does not vanish from the list when it stops being unread.
 */
export function selectMessagesRooms(dms: Room[], openRoomId?: string | null): Room[] {
    const pinned = dms.filter(isPinnedRoom).sort((a, b) => a.name.localeCompare(b.name));
    const unread = dms
        .filter((room) => !isPinnedRoom(room) && isUnreadRoom(room))
        .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp());
    const open = dms.find((room) => room.roomId === openRoomId && !isPinnedRoom(room) && !isUnreadRoom(room));
    return open ? [...pinned, ...unread, open] : [...pinned, ...unread];
}

/** The rooms Messages lists in the rail, kept up to date as conversations become unread or are read, or opened. */
export function useMessagesRooms(dms: Room[], enabled: boolean): Room[] {
    const sdkContext = useContext(SDKContext);
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    useEventEmitter(enabled ? sdkContext.roomNotificationStateStore : undefined, UPDATE_STATUS_INDICATOR, refresh);
    useEventEmitter(enabled ? sdkContext.roomViewStore : undefined, UPDATE_EVENT, refresh);
    return enabled ? selectMessagesRooms(dms, sdkContext.roomViewStore.getRoomId()) : dms;
}

/** Splits the Home rooms into direct messages and the other rooms, which are in no space. */
export function partitionHomeRooms(rooms: Room[]): { dms: Room[]; others: Room[] } {
    const dmMap = DMRoomMap.shared();
    const dms: Room[] = [];
    const others: Room[] = [];
    for (const room of rooms) (dmMap.getUserIdForRoomId(room.roomId) ? dms : others).push(room);
    return { dms, others };
}

/** The text of the latest message of a direct message, kept up to date. Undefined while loading or when there is none. */
function useLastMessage(room: Room, enabled: boolean): string | undefined {
    const [text, setText] = useState<string | undefined>();
    useEffect(() => {
        if (!enabled) return;
        let stale = false;
        const load = (): void => {
            MessagePreviewStore.instance
                .getPreviewForRoom(room, DefaultTagID.DM)
                .then((preview) => {
                    if (!stale) setText(preview?.text);
                })
                .catch((e) => logger.warn(`Could not load the preview of ${room.roomId}`, e));
        };
        load();
        const eventName = MessagePreviewStore.getPreviewChangedEventName(room);
        MessagePreviewStore.instance.on(eventName, load);
        return () => {
            stale = true;
            MessagePreviewStore.instance.off(eventName, load);
        };
    }, [room, enabled]);
    return text;
}

/** The joined rooms of a space for the tree: favourites (pinned) first, then by name. */
export function sortRoomsForTree(rooms: Room[]): Room[] {
    const isFavourite = (room: Room): boolean => Boolean(room.tags?.["m.favourite"]);
    return rooms
        .filter((room) => room.getMyMembership() === KnownMembership.Join)
        .sort((a, b) => Number(isFavourite(b)) - Number(isFavourite(a)) || a.name.localeCompare(b.name));
}

/** The rooms that belong directly to a space, as shown in the tree. */
export function useSpaceRooms(space: Room): Room[] {
    const spaceStore = useContext(SDKContext).spaceStore;
    const cli = useMatrixClientContext();
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    // The space store emits on the space's id when its children change.
    useEventEmitter(spaceStore, space.roomId, refresh);
    useEventEmitter(cli, RoomEvent.Tags, refresh);
    useEventEmitter(cli, RoomEvent.MyMembership, refresh);
    return sortRoomsForTree(spaceStore.getChildRooms(space.roomId));
}

interface RowProps {
    room: Room;
    /** The space (or meta space, such as Home) the room is listed under; it becomes the context when the room is opened. */
    spaceKey: string;
    /** The rail shows icons only: the name is left out (and given as the tooltip). */
    isNarrow?: boolean;
    /** Show the latest message under the name (the Messages entry). */
    showPreview?: boolean;
}

/**
 * Fragment X (`fragment_x.room_context_menu`): Element's room menu for a room in the tree, on right click and on a button
 * that shows on hover (not in the icons only rail, where there is no room for it). The view model is the room list's own.
 */
function RoomRowMenu({ room, isNarrow, children }: PropsWithChildren<{ room: Room; isNarrow?: boolean }>): JSX.Element {
    const client = useMatrixClientContext();
    const vm = useCreateAutoDisposedViewModel(() => new RoomListItemViewModel({ room, client }));
    return (
        <RoomListItemContextMenu vm={vm}>
            <div className="mx_SpaceRoomRow_menuWrapper">
                {children}
                {!isNarrow && (
                    <div className="mx_SpaceRoomRow_menu">
                        <RoomListItemMoreOptionsMenu vm={vm} />
                    </div>
                )}
            </div>
        </RoomListItemContextMenu>
    );
}

/** Fragment X: `fragment_x.unified_frame` is on (one icon size in the bars, rooms half the size of spaces). */
export function isUnifiedFrame(): boolean {
    return Boolean(SdkConfig.get().fragment_x?.unified_frame);
}

/**
 * Fragment X: `fragment_x.rail_tab` is on (with the unified frame): the rail keeps what the user opened and closed, and
 * the selected row is a tab that joins the chat.
 */
export function isRailTab(): boolean {
    return isUnifiedFrame() && Boolean(SdkConfig.get().fragment_x?.rail_tab);
}

/** A room under its space in the rail tree: avatar, name, unread badge. A click opens the room. */
export function SpaceRoomRow({ room, spaceKey, isNarrow, showPreview }: RowProps): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    useEventEmitter(room, RoomEvent.Name, refresh);
    const selected = useEventEmitterState(
        sdkContext.roomViewStore,
        UPDATE_EVENT,
        () => sdkContext.roomViewStore.getRoomId() === room.roomId,
    );
    const notificationState = RoomNotificationStateStore.instance.getRoomState(room);
    const lastMessage = useLastMessage(room, Boolean(showPreview) && !isNarrow);

    const button = (
        <AccessibleButton
            className={classNames("mx_SpaceRoomRow", {
                mx_SpaceRoomRow_selected: selected,
                mx_SpaceRoomRow_narrow: isNarrow,
                mx_SpaceRoomRow_withPreview: showPreview && !isNarrow,
            })}
            title={isNarrow ? room.name : undefined}
            onClick={() => {
                // Keep the space as the context without jumping to its last viewed room, then open this room.
                sdkContext.spaceStore.setActiveSpace(spaceKey, false);
                dis.dispatch<ViewRoomPayload>({
                    action: Action.ViewRoom,
                    show_room_tile: true,
                    room_id: room.roomId,
                    metricsTrigger: undefined,
                });
            }}
        >
            <RoomAvatar room={room} size={isUnifiedFrame() ? "32px" : "24px"} />
            {!isNarrow && (
                <span className="mx_SpaceRoomRow_text">
                    <span className="mx_SpaceRoomRow_name">{room.name}</span>
                    {showPreview && lastMessage && <span className="mx_SpaceRoomRow_preview">{lastMessage}</span>}
                </span>
            )}
            <span className="mx_SpaceRoomRow_badge">
                <NotificationBadge notification={notificationState} />
            </span>
        </AccessibleButton>
    );

    return (
        <li role="treeitem" aria-selected={selected} className="mx_SpaceRoomItem">
            {SdkConfig.get().fragment_x?.room_context_menu ? (
                <RoomRowMenu room={room} isNarrow={isNarrow}>
                    {button}
                </RoomRowMenu>
            ) : (
                button
            )}
        </li>
    );
}

/** The room rows of a space, to be placed inside its tree level list. */
export function SpaceRoomRows({ space, isNarrow }: { space: Room; isNarrow?: boolean }): JSX.Element {
    const rooms = useSpaceRooms(space);
    return (
        <>
            {rooms.map((room) => (
                <SpaceRoomRow key={room.roomId} room={room} spaceKey={space.roomId} isNarrow={isNarrow} />
            ))}
        </>
    );
}

/**
 * The rooms of the Home meta space for the tree: the direct messages and the rooms that are in no space (or every room,
 * with the "show all rooms in Home" setting), pinned first.
 */
export function useHomeRooms(enabled = true): Room[] {
    const spaceStore = useContext(SDKContext).spaceStore;
    const cli = useMatrixClientContext();
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    useEventEmitter(spaceStore, MetaSpace.Home, refresh);
    useEventEmitter(spaceStore, UPDATE_HOME_BEHAVIOUR, refresh);
    useEventEmitter(cli, RoomEvent.Tags, refresh);
    useEventEmitter(cli, RoomEvent.MyMembership, refresh);

    const rooms: Room[] = [];
    if (!enabled) return rooms;
    for (const roomId of spaceStore.getSpaceFilteredRoomIds(MetaSpace.Home)) {
        const room = cli.getRoom(roomId);
        if (room && !room.isSpaceRoom()) rooms.push(room);
    }
    return sortRoomsForTree(rooms);
}

/** The room rows of Home, to be placed inside its tree level list. */
export function HomeRoomRows({
    rooms,
    isNarrow,
    showPreview,
}: {
    rooms: Room[];
    isNarrow?: boolean;
    showPreview?: boolean;
}): JSX.Element {
    return (
        <>
            {rooms.map((room) => (
                <SpaceRoomRow
                    key={room.roomId}
                    room={room}
                    spaceKey={MetaSpace.Home}
                    isNarrow={isNarrow}
                    showPreview={showPreview}
                />
            ))}
        </>
    );
}
