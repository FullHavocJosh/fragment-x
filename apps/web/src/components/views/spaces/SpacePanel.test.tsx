/*
Copyright 2026 Element Creations Ltd.
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach, type MockInstance } from "vitest";
import React from "react";
import { render, renderHook, screen, fireEvent, act, cleanup, waitFor, within } from "test-utils-rtl";
import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { mkStubRoom, wrapInMatrixClientContext, wrapInSdkContext, TestSDKContext } from "test-utils";

import { MatrixClientPeg } from "../../../MatrixClientPeg";
import { MetaSpace, type SpaceKey } from "../../../stores/spaces";
import { shouldShowComponent } from "../../../customisations/helpers/UIComponents";
import { UIComponent } from "../../../settings/UIFeature";
import DMRoomMap from "../../../utils/DMRoomMap";
import { type SpaceNotificationState } from "../../../stores/notifications/SpaceNotificationState";
import SettingsStore from "../../../settings/SettingsStore";
import UnwrappedSpacePanel from "./SpacePanel";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import SdkConfig from "../../../SdkConfig";
import UIStore from "../../../stores/UIStore";
import { setHomeTab, useHomeTab } from "../../structures/HomeTabs";
import { Action } from "../../../dispatcher/actions";
import SpaceTreeLevelLayoutStore from "../../../stores/spaces/SpaceTreeLevelLayoutStore";
import { MessagePreviewStore } from "../../../stores/message-preview";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore";
import { StaticNotificationState } from "../../../stores/notifications/StaticNotificationState";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";

// DND test utilities based on
// https://github.com/colinrobertbrooks/react-beautiful-dnd-test-utils/issues/18#issuecomment-1373388693
enum Keys {
    SPACE = 32,
    ARROW_LEFT = 37,
    ARROW_UP = 38,
    ARROW_RIGHT = 39,
    ARROW_DOWN = 40,
}

/* oxlint-disable typescript/prefer-literal-enum-member */
enum DragDirection {
    LEFT = Keys.ARROW_LEFT,
    UP = Keys.ARROW_UP,
    RIGHT = Keys.ARROW_RIGHT,
    DOWN = Keys.ARROW_DOWN,
}
/* oxlint-enable typescript/prefer-literal-enum-member */

// taken from https://github.com/hello-pangea/dnd/blob/main/test/unit/integration/util/controls.ts#L20
const createTransitionEndEvent = (): Event => {
    const event = new Event("transitionend", {
        bubbles: true,
        cancelable: true,
    }) as TransitionEvent;

    // cheating and adding property to event as
    // TransitionEvent constructor does not exist.
    // This is needed because of the following check
    //   https://github.com/atlassian/react-beautiful-dnd/blob/master/src/view/draggable/draggable.jsx#L130
    (event as any).propertyName = "transform";

    return event;
};

const pickUp = async (element: HTMLElement) => {
    fireEvent.keyDown(element, {
        keyCode: Keys.SPACE,
    });
    await screen.findByText(/You have lifted an item/i);

    act(() => {
        vi.runOnlyPendingTimers();
    });
};

const move = async (element: HTMLElement, direction: DragDirection) => {
    fireEvent.keyDown(element, {
        keyCode: direction,
    });
    await screen.findByText(/(You have moved the item | has been combined with)/i);
};

const drop = async (element: HTMLElement) => {
    fireEvent.keyDown(element, {
        keyCode: Keys.SPACE,
    });
    fireEvent(element.parentElement!, createTransitionEndEvent());

    await screen.findByText(/You have dropped the item/i);
};

vi.mock("../../../stores/spaces/SpaceStore", async () => {
    const { EventEmitter } = await vi.importActual<typeof import("events")>("events");
    class MockSpaceStore extends EventEmitter {
        invitedSpaces: SpaceKey[] = [];
        enabledMetaSpaces: MetaSpace[] = [];
        spacePanelSpaces: string[] = [];
        activeSpace: SpaceKey = "!space1";
        getChildSpaces = () => [] as Room[];
        getNotificationState = () => null as SpaceNotificationState | null;
        setActiveSpace = vi.fn();
        moveRootSpace = vi.fn();
        start = vi.fn();
    }
    return { default: MockSpaceStore };
});

// The unified tree adds the user panel, which needs the call store; it has its own tests.
vi.mock("./UserPanel", () => ({ default: () => null }));

