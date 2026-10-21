/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useContext, useReducer } from "react";
import classNames from "classnames";
import { KnownMembership, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";

import SdkConfig from "../../../SdkConfig";
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { SDKContext } from "../../../contexts/SDKContext";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { useEventEmitter, useEventEmitterState } from "../../../hooks/useEventEmitter";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore";
import AccessibleButton from "../elements/AccessibleButton";
import RoomAvatar from "../avatars/RoomAvatar";
import { NotificationBadge } from "../rooms/NotificationBadge/NotificationBadge";

/** Whether the Fragment X unified tree (`fragment_x.unified_tree`) is on: rooms are listed under their spaces in the rail. */
export function isUnifiedTree(): boolean {
    return Boolean(SdkConfig.get().fragment_x?.unified_tree);
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
    space: Room;
    /** The rail shows icons only: the name is left out (and given as the tooltip). */
    isNarrow?: boolean;
}

/** A room under its space in the rail tree: avatar, name, unread badge. A click opens the room. */
export function SpaceRoomRow({ room, space, isNarrow }: RowProps): JSX.Element {
    const sdkContext = useContext(SDKContext);
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    useEventEmitter(room, RoomEvent.Name, refresh);
    const selected = useEventEmitterState(
        sdkContext.roomViewStore,
        UPDATE_EVENT,
        () => sdkContext.roomViewStore.getRoomId() === room.roomId,
    );
    const notificationState = RoomNotificationStateStore.instance.getRoomState(room);

    return (
        <li role="treeitem" aria-selected={selected} className="mx_SpaceRoomItem">
            <AccessibleButton
                className={classNames("mx_SpaceRoomRow", {
                    mx_SpaceRoomRow_selected: selected,
                    mx_SpaceRoomRow_narrow: isNarrow,
                })}
                title={isNarrow ? room.name : undefined}
                onClick={() => {
                    // Keep the space as the context without jumping to its last viewed room, then open this room.
                    sdkContext.spaceStore.setActiveSpace(space.roomId, false);
                    dis.dispatch<ViewRoomPayload>({
                        action: Action.ViewRoom,
                        show_room_tile: true,
                        room_id: room.roomId,
                        metricsTrigger: undefined,
                    });
                }}
            >
                <RoomAvatar room={room} size="24px" />
                {!isNarrow && <span className="mx_SpaceRoomRow_name">{room.name}</span>}
                <span className="mx_SpaceRoomRow_badge">
                    <NotificationBadge notification={notificationState} />
                </span>
            </AccessibleButton>
        </li>
    );
}

/** The room rows of a space, to be placed inside its tree level list. */
export function SpaceRoomRows({ space, isNarrow }: { space: Room; isNarrow?: boolean }): JSX.Element {
    const rooms = useSpaceRooms(space);
    return (
        <>
            {rooms.map((room) => (
                <SpaceRoomRow key={room.roomId} room={room} space={space} isNarrow={isNarrow} />
            ))}
        </>
    );
}
