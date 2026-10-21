/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { stubClient } from "test-utils";
import { PendingEventOrdering, Room } from "matrix-js-sdk/src/matrix";

import { ThreadsActivityCentre } from "./ThreadsActivityCentre";
import { NotificationLevel } from "../../../../stores/notifications/NotificationLevel";
import { RoomNotificationStateStore } from "../../../../stores/notifications/RoomNotificationStateStore";
import MatrixClientContext from "../../../../contexts/MatrixClientContext";
import DMRoomMap from "../../../../utils/DMRoomMap";
import SdkConfig from "../../../../SdkConfig";
import * as notifications from "../../../../utils/notifications";

describe("ThreadsActivityCentre as the inbox (inbox_for_you)", () => {
    const cli = stubClient();
    cli.supportsThreads = () => true;
    const userId = cli.getSafeUserId();

    const mentioned = new Room("!mentioned:server", cli, userId, {
        pendingEventOrdering: PendingEventOrdering.Detached,
    });
    mentioned.name = "Design";
    mentioned.updateMyMembership("join");

    const renderInbox = () =>
        render(
            <MatrixClientContext.Provider value={cli}>
                <ThreadsActivityCentre />
            </MatrixClientContext.Provider>,
        );

    beforeEach(() => {
        SdkConfig.put({ fragment_x: { inbox_for_you: true } });
        DMRoomMap.setShared({ getUserIdForRoomId: () => undefined } as unknown as DMRoomMap);
        vi.spyOn(cli, "getRooms").mockReturnValue([mentioned]);
        vi.spyOn(RoomNotificationStateStore.instance, "getRoomState").mockReturnValue({
            level: NotificationLevel.Highlight,
            count: 2,
            muted: false,
        } as ReturnType<RoomNotificationStateStore["getRoomState"]>);
    });

    afterEach(() => {
        SdkConfig.reset();
        vi.restoreAllMocks();
    });

    it("is called Inbox and opens on a For you tab next to Unread threads", async () => {
        renderInbox();
        expect(screen.getByRole("button", { name: "Inbox" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Threads" })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Inbox" }));
        expect(screen.getByText("For you")).toBeInTheDocument();
        expect(screen.getByText("Unread threads")).toBeInTheDocument();
        expect(screen.queryByText("My threads")).not.toBeInTheDocument();
        expect(screen.queryByText("Mentions")).not.toBeInTheDocument();
    });

    it("lists the rooms the user was mentioned in under For you", async () => {
        renderInbox();
        await userEvent.click(screen.getByRole("button", { name: "Inbox" }));

        expect(screen.getByText("Design")).toBeInTheDocument();
        expect(screen.getByTestId("mention-count")).toBeInTheDocument();
    });

    it("marks the rooms behind the rows read with Mark all read", async () => {
        const clear = vi.spyOn(notifications, "clearRoomNotification").mockResolvedValue({});
        renderInbox();
        await userEvent.click(screen.getByRole("button", { name: "Inbox" }));

        await userEvent.click(screen.getByText("Mark all read"));
        expect(clear).toHaveBeenCalledTimes(1);
        expect(clear).toHaveBeenCalledWith(mentioned, cli);
    });

    it("shows a caught up message, with Mark all read disabled, when there is nothing to follow", async () => {
        vi.mocked(RoomNotificationStateStore.instance.getRoomState).mockReturnValue({
            level: NotificationLevel.None,
            count: 0,
            muted: false,
        } as ReturnType<RoomNotificationStateStore["getRoomState"]>);
        renderInbox();
        await userEvent.click(screen.getByRole("button", { name: "Inbox" }));

        expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
        expect(screen.getByText("Mark all read").closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
    });

    it("keeps the Threads name and tabs without the option", async () => {
        SdkConfig.reset();
        renderInbox();
        expect(screen.getByRole("button", { name: "Threads" })).toBeInTheDocument();
    });
});
