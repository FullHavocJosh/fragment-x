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
import { KnownMembership, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { mkStubRoom, stubClient } from "test-utils";

import { BlockedList, getDirectContacts, getPendingInvites, HomeTopBar, PeopleList, PendingList } from "./HomeTabs";
import DMRoomMap from "../../utils/DMRoomMap";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import MatrixClientContext from "../../contexts/MatrixClientContext";

describe("HomeTabs", () => {
    let cli: MatrixClient;
    let dm1: Room;
    let dm2: Room;
    let invited: Room;

    const withClient = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
        <MatrixClientContext.Provider value={cli}>{children}</MatrixClientContext.Provider>
    );

    beforeEach(() => {
        cli = stubClient();
        dm1 = mkStubRoom("!dm1:server", "Zed", cli);
        dm2 = mkStubRoom("!dm2:server", "Amy", cli);
        invited = mkStubRoom("!inv:server", "Invited room", cli);
        vi.mocked(invited.getMyMembership).mockReturnValue(KnownMembership.Invite);
        vi.mocked(cli.getRooms).mockReturnValue([dm1, dm2, invited]);
        DMRoomMap.setShared({
            getUniqueRoomsWithIndividuals: () => ({ "@zed:server": dm1, "@amy:server": dm2 }),
            getUserIdForRoomId: () => undefined,
        } as unknown as DMRoomMap);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("lists direct contacts sorted by name", () => {
        expect(getDirectContacts().map((c) => c.userId)).toEqual(["@amy:server", "@zed:server"]);
    });

    it("lists only rooms the user is invited to", () => {
        expect(getPendingInvites(cli)).toEqual([invited]);
    });

    describe("HomeTopBar", () => {
        it("shows the tabs with the pending count and reports tab changes", async () => {
            const onTabChange = vi.fn();
            render(<HomeTopBar cli={cli} tab="people" onTabChange={onTabChange} />, { wrapper: withClient });

            expect(screen.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");
            expect(screen.getByRole("tab", { name: "Pending 1" })).toHaveAttribute("aria-selected", "false");
            expect(screen.getByRole("tab", { name: "Blocked" })).toBeInTheDocument();

            await userEvent.click(screen.getByRole("tab", { name: "Blocked" }));
            expect(onTabChange).toHaveBeenCalledWith("blocked");
        });

        it("starts a direct chat, a group chat and opens help", async () => {
            const fire = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
            render(<HomeTopBar cli={cli} tab="people" onTabChange={vi.fn()} />, { wrapper: withClient });

            await userEvent.click(screen.getByText("Add Friend"));
            expect(fire).toHaveBeenCalledWith({ action: Action.CreateChat });

            await userEvent.click(screen.getByRole("button", { name: "Create a Group Chat" }));
            expect(fire).toHaveBeenCalledWith({ action: Action.CreateRoom });

            await userEvent.click(screen.getByRole("button", { name: "Help" }));
            expect(fire).toHaveBeenCalledWith(expect.objectContaining({ action: Action.ViewUserSettings }));
        });
    });

    describe("PeopleList", () => {
        it("opens the direct chat of a row", async () => {
            const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
            render(<PeopleList contacts={getDirectContacts()} />, { wrapper: withClient });

            await userEvent.click(screen.getByText("Zed"));
            expect(dispatch).toHaveBeenCalledWith(
                expect.objectContaining({ action: Action.ViewRoom, room_id: "!dm1:server" }),
            );
        });
    });

    describe("PendingList", () => {
        it("lists the invites and opens one", async () => {
            const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
            render(<PendingList cli={cli} />, { wrapper: withClient });

            await userEvent.click(screen.getByText("Invited room"));
            expect(dispatch).toHaveBeenCalledWith(
                expect.objectContaining({ action: Action.ViewRoom, room_id: "!inv:server" }),
            );
        });

        it("shows a message when there are no invites", () => {
            vi.mocked(invited.getMyMembership).mockReturnValue(KnownMembership.Join);
            render(<PendingList cli={cli} />, { wrapper: withClient });
            expect(screen.getByText("No pending invites.")).toBeInTheDocument();
        });
    });

    describe("BlockedList", () => {
        it("lists ignored users and unblocks one, keeping the others", async () => {
            vi.mocked(cli.getIgnoredUsers).mockReturnValue(["@a:server", "@b:server"]);
            render(<BlockedList cli={cli} />, { wrapper: withClient });

            expect(screen.getByText("@a:server")).toBeInTheDocument();
            await userEvent.click(screen.getAllByRole("button", { name: "Unblock" })[0]);
            expect(cli.setIgnoredUsers).toHaveBeenCalledWith(["@b:server"]);
        });

        it("shows a message when nobody is blocked", () => {
            vi.mocked(cli.getIgnoredUsers).mockReturnValue([]);
            render(<BlockedList cli={cli} />, { wrapper: withClient });
            expect(screen.getByText("You have not blocked anyone.")).toBeInTheDocument();
        });
    });
});
