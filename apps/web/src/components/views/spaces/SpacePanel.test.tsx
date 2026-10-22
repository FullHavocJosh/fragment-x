/*
Copyright 2026 Element Creations Ltd.
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
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
import { setHomeTab, useHomeTab } from "../../structures/HomeTabs";
import { Action } from "../../../dispatcher/actions";
import { MessagePreviewStore } from "../../../stores/message-preview";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore";
import { StaticNotificationState } from "../../../stores/notifications/StaticNotificationState";

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
