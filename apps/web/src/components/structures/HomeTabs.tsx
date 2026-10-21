/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useReducer } from "react";
import classNames from "classnames";
import { ClientEvent, type MatrixClient, KnownMembership, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";
import { ChatNewIcon, HelpIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import { _t } from "../../languageHandler";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { type ViewRoomPayload } from "../../dispatcher/payloads/ViewRoomPayload";
import DMRoomMap from "../../utils/DMRoomMap";
import { useEventEmitter } from "../../hooks/useEventEmitter";
import AccessibleButton from "../views/elements/AccessibleButton";
import BaseAvatar from "../views/avatars/BaseAvatar";
import RoomAvatar from "../views/avatars/RoomAvatar";
import { UserTab } from "../views/dialogs/UserTab";

/**
 * Fragment X: the tabs of the Home page top bar, like Discord's Friends page. Only used with the
 * `fragment_x.home_top_bar` config option.
 */
export type HomeTab = "people" | "pending" | "blocked";

const TABS: HomeTab[] = ["people", "pending", "blocked"];

/** Re-renders when the data behind the lists may have changed: direct chats, invites, the ignored user list. */
function useRefreshOnChanges(cli: MatrixClient): void {
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    useEventEmitter(cli, ClientEvent.AccountData, refresh);
    useEventEmitter(cli, ClientEvent.Room, refresh);
    useEventEmitter(cli, RoomEvent.MyMembership, refresh);
}

export interface DirectContact {
    userId: string;
    room: Room;
}

/** The people the user has a direct chat with, one per person, sorted by the name of the chat. */
export function getDirectContacts(): DirectContact[] {
    return Object.entries(DMRoomMap.shared().getUniqueRoomsWithIndividuals())
        .map(([userId, room]) => ({ userId, room }))
        .sort((a, b) => a.room.name.localeCompare(b.room.name));
}

/** The rooms the user has been invited to. */
export function getPendingInvites(cli: MatrixClient): Room[] {
    return cli
        .getRooms()
        .filter((room) => room.getMyMembership() === KnownMembership.Invite)
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** The number of direct contacts, kept current; the Home page shows its welcome content while there are none. */
export function useDirectContactCount(cli: MatrixClient): number {
    useRefreshOnChanges(cli);
    return getDirectContacts().length;
}

const viewRoom = (roomId: string): void => {
    dis.dispatch<ViewRoomPayload>({ action: Action.ViewRoom, room_id: roomId, metricsTrigger: undefined });
};

interface TopBarProps {
    cli: MatrixClient;
    tab: HomeTab;
    onTabChange: (tab: HomeTab) => void;
}

/** The bar over the Home page: the tabs, an Add Friend button, and new group chat and help buttons. */
export function HomeTopBar({ cli, tab, onTabChange }: TopBarProps): JSX.Element {
    useRefreshOnChanges(cli);
    const pendingCount = getPendingInvites(cli).length;
    const label = (t: HomeTab): string =>
        t === "people" ? _t("common|people") : t === "pending" ? _t("fragment_x|pending") : _t("fragment_x|blocked");

    return (
        <header className="mx_HomeTopBar">
            <div className="mx_HomeTopBar_tabs" role="tablist">
                {TABS.map((t) => (
                    <AccessibleButton
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        className={classNames("mx_HomeTopBar_tab", { mx_HomeTopBar_tab_selected: tab === t })}
                        onClick={() => onTabChange(t)}
                    >
                        {label(t)}
                        {t === "pending" && pendingCount > 0 && (
                            <span className="mx_HomeTopBar_badge">{pendingCount}</span>
                        )}
                    </AccessibleButton>
                ))}
                <AccessibleButton
                    className="mx_HomeTopBar_addFriend"
                    onClick={() => dis.dispatch({ action: Action.CreateChat })}
                >
                    {_t("fragment_x|add_friend")}
                </AccessibleButton>
            </div>
            <div className="mx_HomeTopBar_actions">
                <AccessibleButton
                    className="mx_HomeTopBar_action"
                    title={_t("onboarding|create_room")}
                    aria-label={_t("onboarding|create_room")}
                    onClick={() => dis.dispatch({ action: Action.CreateRoom })}
                >
                    <ChatNewIcon />
                </AccessibleButton>
                <AccessibleButton
                    className="mx_HomeTopBar_action"
                    title={_t("common|help")}
                    aria-label={_t("common|help")}
                    onClick={() => dis.dispatch({ action: Action.ViewUserSettings, initialTabId: UserTab.Help })}
                >
                    <HelpIcon />
                </AccessibleButton>
            </div>
        </header>
    );
}

function EmptyTab({ text }: { text: string }): JSX.Element {
    return <p className="mx_HomeTabs_empty">{text}</p>;
}

/** The list of people the user has a direct chat with; a row opens the chat. */
export function PeopleList({ contacts }: { contacts: DirectContact[] }): JSX.Element {
    return (
        <ul className="mx_HomeTabs_list">
            {contacts.map(({ userId, room }) => (
                <li key={userId}>
                    <AccessibleButton className="mx_HomeTabs_row" onClick={() => viewRoom(room.roomId)}>
                        <RoomAvatar room={room} size="36px" />
                        <span className="mx_HomeTabs_name">{room.name}</span>
                        <span className="mx_HomeTabs_detail">{userId}</span>
                    </AccessibleButton>
                </li>
            ))}
        </ul>
    );
}

/** The rooms the user has been invited to; a row opens the invite, where it can be accepted or declined. */
export function PendingList({ cli }: { cli: MatrixClient }): JSX.Element {
    useRefreshOnChanges(cli);
    const invites = getPendingInvites(cli);
    if (invites.length === 0) return <EmptyTab text={_t("fragment_x|no_pending")} />;
    return (
        <ul className="mx_HomeTabs_list">
            {invites.map((room) => (
                <li key={room.roomId}>
                    <AccessibleButton className="mx_HomeTabs_row" onClick={() => viewRoom(room.roomId)}>
                        <RoomAvatar room={room} size="36px" />
                        <span className="mx_HomeTabs_name">{room.name}</span>
                        <span className="mx_HomeTabs_detail">{_t("action|open")}</span>
                    </AccessibleButton>
                </li>
            ))}
        </ul>
    );
}

/** The users the user has ignored, each with an Unblock button. */
export function BlockedList({ cli }: { cli: MatrixClient }): JSX.Element {
    useRefreshOnChanges(cli);
    const ignored = cli.getIgnoredUsers();
    if (ignored.length === 0) return <EmptyTab text={_t("fragment_x|no_blocked")} />;
    return (
        <ul className="mx_HomeTabs_list">
            {ignored.map((userId) => (
                <li key={userId} className="mx_HomeTabs_row mx_HomeTabs_row_static">
                    <BaseAvatar idName={userId} name={userId} size="36px" />
                    <span className="mx_HomeTabs_name">{userId}</span>
                    <AccessibleButton
                        kind="secondary"
                        onClick={() => void cli.setIgnoredUsers(cli.getIgnoredUsers().filter((u) => u !== userId))}
                    >
                        {_t("fragment_x|unblock")}
                    </AccessibleButton>
                </li>
            ))}
        </ul>
    );
}
