/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import EventEmitter from "node:events";
import { act, render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { KnownMembership, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { mkStubRoom, stubClient } from "test-utils";

import { HomeRoomRows, isUnifiedTree, SpaceRoomRows, sortRoomsForTree, useHomeRooms } from "./SpaceRoomRows";
import { SDKContext } from "../../../contexts/SDKContext";
import { type SDKContextClass } from "../../../contexts/SDKContextClass";
import MatrixClientContext from "../../../contexts/MatrixClientContext";
import DMRoomMap from "../../../utils/DMRoomMap";
import SdkConfig from "../../../SdkConfig";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { StaticNotificationState } from "../../../stores/notifications/StaticNotificationState";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";
import { MetaSpace, UPDATE_HOME_BEHAVIOUR } from "../../../stores/spaces";

// The room list's own view model needs a real room; the menus only need its snapshot and actions.
const roomItem = vi.hoisted(() => ({
    onMarkAsUnread: vi.fn(),
    onToggleFavorite: vi.fn(),
    onLeaveRoom: vi.fn(),
    onSetRoomNotifState: vi.fn(),
    created: [] as unknown[],
    snapshot: {
        canMarkAsRead: false,
        canMarkAsUnread: true,
        canChangeSection: true,
        isFavourite: false,
        isLowPriority: false,
        canInvite: true,
        canCopyRoomLink: true,
        areSectionsEnabled: false,
        sections: [],
        roomNotifState: "all_messages",
    },
}));

vi.mock("../../../viewmodels/room-list/RoomListItemViewModel", () => ({
    RoomListItemViewModel: class {
        public isDisposed = false;
        public onMarkAsUnread = roomItem.onMarkAsUnread;
        public onToggleFavorite = roomItem.onToggleFavorite;
        public onLeaveRoom = roomItem.onLeaveRoom;
        public onSetRoomNotifState = roomItem.onSetRoomNotifState;
        public constructor(props: unknown) {
            roomItem.created.push(props);
        }

        // The same object every time: a new one on each call would make the subscription loop.
        public getSnapshot(): object {
            return roomItem.snapshot;
        }

        public subscribe(): () => void {
            return () => {};
        }

        public dispose(): void {
            this.isDisposed = true;
        }
    },
}));

describe("SpaceRoomRows", () => {
    let cli: MatrixClient;
    let space: Room;
    let general: Room;
    let announcements: Room;
    let archived: Room;
    let openRoomId: string | null;
    let spaceStore: EventEmitter & {
        getChildRooms: ReturnType<typeof vi.fn>;
        setActiveSpace: ReturnType<typeof vi.fn>;
    };

    const named = (id: string, name: string): Room => {
        const room = mkStubRoom(id, name, cli);
        room.name = name;
        return room;
    };

    const renderRows = (isNarrow = false) =>
        render(
            <MatrixClientContext.Provider value={cli}>
                <SDKContext.Provider
                    value={
                        {
                            spaceStore,
                            roomViewStore: Object.assign(new EventEmitter(), { getRoomId: () => openRoomId }),
                        } as unknown as SDKContextClass
                    }
                >
                    <ul>
                        <SpaceRoomRows space={space} isNarrow={isNarrow} />
                    </ul>
                </SDKContext.Provider>
            </MatrixClientContext.Provider>,
        );

    beforeEach(() => {
        cli = stubClient();
        DMRoomMap.setShared({ getUserIdForRoomId: () => undefined } as unknown as DMRoomMap);
        space = named("!space:server", "Helios");
        general = named("!general:server", "General");
        announcements = named("!ann:server", "Announcements");
        archived = named("!archived:server", "Archived");
        vi.mocked(archived.getMyMembership).mockReturnValue(KnownMembership.Leave);
        openRoomId = null;
        spaceStore = Object.assign(new EventEmitter(), {
            getChildRooms: vi.fn().mockReturnValue([general, announcements, archived]),
            setActiveSpace: vi.fn(),
        });
        vi.spyOn(RoomNotificationStateStore.instance, "getRoomState").mockReturnValue(
            StaticNotificationState.forSymbol("1", NotificationLevel.Notification) as never,
        );
    });

    afterEach(() => {
        SdkConfig.reset();
        vi.restoreAllMocks();
    });

    it("is on only with the unified_tree option", () => {
        expect(isUnifiedTree()).toBe(false);
        SdkConfig.put({ fragment_x: { unified_tree: true } });
        expect(isUnifiedTree()).toBe(true);
    });

    describe("sortRoomsForTree", () => {
        it("lists joined rooms by name with the favourites (pinned) first, and leaves out other rooms", () => {
            const pinned = named("!pin:server", "Zeta");
            (pinned as unknown as { tags: Record<string, object> }).tags = { "m.favourite": {} };

            expect(sortRoomsForTree([general, pinned, announcements, archived]).map((r) => r.name)).toEqual([
                "Zeta",
                "Announcements",
                "General",
            ]);
        });
    });

    it("renders a row for each joined room of the space, by name", () => {
        renderRows();
        expect(screen.getAllByRole("treeitem").map((row) => row.textContent)).toEqual(
            expect.arrayContaining([expect.stringContaining("Announcements"), expect.stringContaining("General")]),
        );
        expect(screen.queryByText("Archived")).not.toBeInTheDocument();
    });

    it("opens the room on click and keeps the space as the context", async () => {
        const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        renderRows();

        await userEvent.click(screen.getByText("General"));

        expect(spaceStore.setActiveSpace).toHaveBeenCalledWith("!space:server", false);
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ action: Action.ViewRoom, room_id: "!general:server" }),
        );
    });

    it("marks the open room as selected", () => {
        openRoomId = "!general:server";
        renderRows();

        const selected = screen.getAllByRole("treeitem").filter((row) => row.getAttribute("aria-selected") === "true");
        expect(selected).toHaveLength(1);
        expect(selected[0].textContent).toContain("General");
    });

    it("shows no names in a narrow rail but keeps the rooms, with the name as the tooltip", () => {
        renderRows(true);

        expect(screen.queryByText("General")).not.toBeInTheDocument();
        expect(screen.getAllByRole("treeitem")).toHaveLength(2);
        // AccessibleButton gives a title as the accessible name and shows it as a tooltip
        expect(screen.getByRole("button", { name: "General" })).toBeInTheDocument();
    });

    describe("Home", () => {
        let dm: Room;
        let orphan: Room;
        let homeIds: Set<string>;

        const HomeList = (): React.JSX.Element => {
            const rooms = useHomeRooms();
            return (
                <ul>
                    <HomeRoomRows rooms={rooms} />
                </ul>
            );
        };

        const renderHome = () =>
            render(
                <MatrixClientContext.Provider value={cli}>
                    <SDKContext.Provider
                        value={
                            {
                                spaceStore,
                                roomViewStore: Object.assign(new EventEmitter(), { getRoomId: () => null }),
                            } as unknown as SDKContextClass
                        }
                    >
                        <HomeList />
                    </SDKContext.Provider>
                </MatrixClientContext.Provider>,
            );

        beforeEach(() => {
            dm = named("!dm:server", "Dana");
            orphan = named("!orphan:server", "Lobby");
            homeIds = new Set([dm.roomId, orphan.roomId, space.roomId, archived.roomId]);
            Object.assign(spaceStore, { getSpaceFilteredRoomIds: vi.fn(() => homeIds) });
            const known = new Map<string, Room>(
                [dm, orphan, space, archived].map((room) => [room.roomId, room] as [string, Room]),
            );
            vi.spyOn(cli, "getRoom").mockImplementation((id) => (id ? (known.get(id) ?? null) : null));
            vi.mocked(space.isSpaceRoom).mockReturnValue(true);
        });

        it("lists the direct messages and rooms in no space, by name, without spaces or rooms the user left", () => {
            renderHome();
            expect(screen.getAllByRole("treeitem").map((row) => row.textContent)).toEqual([
                expect.stringContaining("Dana"),
                expect.stringContaining("Lobby"),
            ]);
        });

        it("opens a room with Home as the context", async () => {
            const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
            renderHome();

            await userEvent.click(screen.getByText("Dana"));
            expect(spaceStore.setActiveSpace).toHaveBeenCalledWith(MetaSpace.Home, false);
            expect(dispatch).toHaveBeenCalledWith(
                expect.objectContaining({ action: Action.ViewRoom, room_id: "!dm:server" }),
            );
        });

        it("lists the rooms again when Home changes or the show all rooms setting changes", () => {
            renderHome();
            homeIds = new Set([orphan.roomId]);
            act(() => {
                spaceStore.emit(MetaSpace.Home);
            });
            expect(screen.queryByText("Dana")).not.toBeInTheDocument();

            homeIds = new Set([dm.roomId, orphan.roomId]);
            act(() => {
                spaceStore.emit(UPDATE_HOME_BEHAVIOUR);
            });
            expect(screen.getByText("Dana")).toBeInTheDocument();
        });
    });

    it("lists the rooms again when the space's children change", () => {
        const { rerender } = renderRows();
        spaceStore.getChildRooms.mockReturnValue([general]);
        // the space store emits on the space id when its children change
        spaceStore.emit("!space:server");
        rerender(
            <MatrixClientContext.Provider value={cli}>
                <SDKContext.Provider
                    value={
                        {
                            spaceStore,
                            roomViewStore: Object.assign(new EventEmitter(), { getRoomId: () => null }),
                        } as unknown as SDKContextClass
                    }
                >
                    <ul>
                        <SpaceRoomRows space={space} />
                    </ul>
                </SDKContext.Provider>
            </MatrixClientContext.Provider>,
        );
        expect(screen.queryByText("Announcements")).not.toBeInTheDocument();
        expect(screen.getByText("General")).toBeInTheDocument();
    });

    describe("fragment_x.unified_frame", () => {
        const roomAvatarWidth = (): string | undefined =>
            document
                .querySelector<HTMLElement>(".mx_SpaceRoomRow .mx_BaseAvatar")
                ?.style.getPropertyValue("--cpd-avatar-size");

        it("keeps the room avatar at 24px by default", () => {
            renderRows();
            expect(roomAvatarWidth()).toBe("24px");
        });

        it("makes the room avatar half the size of a space, 16px", () => {
            SdkConfig.put({ fragment_x: { unified_frame: true } });
            renderRows();
            expect(roomAvatarWidth()).toBe("16px");
        });
    });

    describe("fragment_x.room_context_menu", () => {
        const moreOptions = (): HTMLElement[] => screen.queryAllByRole("button", { name: "More Options" });

        beforeEach(() => {
            roomItem.created.length = 0;
            roomItem.onMarkAsUnread.mockClear();
            roomItem.onToggleFavorite.mockClear();
            roomItem.onLeaveRoom.mockClear();
        });

        it("has no room menu without the option", () => {
            renderRows();
            expect(moreOptions()).toHaveLength(0);
            expect(roomItem.created).toHaveLength(0);
        });

        it("gives each room a more options button, made with the room list's view model for that room", () => {
            SdkConfig.put({ fragment_x: { room_context_menu: true } });
            renderRows();

            expect(moreOptions()).toHaveLength(2);
            expect(roomItem.created).toEqual(
                expect.arrayContaining([expect.objectContaining({ room: general, client: cli })]),
            );
        });

        it("has no button in the icons only rail", () => {
            SdkConfig.put({ fragment_x: { room_context_menu: true } });
            renderRows(true);
            expect(moreOptions()).toHaveLength(0);
        });

        it("shows the room actions from the button and runs them", async () => {
            SdkConfig.put({ fragment_x: { room_context_menu: true } });
            renderRows();

            await userEvent.click(moreOptions()[0]);
            expect(await screen.findByRole("menuitem", { name: "Mark as unread" })).toBeInTheDocument();
            expect(screen.getByRole("menuitemcheckbox", { name: "Favourited" })).toBeInTheDocument();

            await userEvent.click(screen.getByRole("menuitem", { name: "Leave room" }));
            expect(roomItem.onLeaveRoom).toHaveBeenCalled();
        });

        it("still opens the room when the row is clicked", async () => {
            SdkConfig.put({ fragment_x: { room_context_menu: true } });
            const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
            renderRows();

            await userEvent.click(screen.getByText("General"));

            expect(dispatch).toHaveBeenCalledWith(
                expect.objectContaining({ action: Action.ViewRoom, room_id: "!general:server" }),
            );
        });
    });
});