vi.mock("../../../customisations/helpers/UIComponents", () => ({
    shouldShowComponent: vi.fn(),
}));

describe("<SpacePanel />", () => {
    const mockClient = {
        getUserId: vi.fn().mockReturnValue("@test:test"),
        getSafeUserId: vi.fn().mockReturnValue("@test:test"),
        getClientWellKnown: vi.fn(),
        mxcUrlToHttp: vi.fn(),
        getRoom: vi.fn(),
        isGuest: vi.fn(),
        getAccountData: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        removeListener: vi.fn(),
        isVersionSupported: vi.fn().mockResolvedValue(true),
        doesServerSupportUnstableFeature: vi.fn().mockResolvedValue(false),
        getAuthMetadata: vi.fn().mockRejectedValue(new Error("Legacy auth")),
        getSyncState: vi.fn().mockReturnValue("SYNCING"),
    } as unknown as MatrixClient;
    const sdkContext = new TestSDKContext();
    const SpacePanel = wrapInSdkContext(wrapInMatrixClientContext(UnwrappedSpacePanel), sdkContext);

    beforeAll(() => {
        vi.spyOn(MatrixClientPeg, "get").mockReturnValue(mockClient);
        vi.spyOn(MatrixClientPeg, "safeGet").mockReturnValue(mockClient);
        sdkContext._client = mockClient;
    });

    beforeEach(() => {
        sdkContext.spaceStore.enabledMetaSpaces.push(MetaSpace.Home, MetaSpace.Orphans, MetaSpace.VideoRooms);
        vi.mocked(shouldShowComponent).mockClear().mockReturnValue(true);
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("should show all activated MetaSpaces in the correct order", async () => {
        const originalGetValue = SettingsStore.getValue;
        const spySettingsStore = vi.spyOn(SettingsStore, "getValue").mockImplementation((setting) => {
            return setting === "feature_video_rooms" ? true : originalGetValue(setting);
        });
        render(<SpacePanel />);

        // Inspect the order of the rendered MetaSpaces, excluding the "Create a space" button.
        const tree = screen.getByRole("tree", { name: "Spaces" });
        const spaceButtons = within(tree)
            .getAllByRole("treeitem")
            .filter((el) => within(el).queryByRole("button", { name: "Create a space" }) === null);

        const metaSpaceLabels = Array.from(spaceButtons).map((li) =>
            within(li)
                .getByRole("button", { name: /^(?!Options$).*/ }) // filter out the 'options' buttons within the buttons
                .getAttribute("aria-label"),
        );
        expect(metaSpaceLabels).toEqual(["Home", "Other rooms", "Conferences"]);

        spySettingsStore.mockRestore();
    });

    describe("create new space button", () => {
        it("renders create space button when UIComponent.CreateSpaces component should be shown", () => {
            render(<SpacePanel />);
            expect(screen.getByTestId("create-space-button")).toBeVisible();
        });

        it("does not render create space button when UIComponent.CreateSpaces component should not be shown", () => {
            vi.mocked(shouldShowComponent).mockReturnValue(false);
            render(<SpacePanel />);
            expect(shouldShowComponent).toHaveBeenCalledWith(UIComponent.CreateSpaces);
            expect(screen.queryByTestId("create-space-button")).toBeFalsy();
        });

        it("opens context menu on create space button click", () => {
            render(<SpacePanel />);
            fireEvent.click(screen.getByTestId("create-space-button"));
            expect(screen.getByTestId("create-space-button")).toBeVisible();
        });
    });

    describe("fragment_x.narrow_collapse", () => {
        const originalWidth = UIStore.instance.windowWidth;
        let hide: MockInstance | undefined;
        afterEach(() => {
            SdkConfig.reset();
            UIStore.instance.windowWidth = originalWidth;
            hide?.mockRestore();
        });

        it("closes the right panel when the window is narrow", () => {
            SdkConfig.put({ fragment_x: { narrow_collapse: true } });
            UIStore.instance.windowWidth = 800;
            hide = vi.spyOn(sdkContext.rightPanelStore, "hide").mockImplementation(() => {});
            render(<SpacePanel />);
            expect(hide).toHaveBeenCalledWith(null);
        });

        it("leaves the right panel alone in a wide window, and without the option", () => {
            hide = vi.spyOn(sdkContext.rightPanelStore, "hide").mockImplementation(() => {});
            UIStore.instance.windowWidth = 800;
            render(<SpacePanel />);
            cleanup();

            SdkConfig.put({ fragment_x: { narrow_collapse: true } });
            UIStore.instance.windowWidth = 1600;
            render(<SpacePanel />);
            expect(hide).not.toHaveBeenCalled();
        });
    });

    describe("fragment_x.rail_resize", () => {
        const flags = { unified_tree: true, unified_frame: true, rail_resize: true };
        const nav = (): HTMLElement => screen.getByRole("navigation");
        const handle = (): HTMLElement => screen.getByRole("separator");

        beforeEach(() => {
            localStorage.clear();
            SdkConfig.put({ fragment_x: flags });
            // The unified tree lists the rooms of Home: none here
            (sdkContext.spaceStore as any).getSpaceFilteredRoomIds = () => new Set<string>();
            // There is no layout here: the rail is as wide as its class and width say
            vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
                const width = this.classList.contains("mx_SpacePanel")
                    ? this.classList.contains("collapsed")
                        ? 68
                        : parseFloat((this as HTMLElement).style.width) || 272
                    : 0;
                return { width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0 } as DOMRect;
            });
        });
        afterEach(() => {
            SdkConfig.reset();
            vi.mocked(Element.prototype.getBoundingClientRect).mockRestore();
            delete (sdkContext.spaceStore as any).getSpaceFilteredRoomIds;
        });

        it("has a handle on the edge only with the option and the unified tree and frame", () => {
            const { unmount } = render(<SpacePanel />);
            expect(handle()).toBeInTheDocument();
            unmount();

            SdkConfig.put({ fragment_x: { ...flags, rail_resize: false } });
            const second = render(<SpacePanel />);
            expect(screen.queryByRole("separator")).not.toBeInTheDocument();
            second.unmount();

            SdkConfig.put({ fragment_x: { ...flags, unified_frame: false } });
            render(<SpacePanel />);
            expect(screen.queryByRole("separator")).not.toBeInTheDocument();
        });

        it("expands the icons only rail when the handle is dragged out, following the pointer", () => {
            render(<SpacePanel />);
            expect(nav()).toHaveClass("collapsed");

            fireEvent.pointerDown(handle(), { button: 0, clientX: 68, pointerId: 1 });
            fireEvent.pointerMove(handle(), { clientX: 90, pointerId: 1 });
            expect(nav()).toHaveClass("collapsed");

            fireEvent.pointerMove(handle(), { clientX: 200, pointerId: 1 });
            expect(nav()).not.toHaveClass("collapsed");
            expect(nav().style.width).toBe("200px");
            expect(nav()).toHaveClass("mx_SpacePanel_resizing");

            fireEvent.pointerUp(handle(), { pointerId: 1 });
            expect(nav()).not.toHaveClass("mx_SpacePanel_resizing");
            expect(localStorage.getItem("mx_fragment_x_rail_width")).toBe("200");
        });

        it("collapses the rail when the handle is dragged in close to the icons", () => {
            render(<SpacePanel />);
            fireEvent.pointerDown(handle(), { button: 0, clientX: 68, pointerId: 1 });
            fireEvent.pointerMove(handle(), { clientX: 250, pointerId: 1 });
            expect(nav()).not.toHaveClass("collapsed");

            fireEvent.pointerMove(handle(), { clientX: 120, pointerId: 1 });
            expect(nav()).not.toHaveClass("collapsed");
            fireEvent.pointerMove(handle(), { clientX: 150, pointerId: 1 });
            fireEvent.pointerMove(handle(), { clientX: 30, pointerId: 1 });
            expect(nav()).toHaveClass("collapsed");
            fireEvent.pointerUp(handle(), { pointerId: 1 });
        });

        it("changes with the arrow keys and toggles with Enter", () => {
            render(<SpacePanel />);
            fireEvent.keyDown(handle(), { key: "Enter" });
            expect(nav()).not.toHaveClass("collapsed");
            const before = Number(nav().style.width.replace("px", ""));

            fireEvent.keyDown(handle(), { key: "ArrowLeft" });
            const after = Number(nav().style.width.replace("px", ""));
            expect(after).toBeLessThanOrEqual(before);

            fireEvent.keyDown(handle(), { key: "Enter" });
            expect(nav()).toHaveClass("collapsed");
        });

        it("starts at the width the user chose last time", () => {
            localStorage.setItem("mx_fragment_x_rail_width", "180");
            render(<SpacePanel />);
            fireEvent.keyDown(handle(), { key: "Enter" });
            expect(nav().style.width).toBe("180px");
        });
    });

    describe("phone width", () => {
        const nav = (): HTMLElement => screen.getByRole("navigation");
        let matchMedia: typeof window.matchMedia;

        const setPhoneWidth = (matches: boolean): void => {
            window.matchMedia = vi.fn().mockReturnValue({
                matches,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }) as unknown as typeof window.matchMedia;
        };
        const renderExpanded = (): void => {
            SdkConfig.put({ fragment_x: { unified_tree: true, unified_frame: true, rail_resize: true } });
            (sdkContext.spaceStore as any).getSpaceFilteredRoomIds = () => new Set<string>();
            render(<SpacePanel />);
            fireEvent.keyDown(screen.getByRole("separator"), { key: "Enter" });
            expect(nav()).not.toHaveClass("collapsed");
        };

        beforeEach(() => {
            matchMedia = window.matchMedia;
        });
        afterEach(() => {
            window.matchMedia = matchMedia;
            SdkConfig.reset();
            delete (sdkContext.spaceStore as any).getSpaceFilteredRoomIds;
        });

        it("collapses the expanded rail when the page behind it is tapped", () => {
            setPhoneWidth(true);
            renderExpanded();
            fireEvent.pointerDown(document.body);
            expect(nav()).toHaveClass("collapsed");
        });

        it("keeps the rail expanded when it is tapped itself", () => {
            setPhoneWidth(true);
            renderExpanded();
            fireEvent.pointerDown(nav());
            expect(nav()).not.toHaveClass("collapsed");
        });

        it("leaves the expanded rail alone in a wider window", () => {
            setPhoneWidth(false);
            renderExpanded();
            fireEvent.pointerDown(document.body);
            expect(nav()).not.toHaveClass("collapsed");
        });
    });

    describe("fragment_x.servers_entry", () => {
        afterEach(() => {
            SdkConfig.reset();
            act(() => setHomeTab("people"));
        });

        it("has no Servers entry or divider without the option", () => {
            render(<SpacePanel />);
            expect(screen.queryByTestId("servers-entry")).not.toBeInTheDocument();
            expect(screen.queryByRole("separator")).not.toBeInTheDocument();
            expect(screen.getByTestId("create-space-button")).toBeVisible();
        });

        it("shows a Servers entry after a divider in place of the plus button", () => {
            SdkConfig.put({ fragment_x: { servers_entry: true } });
            render(<SpacePanel />);

            expect(screen.getByTestId("servers-entry")).toBeVisible();
            expect(screen.getByRole("separator")).toBeInTheDocument();
            expect(screen.queryByTestId("create-space-button")).not.toBeInTheDocument();
        });

        it("opens Home on the Servers tab when clicked", () => {
            SdkConfig.put({ fragment_x: { servers_entry: true } });
            const fire = vi.spyOn(defaultDispatcher, "fire").mockImplementation(() => {});
            const setActiveSpace = vi.spyOn(sdkContext.spaceStore, "setActiveSpace").mockResolvedValue();
            render(<SpacePanel />);

            fireEvent.click(screen.getByTestId("servers-entry"));

            expect(setActiveSpace).toHaveBeenCalledWith(MetaSpace.Home);
            expect(fire).toHaveBeenCalledWith(Action.ViewHomePage);
            expect(renderHook(() => useHomeTab()).result.current[0]).toBe("servers");
        });
    });

    describe("fragment_x.messages_entry", () => {
        let dm: Room;
        let lobby: Room;

        // A room's avatar is a button with the room's name too, so count only the tree rows.
        const rows = (container: HTMLElement, name: string): HTMLElement[] =>
            within(container)
                .queryAllByRole("button", { name })
                .filter((el) => el.classList.contains("mx_SpaceRoomRow"));

        beforeEach(() => {
            dm = mkStubRoom("!dm:test", "Dana", mockClient);
            dm.name = "Dana";
            lobby = mkStubRoom("!lobby:test", "Lobby", mockClient);
            lobby.name = "Lobby";
            // The outer beforeEach adds the meta spaces on every test; keep one Home so each row shows once.
            sdkContext.spaceStore.enabledMetaSpaces.splice(0, Infinity, MetaSpace.Home);
            const rooms: Record<string, Room> = { [dm.roomId]: dm, [lobby.roomId]: lobby };
            vi.mocked(mockClient.getRoom).mockImplementation((id) => (id ? (rooms[id] ?? null) : null));
            (sdkContext.spaceStore as any).getSpaceFilteredRoomIds = () => new Set([dm.roomId, lobby.roomId]);
            DMRoomMap.setShared({
                getUserIdForRoomId: (id: string) => (id === dm.roomId ? "@dana:test" : undefined),
            } as unknown as DMRoomMap);
            vi.spyOn(MessagePreviewStore.instance, "getPreviewForRoom").mockResolvedValue(null);
            vi.spyOn(RoomNotificationStateStore.instance, "getRoomState").mockReturnValue(
                StaticNotificationState.RED_EXCLAMATION as never,
            );
        });

        afterEach(() => {
            SdkConfig.reset();
            // Only these spies: restoreAllMocks would also drop the MatrixClientPeg ones the other tests rely on.
            vi.mocked(MessagePreviewStore.instance.getPreviewForRoom).mockRestore();
            vi.mocked(RoomNotificationStateStore.instance.getRoomState).mockRestore();
            vi.mocked(mockClient.getRoom).mockReset();
            delete (sdkContext.spaceStore as any).getSpaceFilteredRoomIds;
        });

        it("keeps the Home entry and every room under it without the option", () => {
            SdkConfig.put({ fragment_x: { unified_tree: true } });
            render(<SpacePanel />);

            expect(screen.getAllByLabelText("Home").length).toBeGreaterThan(0);
            expect(screen.queryByLabelText("Messages")).not.toBeInTheDocument();
            // The panel is collapsed here, so a room shows as an icon with its name as the title.
            expect(rows(document.body, "Dana")).toHaveLength(1);
            expect(rows(document.body, "Lobby")).toHaveLength(1);
        });

        it("always lists the conversations under Messages with the unified frame, which has no arrows", () => {
            SpaceTreeLevelLayoutStore.instance.setSpaceCollapsedState(MetaSpace.Home, undefined, true);
            SdkConfig.put({ fragment_x: { unified_tree: true, messages_entry: true, unified_frame: true } });
            render(<SpacePanel />);

            expect(rows(document.body, "Dana")).toHaveLength(1);
            SpaceTreeLevelLayoutStore.instance.setSpaceCollapsedState(MetaSpace.Home, undefined, false);
        });

        it("lists only the pinned and the unread conversations under Messages with pinned_messages, pinned first", () => {
            const mk = (id: string, name: string, pinned: boolean): Room => {
                const room = mkStubRoom(id, name, mockClient);
                room.name = name;
                room.getLastActiveTimestamp = vi.fn().mockReturnValue(1);
                (room as unknown as { tags: Record<string, object> }).tags = pinned ? { "m.favourite": {} } : {};
                return room;
            };
            const pinned = mk("!pin:test", "Pinned Pat", true);
            const unread = mk("!unr:test", "Unread Uma", false);
            const read = mk("!rd:test", "Read Rex", false);
            const rooms: Record<string, Room> = {
                [pinned.roomId]: pinned,
                [unread.roomId]: unread,
                [read.roomId]: read,
            };
            vi.mocked(mockClient.getRoom).mockImplementation((id) => (id ? (rooms[id] ?? null) : null));
            (sdkContext.spaceStore as any).getSpaceFilteredRoomIds = () => new Set(Object.keys(rooms));
            DMRoomMap.setShared({ getUserIdForRoomId: () => "@someone:test" } as unknown as DMRoomMap);
            vi.mocked(RoomNotificationStateStore.instance.getRoomState).mockImplementation(
                (room: Room) =>
                    (room === unread
                        ? StaticNotificationState.forCount(2, NotificationLevel.Notification)
                        : StaticNotificationState.forCount(0, NotificationLevel.None)) as never,
            );
            SdkConfig.put({
                fragment_x: { unified_tree: true, messages_entry: true, pinned_messages: true },
            });
            render(<SpacePanel />);

            // a narrow rail has the name as the accessible label and an open one as text
            const names = [...document.querySelectorAll(".mx_SpaceRoomRow")].map(
                (row) => row.getAttribute("aria-label") ?? row.querySelector(".mx_SpaceRoomRow_name")?.textContent,
            );
            expect(names).toEqual(["Pinned Pat", "Unread Uma"]);
        });

        it("highlights Messages only on its own page, not while a conversation is open", () => {
            SdkConfig.put({ fragment_x: { unified_tree: true, messages_entry: true, unified_frame: true } });
            (sdkContext.spaceStore as any).activeSpace = MetaSpace.Home;
            const getRoomId = vi.spyOn(sdkContext.roomViewStore, "getRoomId");
            const messagesActive = (): boolean =>
                [...document.querySelectorAll(".mx_SpaceButton_active")].some(
                    (button) => button.getAttribute("aria-label") === "Messages",
                );

            getRoomId.mockReturnValue("!dm:test");
            const { unmount } = render(<SpacePanel />);
            expect(messagesActive()).toBe(false);
            unmount();

            getRoomId.mockReturnValue(null);
            render(<SpacePanel />);
            expect(messagesActive()).toBe(true);
            getRoomId.mockRestore();
            (sdkContext.spaceStore as any).activeSpace = "!space1";
        });

        it("shows the Home page on its People tab when Messages is clicked, not the conversation that was open", () => {
            SdkConfig.put({ fragment_x: { unified_tree: true, messages_entry: true } });
            const fire = vi.spyOn(defaultDispatcher, "fire").mockImplementation(() => {});
            const setActiveSpace = vi.spyOn(sdkContext.spaceStore, "setActiveSpace").mockResolvedValue();
            act(() => setHomeTab("servers"));
            render(<SpacePanel />);

            fireEvent.click(screen.getByRole("button", { name: "Messages" }));

            expect(setActiveSpace).toHaveBeenCalledWith(MetaSpace.Home);
            expect(fire).toHaveBeenCalledWith(Action.ViewHomePage);
            expect(renderHook(() => useHomeTab()).result.current[0]).toBe("people");
            act(() => setHomeTab("people"));
        });

        it("calls Home Messages, lists the direct messages under it and the other rooms under Servers", () => {
            SdkConfig.put({ fragment_x: { unified_tree: true, servers_entry: true, messages_entry: true } });
            render(<SpacePanel />);

            expect(screen.getByLabelText("Messages")).toBeInTheDocument();
            expect(screen.queryByLabelText("Home")).not.toBeInTheDocument();
            const messages = screen.getByLabelText("Messages").closest("[role=treeitem]")!;
            expect(rows(messages as HTMLElement, "Dana")).toHaveLength(1);
            expect(rows(messages as HTMLElement, "Lobby")).toHaveLength(0);

            const servers = screen.getByTestId("servers-entry").closest("[role=treeitem]")! as HTMLElement;
            // collapsed hides the rooms under an entry (a narrow rail is not that), so they stay visible in this narrow rail
            expect(servers).not.toHaveClass("collapsed");
            expect(servers).toHaveClass("mx_SpaceItem_narrow");
            expect(within(servers).getByRole("group", { name: "Other rooms" })).toBeInTheDocument();
            expect(rows(servers, "Lobby")).toHaveLength(1);
            expect(rows(servers, "Dana")).toHaveLength(0);
        });
    });

    it("should allow rearranging via drag and drop", async () => {
        (sdkContext.spaceStore.spacePanelSpaces as any) = [
            mkStubRoom("!room1:server", "Room 1", mockClient),
            mkStubRoom("!room2:server", "Room 2", mockClient),
            mkStubRoom("!room3:server", "Room 3", mockClient),
        ];
        DMRoomMap.makeShared(mockClient);
        vi.useFakeTimers({ shouldAdvanceTime: true });

        const { getByLabelText } = render(<SpacePanel />);

        const room1 = getByLabelText("Room 1");
        await pickUp(room1);
        await move(room1, DragDirection.DOWN);
        await drop(room1);

        expect(sdkContext.spaceStore.moveRootSpace).toHaveBeenCalledWith(0, 1);
    });

    it("should be able to open the user menu via dispatcher", async () => {
        const { baseElement } = render(<SpacePanel />);
        defaultDispatcher.dispatch({ action: Action.ToggleUserMenu });
        await waitFor(() => {
            // Menu exists outside the component due to Portals, so select it manually.
            expect(baseElement.querySelector("div[aria-label='User menu']")).toBeInTheDocument();
        });
    });
});
