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
import defaultDispatcher from "../../../../dispatcher/dispatcher";
import { Action } from "../../../../dispatcher/actions";

describe("ThreadsActivityCentre Mentions tab", () => {
    const cli = stubClient();
    cli.supportsThreads = () => true;
    const userId = cli.getSafeUserId();

    const mentioned = new Room("!mentioned:server", cli, userId, {
        pendingEventOrdering: PendingEventOrdering.Detached,
    });
    mentioned.name = "Design";
    mentioned.updateMyMembership("join");

    const renderTAC = () =>
        render(
            <MatrixClientContext.Provider value={cli}>
                <ThreadsActivityCentre />
            </MatrixClientContext.Provider>,
        );

    beforeEach(() => {
        DMRoomMap.setShared({ getUserIdForRoomId: () => undefined } as unknown as DMRoomMap);
        vi.spyOn(cli, "getRooms").mockReturnValue([mentioned]);
        vi.spyOn(RoomNotificationStateStore.instance, "getRoomState").mockReturnValue({
            level: NotificationLevel.Highlight,
            count: 3,
            muted: false,
        } as ReturnType<RoomNotificationStateStore["getRoomState"]>);
    });

    afterEach(() => {
        SdkConfig.reset();
        vi.restoreAllMocks();
    });

    it("has no Mentions tab without the option", async () => {
        renderTAC();
        await userEvent.click(screen.getByRole("button", { name: "Threads" }));
        expect(screen.queryByText("Mentions")).not.toBeInTheDocument();
    });

    it("opens on a Mentions tab listing the rooms with their counts, and opens a room on click", async () => {
        SdkConfig.put({ fragment_x: { inbox_mentions: true } });
        const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        renderTAC();
        await userEvent.click(screen.getByRole("button", { name: "Threads" }));

        expect(screen.getByText("Mentions")).toBeInTheDocument();
        expect(screen.getByText("Design")).toBeInTheDocument();
        expect(screen.getByTestId("mention-count")).toBeInTheDocument();

        await userEvent.click(screen.getByText("Design"));
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ action: Action.ViewRoom, room_id: "!mentioned:server" }),
        );
    });

    it("shows a message when there are no unread mentions", async () => {
        SdkConfig.put({ fragment_x: { inbox_mentions: true } });
        vi.mocked(RoomNotificationStateStore.instance.getRoomState).mockReturnValue({
            level: NotificationLevel.None,
            count: 0,
            muted: false,
        } as ReturnType<RoomNotificationStateStore["getRoomState"]>);
        renderTAC();
        await userEvent.click(screen.getByRole("button", { name: "Threads" }));

        expect(screen.getByText("No unread mentions.")).toBeInTheDocument();
    });

    it("keeps the thread tabs available next to Mentions", async () => {
        SdkConfig.put({ fragment_x: { inbox_mentions: true } });
        renderTAC();
        await userEvent.click(screen.getByRole("button", { name: "Threads" }));

        await userEvent.click(screen.getByText("My threads"));
        expect(screen.getByText("You don't have unread threads you've participated in.")).toBeInTheDocument();
    });
});
