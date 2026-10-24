/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { ClientEvent, type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import React from "react";
import { act, fireEvent, getByTestId, render, screen } from "test-utils-rtl";
import { clientAndSDKContextRenderOptions, mkRoom, mkStubRoom, stubClient } from "test-utils";

import DMRoomMap from "../../../utils/DMRoomMap";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { SpaceItem, SpaceButton } from "./SpaceTreeLevel";
import { MetaSpace, type SpaceKey } from "../../../stores/spaces";
import { StaticNotificationState } from "../../../stores/notifications/StaticNotificationState";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore";
import { SDKContextClass } from "../../../contexts/SDKContextClass";
import SdkConfig from "../../../SdkConfig";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";

vi.mock("../../../stores/spaces/SpaceStore", async () => {
    const EventEmitter = (await vi.importActual("events")).EventEmitter as typeof import("events").EventEmitter;
    class MockSpaceStore extends EventEmitter {
        activeSpace: SpaceKey = "!space1";
        setActiveSpace = vi.fn();
        getChildSpaces = vi.fn();
        getNotificationState = vi.fn();
        start = vi.fn();
    }

    return { default: MockSpaceStore };
});

describe("SpaceButton", () => {
    const cli = stubClient();
    const space = mkRoom(cli, "!1:example.org");
    DMRoomMap.makeShared(cli);

    const dispatchSpy = vi.spyOn(defaultDispatcher, "dispatch");

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("real space", () => {
        it("activates the space on click", () => {
            const { container } = render(
                <SpaceButton
                    space={space}
                    selected={false}
                    label="My space"
                    data-testid="create-space-button"
                    size="32px"
                />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );

            expect(SDKContextClass.instance.spaceStore.setActiveSpace).not.toHaveBeenCalled();
            fireEvent.click(getByTestId(container, "create-space-button"));
            expect(SDKContextClass.instance.spaceStore.setActiveSpace).toHaveBeenCalledWith("!1:example.org");
        });

        it("navigates to the space home on click if already active", () => {
            const { container } = render(
                <SpaceButton
                    space={space}
                    selected={true}
                    label="My space"
                    data-testid="create-space-button"
                    size="32px"
                />,
            );

            expect(dispatchSpy).not.toHaveBeenCalled();
            fireEvent.click(getByTestId(container, "create-space-button"));
            expect(dispatchSpy).toHaveBeenCalledWith({ action: Action.ViewRoom, room_id: "!1:example.org" });
        });
    });

    describe("muted indicator (fragment_x.mute_server)", () => {
        const mutedAccountData = (spaceIds: string[]): MatrixEvent =>
            ({
                getType: () => "io.fragmentx.muted_spaces",
                getContent: () => Object.fromEntries(spaceIds.map((id) => [id, { mutedAt: 1, rooms: {} }])),
            }) as unknown as MatrixEvent;

        const renderButton = (): ReturnType<typeof render> =>
            render(
                <SpaceButton space={space} selected={false} label="My space" size="32px" />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );

        beforeEach(() => {
            SdkConfig.put({ fragment_x: { mute_server: true } });
        });

        afterEach(() => {
            SdkConfig.reset();
            vi.mocked(cli.getAccountData).mockReset();
        });

        it("shows the indicator and dims a muted space", () => {
            vi.mocked(cli.getAccountData).mockReturnValue(mutedAccountData(["!1:example.org"]));
            const { container } = renderButton();

            expect(screen.getByRole("img", { name: "Muted" })).toBeInTheDocument();
            expect(container.querySelector(".mx_SpaceButton_muted")).toBeInTheDocument();
        });

        it("shows nothing for a space that is not muted, or another one that is", () => {
            vi.mocked(cli.getAccountData).mockReturnValue(mutedAccountData(["!other:example.org"]));
            const { container } = renderButton();

            expect(screen.queryByRole("img", { name: "Muted" })).not.toBeInTheDocument();
            expect(container.querySelector(".mx_SpaceButton_muted")).not.toBeInTheDocument();
        });

        it("shows nothing without the option", () => {
            SdkConfig.reset();
            vi.mocked(cli.getAccountData).mockReturnValue(mutedAccountData(["!1:example.org"]));
            renderButton();

            expect(screen.queryByRole("img", { name: "Muted" })).not.toBeInTheDocument();
        });

        it("follows the account data as the space is muted and unmuted", () => {
            vi.mocked(cli.getAccountData).mockReturnValue(undefined);
            renderButton();
            expect(screen.queryByRole("img", { name: "Muted" })).not.toBeInTheDocument();

            const muted = mutedAccountData(["!1:example.org"]);
            vi.mocked(cli.getAccountData).mockReturnValue(muted);
            act(() => {
                cli.emit(ClientEvent.AccountData, muted);
            });
            expect(screen.getByRole("img", { name: "Muted" })).toBeInTheDocument();

            const unmuted = mutedAccountData([]);
            vi.mocked(cli.getAccountData).mockReturnValue(unmuted);
            act(() => {
                cli.emit(ClientEvent.AccountData, unmuted);
            });
            expect(screen.queryByRole("img", { name: "Muted" })).not.toBeInTheDocument();
        });
    });

    describe("unread pill and summary (fragment_x.server_unread)", () => {
        let general: ReturnType<typeof mkStubRoom>;
        let ideas: ReturnType<typeof mkStubRoom>;
        let notificationState: StaticNotificationState;
        let getRoomState: ReturnType<typeof vi.spyOn>;

        const renderButton = (
            props: Partial<React.ComponentProps<typeof SpaceButton>> = {},
        ): ReturnType<typeof render> =>
            render(
                <SpaceButton
                    space={space}
                    selected={false}
                    label="My space"
                    size="32px"
                    notificationState={notificationState}
                    {...props}
                />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );

        beforeEach(() => {
            SdkConfig.put({ fragment_x: { server_unread: true } });
            general = mkStubRoom("!general:example.org", "General", cli);
            ideas = mkStubRoom("!ideas:example.org", "Ideas", cli);
            notificationState = new StaticNotificationState(null, 5, NotificationLevel.Notification);
            const rooms: Record<string, typeof general> = { [general.roomId]: general, [ideas.roomId]: ideas };
            vi.spyOn(cli, "getRoom").mockImplementation((id) => (id ? (rooms[id] ?? null) : null));
            Object.assign(SDKContextClass.instance.spaceStore, {
                getSpaceFilteredRoomIds: vi.fn(() => new Set([general.roomId, ideas.roomId])),
            });
            getRoomState = vi
                .spyOn(RoomNotificationStateStore.instance, "getRoomState")
                .mockImplementation(
                    (room: Room) =>
                        (room === general
                            ? StaticNotificationState.forCount(3, NotificationLevel.Notification)
                            : StaticNotificationState.forCount(2, NotificationLevel.Highlight)) as never,
                );
        });

        afterEach(() => {
            SdkConfig.reset();
            getRoomState.mockRestore();
        });

        it("shows a pill and how many new messages are in how many rooms", () => {
            const { container } = renderButton();

            expect(screen.getByText("5 new messages in 2 rooms")).toBeInTheDocument();
            expect(screen.getByText("My space")).toBeInTheDocument();
            expect(container.querySelector(".mx_SpaceButton_unread")).toBeInTheDocument();
        });

        it("leaves out rooms with nothing new and the spaces under the space", () => {
            vi.mocked(ideas.isSpaceRoom).mockReturnValue(true);
            getRoomState.mockImplementation(
                (room: Room) =>
                    (room === general
                        ? StaticNotificationState.forCount(3, NotificationLevel.Notification)
                        : StaticNotificationState.forCount(0, NotificationLevel.None)) as never,
            );
            renderButton();

            expect(screen.getByText("3 new messages in 1 room")).toBeInTheDocument();
        });

        it("shows no pill on a selected server, and no line in a narrow rail", () => {
            const { container, rerender } = renderButton({ selected: true });
            expect(container.querySelector(".mx_SpaceButton_unread")).not.toBeInTheDocument();
            expect(screen.getByText("5 new messages in 2 rooms")).toBeInTheDocument();

            rerender(
                <SpaceButton
                    space={space}
                    selected={false}
                    label="My space"
                    size="32px"
                    isNarrow
                    notificationState={notificationState}
                />,
            );
            expect(container.querySelector(".mx_SpaceButton_unread")).toBeInTheDocument();
            expect(screen.queryByText(/new messages/)).not.toBeInTheDocument();
        });

        it("shows nothing when there is nothing new", () => {
            getRoomState.mockImplementation(() => StaticNotificationState.forCount(0, NotificationLevel.None) as never);
            const { container } = renderButton();

            expect(container.querySelector(".mx_SpaceButton_unread")).not.toBeInTheDocument();
            expect(container.querySelector(".mx_SpaceButton_summary")).not.toBeInTheDocument();
        });

        it("shows nothing without the option", () => {
            SdkConfig.reset();
            const { container } = renderButton();

            expect(container.querySelector(".mx_SpaceButton_unread")).not.toBeInTheDocument();
            expect(screen.queryByText(/new messages/)).not.toBeInTheDocument();
        });
    });

    describe("metaspace", () => {
        it("activates the metaspace on click", () => {
            const { container } = render(
                <SpaceButton
                    spaceKey={MetaSpace.Home}
                    selected={false}
                    label="Home"
                    data-testid="create-space-button"
                    size="32px"
                />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );

            expect(SDKContextClass.instance.spaceStore.setActiveSpace).not.toHaveBeenCalled();
            fireEvent.click(getByTestId(container, "create-space-button"));
            expect(SDKContextClass.instance.spaceStore.setActiveSpace).toHaveBeenCalledWith(MetaSpace.Home);
        });

        it("does nothing on click if already active", () => {
            const { container } = render(
                <SpaceButton
                    spaceKey={MetaSpace.Home}
                    selected={true}
                    label="Home"
                    data-testid="create-space-button"
                    size="32px"
                />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );

            fireEvent.click(getByTestId(container, "create-space-button"));
            expect(dispatchSpy).not.toHaveBeenCalled();
            // Re-activating the metaspace is a no-op
            expect(SDKContextClass.instance.spaceStore.setActiveSpace).toHaveBeenCalledWith(MetaSpace.Home);
        });

        it("should render notificationState if one is provided", () => {
            const notificationState = new StaticNotificationState(null, 8, NotificationLevel.Notification);

            const { container, asFragment } = render(
                <SpaceButton
                    spaceKey={MetaSpace.Home}
                    selected={true}
                    label="Home"
                    data-testid="create-space-button"
                    notificationState={notificationState}
                    size="32px"
                />,
            );

            expect(getByTestId(container, "notification-badge")).toHaveTextContent("8");
            expect(asFragment()).toMatchSnapshot();
        });
    });
});

describe("SpaceItem", () => {
    const cli = stubClient();
    const space = mkRoom(cli, "!1:example.org");
    space.name = "Root Space";
    const subspace = mkRoom(cli, "!2:example.org");
    subspace.name = "Subspace";

    it("should render a space with subspaces", () => {
        vi.mocked(SDKContextClass.instance.spaceStore.getChildSpaces).mockImplementation((spaceId) =>
            spaceId === space.roomId ? [subspace] : [],
        );

        const { asFragment, queryByText, getByLabelText } = render(
            <SpaceItem space={space} activeSpaces={[]} />,
            clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
        );

        expect(queryByText("Root Space")).toBeVisible();
        expect(queryByText("Subspace")).toBeNull();
        expect(asFragment()).toMatchSnapshot();

        fireEvent.click(getByLabelText("Expand"));
        expect(queryByText("Root Space")).toBeVisible();
        expect(queryByText("Subspace")).toBeVisible();
        expect(asFragment()).toMatchSnapshot();
    });

    describe("fragment_x.unified_frame", () => {
        const avatarWidths = (container: HTMLElement): string[] =>
            [...container.querySelectorAll(".mx_SpaceButton .mx_BaseAvatar")].map((avatar) =>
                (avatar as HTMLElement).style.getPropertyValue("--cpd-avatar-size"),
            );

        const renderTree = (): ReturnType<typeof render> => {
            vi.mocked(SDKContextClass.instance.spaceStore.getChildSpaces).mockImplementation((spaceId) =>
                spaceId === space.roomId ? [subspace] : [],
            );
            Object.assign(SDKContextClass.instance.spaceStore, { getChildRooms: vi.fn().mockReturnValue([]) });
            const result = render(
                <SpaceItem space={space} activeSpaces={[]} />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );
            fireEvent.click(result.getByLabelText("Expand"));
            return result;
        };

        beforeEach(() => {
            localStorage.clear();
        });

        afterEach(() => {
            SdkConfig.reset();
        });

        it("makes a subspace smaller than a space by default", () => {
            const { container } = renderTree();
            expect(avatarWidths(container)).toEqual(["32px", "24px"]);
            expect(container.querySelector(".mx_SpaceItem_subspace")).not.toBeInTheDocument();
        });

        it("gives a space and a subspace the same size, and marks the subspace", () => {
            SdkConfig.put({ fragment_x: { unified_frame: true } });
            const { container } = renderTree();

            expect(avatarWidths(container)).toEqual(["32px", "32px"]);
            const marked = container.querySelectorAll(".mx_SpaceItem_subspace");
            expect(marked).toHaveLength(1);
            expect(marked[0]).toHaveTextContent("Subspace");
        });
    });

    describe("highlight of the space that holds the open room (fragment_x.unified_frame)", () => {
        const renderSelected = (): ReturnType<typeof render> => {
            vi.mocked(SDKContextClass.instance.spaceStore.getChildSpaces).mockReturnValue([]);
            Object.assign(SDKContextClass.instance.spaceStore, { getChildRooms: vi.fn().mockReturnValue([]) });
            return render(
                <SpaceItem space={space} activeSpaces={[space.roomId]} />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );
        };
        const viewing = (roomId: string | null): void => {
            vi.spyOn(SDKContextClass.instance.roomViewStore, "getRoomId").mockReturnValue(roomId);
        };

        beforeEach(() => {
            localStorage.clear();
        });

        afterEach(() => {
            SdkConfig.reset();
            vi.restoreAllMocks();
        });

        it("highlights the selected space on its own page, and not while a room in it is open", () => {
            SdkConfig.put({ fragment_x: { unified_frame: true } });
            viewing("!a-room-in-it:example.org");
            const { container, unmount } = renderSelected();
            expect(container.querySelector(".mx_SpaceButton_active")).not.toBeInTheDocument();
            expect(container.querySelector('[role="treeitem"]')).toHaveAttribute("aria-selected", "true");
            unmount();

            viewing(space.roomId);
            const own = renderSelected();
            expect(own.container.querySelector(".mx_SpaceButton_active")).toBeInTheDocument();
        });

        it("follows the open room as it changes", () => {
            SdkConfig.put({ fragment_x: { unified_frame: true } });
            viewing(space.roomId);
            const { container } = renderSelected();
            expect(container.querySelector(".mx_SpaceButton_active")).toBeInTheDocument();

            viewing("!another:example.org");
            act(() => {
                SDKContextClass.instance.roomViewStore.emit(UPDATE_EVENT, SDKContextClass.instance.roomViewStore);
            });
            expect(container.querySelector(".mx_SpaceButton_active")).not.toBeInTheDocument();
        });

        it("highlights the selected space whatever room is open without the option", () => {
            viewing("!a-room-in-it:example.org");
            const { container } = renderSelected();
            expect(container.querySelector(".mx_SpaceButton_active")).toBeInTheDocument();
        });
    });

    describe("opening on selection (fragment_x.unified_frame)", () => {
        const other = mkRoom(cli, "!3:example.org");
        other.name = "Other Space";

        const renderItem = (activeSpaces: string[]): ReturnType<typeof render> => {
            vi.mocked(SDKContextClass.instance.spaceStore.getChildSpaces).mockImplementation((spaceId) =>
                spaceId === space.roomId ? [subspace] : [],
            );
            Object.assign(SDKContextClass.instance.spaceStore, {
                getChildRooms: vi.fn().mockReturnValue([]),
                // the subspace is inside the space
                getKnownParents: vi.fn((id: string) => new Set(id === subspace.roomId ? [space.roomId] : [])),
            });
            return render(
                <SpaceItem space={space} activeSpaces={activeSpaces} />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );
        };
        const isOpen = (): boolean => screen.queryByText("Subspace") !== null;

        beforeEach(() => {
            localStorage.clear();
            SdkConfig.put({ fragment_x: { unified_frame: true } });
        });

        afterEach(() => {
            SdkConfig.reset();
        });

        it("is closed when the selection is elsewhere", () => {
            renderItem([other.roomId]);
            expect(isOpen()).toBe(false);
        });

        it("is open when it is selected, and when a space inside it is", () => {
            const { unmount } = renderItem([space.roomId]);
            expect(isOpen()).toBe(true);
            unmount();

            renderItem([subspace.roomId]);
            expect(isOpen()).toBe(true);
        });

        it("closes when the selected space is selected again, and opens on a third click", () => {
            renderItem([space.roomId]);
            const button = screen.getByRole("button", { name: "Root Space" });

            fireEvent.click(button);
            expect(isOpen()).toBe(false);
            fireEvent.click(button);
            expect(isOpen()).toBe(true);
        });

        it("keeps a choice made by hand only until another space is selected", () => {
            const { rerender } = renderItem([space.roomId]);
            fireEvent.click(screen.getByRole("button", { name: "Root Space" }));
            expect(isOpen()).toBe(false);

            const again = (active: string[]) => rerender(<SpaceItem space={space} activeSpaces={active} />);
            again([other.roomId]);
            expect(isOpen()).toBe(false);
            again([space.roomId]);
            expect(isOpen()).toBe(true);
        });

        it("hides nothing by hand without the option: the arrow still toggles as before", () => {
            SdkConfig.reset();
            renderItem([space.roomId]);
            expect(isOpen()).toBe(false);
            fireEvent.click(screen.getByLabelText("Expand"));
            expect(isOpen()).toBe(true);
        });
    });

    describe("keeping the open and closed spaces (fragment_x.rail_tab)", () => {
        const other = mkRoom(cli, "!3:example.org");
        other.name = "Other Space";

        const renderItem = (activeSpaces: string[]): ReturnType<typeof render> => {
            vi.mocked(SDKContextClass.instance.spaceStore.getChildSpaces).mockImplementation((spaceId) =>
                spaceId === space.roomId ? [subspace] : [],
            );
            Object.assign(SDKContextClass.instance.spaceStore, {
                getChildRooms: vi.fn().mockReturnValue([]),
                getKnownParents: vi.fn((id: string) => new Set(id === subspace.roomId ? [space.roomId] : [])),
            });
            return render(
                <SpaceItem space={space} activeSpaces={activeSpaces} />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );
        };
        const isOpen = (): boolean => screen.queryByText("Subspace") !== null;
        const select = (rerender: ReturnType<typeof render>["rerender"], active: string[]): void =>
            rerender(<SpaceItem space={space} activeSpaces={active} />);

        beforeEach(() => {
            localStorage.clear();
            SdkConfig.put({ fragment_x: { unified_frame: true, rail_tab: true } });
        });

        afterEach(() => {
            SdkConfig.reset();
        });

        it("starts open when the selection is in the space, and closed when it is elsewhere", () => {
            const { unmount } = renderItem([other.roomId]);
            expect(isOpen()).toBe(false);
            unmount();
            localStorage.clear();

            renderItem([space.roomId]);
            expect(isOpen()).toBe(true);
        });

        it("does not close an open space when the selection leaves it", () => {
            const { rerender } = renderItem([space.roomId]);
            expect(isOpen()).toBe(true);

            select(rerender, [other.roomId]);
            expect(isOpen()).toBe(true);
            select(rerender, [MetaSpace.Home]);
            expect(isOpen()).toBe(true);
        });

        it("does not open a closed space when the selection goes elsewhere", () => {
            const { rerender } = renderItem([other.roomId]);
            select(rerender, [MetaSpace.Home]);
            select(rerender, [other.roomId]);
            expect(isOpen()).toBe(false);
        });

        it("opens a closed space that the selection arrives in, so the selected row is in view", () => {
            const { rerender } = renderItem([other.roomId]);
            expect(isOpen()).toBe(false);

            select(rerender, [subspace.roomId]);
            expect(isOpen()).toBe(true);
        });

        it("keeps a space the user closed closed while the selection moves around in it", () => {
            const { rerender } = renderItem([space.roomId]);
            fireEvent.click(screen.getByRole("button", { name: "Root Space" }));
            expect(isOpen()).toBe(false);

            select(rerender, [space.roomId, subspace.roomId]);
            expect(isOpen()).toBe(false);
        });

        it("remembers what the user did across a reload", () => {
            const first = renderItem([space.roomId]);
            fireEvent.click(screen.getByRole("button", { name: "Root Space" }));
            expect(isOpen()).toBe(false);
            first.unmount();

            // a new tree, with the selection in the space: the saved choice wins over the starting rule
            renderItem([space.roomId]);
            expect(isOpen()).toBe(false);
        });
    });

    describe("opening a space in an icons-only rail", () => {
        const renderNarrow = (onExpand: () => void) => {
            vi.mocked(SDKContextClass.instance.spaceStore.getChildSpaces).mockImplementation((spaceId) =>
                spaceId === space.roomId ? [subspace] : [],
            );
            Object.assign(SDKContextClass.instance.spaceStore, { getChildRooms: vi.fn().mockReturnValue([]) });
            return render(
                <SpaceItem space={space} activeSpaces={[]} isPanelCollapsed={true} onExpand={onExpand} />,
                clientAndSDKContextRenderOptions(cli, SDKContextClass.instance),
            );
        };

        beforeEach(() => {
            // a space's open or closed state is remembered in local storage, including by the tests above
            localStorage.clear();
        });

        afterEach(() => {
            SdkConfig.reset();
        });

        it("asks the rail to widen by default", () => {
            const onExpand = vi.fn();
            const { getByLabelText } = renderNarrow(onExpand);

            fireEvent.click(getByLabelText("Expand"));
            expect(onExpand).toHaveBeenCalledOnce();
        });

        it("only opens the space in the unified tree, leaving the rail as it is", () => {
            SdkConfig.put({ fragment_x: { unified_tree: true } });
            const onExpand = vi.fn();
            const { getByLabelText, container } = renderNarrow(onExpand);
            expect(container.querySelector(".mx_SpaceTreeLevel")).toBeNull();

            fireEvent.click(getByLabelText("Expand"));
            expect(onExpand).not.toHaveBeenCalled();
            expect(container.querySelector(".mx_SpaceTreeLevel")).not.toBeNull();
        });
    });
});
