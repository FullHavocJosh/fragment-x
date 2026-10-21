/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";
import { ClientEvent, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import React from "react";
import { act, fireEvent, getByTestId, render, screen } from "test-utils-rtl";
import { clientAndSDKContextRenderOptions, mkRoom, stubClient } from "test-utils";

import DMRoomMap from "../../../utils/DMRoomMap";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { SpaceItem, SpaceButton } from "./SpaceTreeLevel";
import { MetaSpace, type SpaceKey } from "../../../stores/spaces";
import { StaticNotificationState } from "../../../stores/notifications/StaticNotificationState";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";
import { SDKContextClass } from "../../../contexts/SDKContextClass";
import SdkConfig from "../../../SdkConfig";

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
