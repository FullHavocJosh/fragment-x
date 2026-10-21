/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MUTED_SPACES_EVENT, getSpaceRooms, muteSpace, reconcileMutedSpaces, unmuteSpace } from "./muteSpace";
import { type MutedSpaces } from "../@types/muted-spaces";
import { RoomNotifState } from "../RoomNotifs";

const mocks = vi.hoisted(() => ({
    states: new Map<string, string | null>(),
    set: vi.fn(),
    spaceRoomIds: vi.fn(),
}));

vi.mock("../contexts/SDKContextClass", () => ({
    SDKContextClass: { instance: { spaceStore: { getSpaceFilteredRoomIds: mocks.spaceRoomIds } } },
}));

vi.mock("../RoomNotifs", () => ({
    RoomNotifState: {
        AllMessagesLoud: "all_messages_loud",
        AllMessages: "all_messages",
        MentionsOnly: "mentions_only",
        Mute: "mute",
    },
    getRoomNotifsState: (_cli: unknown, roomId: string) => mocks.states.get(roomId) ?? null,
    setRoomNotifsState: mocks.set,
}));

describe("muteSpace", () => {
    let accountData: MutedSpaces;
    let rooms: Record<string, Room>;
    let spaceRooms: Record<string, string[]>;
    let cli: MatrixClient;

    const room = (roomId: string, membership = "join", isSpace = false): Room =>
        ({ roomId, isSpaceRoom: () => isSpace, getMyMembership: () => membership }) as unknown as Room;

    beforeEach(() => {
        accountData = {};
        mocks.states.clear();
        mocks.set.mockReset().mockImplementation(async (_cli: unknown, roomId: string, state: string) => {
            mocks.states.set(roomId, state);
        });
        rooms = {
            "!a": room("!a"),
            "!b": room("!b"),
            "!c": room("!c"),
            "!left": room("!left", "leave"),
            "!sub": room("!sub", "join", true),
        };
        spaceRooms = { "!s1": ["!a", "!b", "!left", "!sub"], "!s2": ["!b", "!c"] };
        mocks.spaceRoomIds.mockImplementation((key: string) => new Set(spaceRooms[key] ?? []));
        cli = {
            getRoom: (id: string) => rooms[id] ?? null,
            getAccountData: (type: string) =>
                type === MUTED_SPACES_EVENT ? { getContent: () => accountData } : undefined,
            setAccountData: vi.fn(async (_type: string, content: MutedSpaces) => {
                accountData = content;
                return {};
            }),
        } as unknown as MatrixClient;
    });

    it("lists the joined rooms of a space, not its spaces or rooms left", () => {
        expect(getSpaceRooms(cli, "!s1").map((r) => r.roomId)).toEqual(["!a", "!b"]);
    });

    it("mutes each room and remembers the state it had", async () => {
        mocks.states.set("!a", RoomNotifState.MentionsOnly);
        mocks.states.set("!b", RoomNotifState.AllMessagesLoud);

        expect(await muteSpace(cli, "!s1")).toEqual([]);

        expect(mocks.set).toHaveBeenCalledWith(cli, "!a", RoomNotifState.Mute);
        expect(mocks.set).toHaveBeenCalledWith(cli, "!b", RoomNotifState.Mute);
        expect(accountData).toHaveProperty("!s1");
        expect(accountData["!s1"].rooms).toEqual({
            "!a": RoomNotifState.MentionsOnly,
            "!b": RoomNotifState.AllMessagesLoud,
        });
        expect(accountData["!s1"].pending).toBeUndefined();
    });

    it("treats a room without a rule as all messages", async () => {
        await muteSpace(cli, "!s1");
        expect(accountData["!s1"].rooms["!a"]).toBe(RoomNotifState.AllMessages);
    });

    it("writes the record, pending, before the first rule", async () => {
        const seen: (boolean | undefined)[] = [];
        mocks.set.mockImplementation(async () => {
            seen.push(accountData["!s1"]?.pending);
        });
        await muteSpace(cli, "!s1");
        expect(seen.every((pending) => pending === true)).toBe(true);
    });

    it("does not record a room that was already muted", async () => {
        mocks.states.set("!a", RoomNotifState.Mute);
        await muteSpace(cli, "!s1");

        expect(mocks.set).not.toHaveBeenCalledWith(cli, "!a", RoomNotifState.Mute);
        expect(accountData["!s1"].rooms).not.toHaveProperty("!a");
    });

    it("drops a room whose rule failed and reports it", async () => {
        mocks.set.mockImplementation(async (_cli: unknown, roomId: string) => {
            if (roomId === "!a") throw new Error("429");
        });
        expect(await muteSpace(cli, "!s1")).toEqual(["!a"]);
        expect(Object.keys(accountData["!s1"].rooms)).toEqual(["!b"]);
    });

    it("puts the rooms back and forgets the space on unmute", async () => {
        mocks.states.set("!a", RoomNotifState.MentionsOnly);
        mocks.states.set("!b", RoomNotifState.AllMessagesLoud);
        await muteSpace(cli, "!s1");
        mocks.set.mockClear();

        expect(await unmuteSpace(cli, "!s1")).toEqual([]);

        expect(mocks.set).toHaveBeenCalledWith(cli, "!a", RoomNotifState.MentionsOnly);
        expect(mocks.set).toHaveBeenCalledWith(cli, "!b", RoomNotifState.AllMessagesLoud);
        expect(accountData).toEqual({});
    });

    it("leaves a room the user changed by hand while muted", async () => {
        mocks.states.set("!a", RoomNotifState.MentionsOnly);
        await muteSpace(cli, "!s1");
        mocks.states.set("!a", RoomNotifState.AllMessages);
        mocks.set.mockClear();

        await unmuteSpace(cli, "!s1");

        expect(mocks.set).not.toHaveBeenCalledWith(cli, "!a", expect.anything());
    });

    it("leaves a room that was left", async () => {
        mocks.states.set("!a", RoomNotifState.MentionsOnly);
        await muteSpace(cli, "!s1");
        rooms["!a"] = room("!a", "leave");
        mocks.set.mockClear();

        await unmuteSpace(cli, "!s1");

        expect(mocks.set).not.toHaveBeenCalledWith(cli, "!a", expect.anything());
    });

    it("keeps a room muted while another muted space holds it", async () => {
        mocks.states.set("!b", RoomNotifState.MentionsOnly);
        await muteSpace(cli, "!s1");
        await muteSpace(cli, "!s2");
        expect(accountData["!s2"].rooms).not.toHaveProperty("!b");
        mocks.set.mockClear();

        await unmuteSpace(cli, "!s1");
        expect(mocks.set).not.toHaveBeenCalledWith(cli, "!b", expect.anything());
        expect(accountData["!s2"].rooms["!b"]).toBe(RoomNotifState.MentionsOnly);

        await unmuteSpace(cli, "!s2");
        expect(mocks.set).toHaveBeenCalledWith(cli, "!b", RoomNotifState.MentionsOnly);
        expect(accountData).toEqual({});
    });

    it("does nothing to unmute a space that is not muted", async () => {
        expect(await unmuteSpace(cli, "!s1")).toEqual([]);
        expect(mocks.set).not.toHaveBeenCalled();
        expect(cli.setAccountData).not.toHaveBeenCalled();
    });

    describe("reconcileMutedSpaces", () => {
        const muted = (rec: Partial<MutedSpaces[string]> = {}): MutedSpaces => ({
            "!s1": {
                mutedAt: 1,
                rooms: { "!a": RoomNotifState.MentionsOnly, "!b": RoomNotifState.AllMessages },
                ...rec,
            },
        });

        beforeEach(() => {
            rooms["!s1"] = room("!s1", "join", true);
            rooms["!s2"] = room("!s2", "join", true);
            accountData = muted();
            mocks.states.set("!a", RoomNotifState.Mute);
            mocks.states.set("!b", RoomNotifState.Mute);
            spaceRooms["!s1"] = ["!a", "!b"];
            mocks.set.mockClear();
            vi.mocked(cli.setAccountData).mockClear();
        });

        it("does nothing when every room is as recorded", async () => {
            await reconcileMutedSpaces(cli);
            expect(mocks.set).not.toHaveBeenCalled();
            expect(cli.setAccountData).not.toHaveBeenCalled();
        });

        it("mutes a room that joined the space and remembers its state", async () => {
            rooms["!new"] = room("!new");
            spaceRooms["!s1"] = ["!a", "!b", "!new"];
            mocks.states.set("!new", RoomNotifState.AllMessagesLoud);

            await reconcileMutedSpaces(cli);

            expect(mocks.set).toHaveBeenCalledWith(cli, "!new", RoomNotifState.Mute);
            expect(accountData["!s1"].rooms["!new"]).toBe(RoomNotifState.AllMessagesLoud);
            expect(accountData["!s1"].pending).toBeUndefined();
        });

        it("does not record a new room that is already muted", async () => {
            rooms["!new"] = room("!new");
            spaceRooms["!s1"] = ["!a", "!b", "!new"];
            mocks.states.set("!new", RoomNotifState.Mute);

            await reconcileMutedSpaces(cli);

            expect(accountData["!s1"].rooms).not.toHaveProperty("!new");
            expect(mocks.set).not.toHaveBeenCalled();
        });

        it("restores a room that moved out of the space but is still joined and muted", async () => {
            spaceRooms["!s1"] = ["!b"];

            await reconcileMutedSpaces(cli);

            expect(mocks.set).toHaveBeenCalledWith(cli, "!a", RoomNotifState.MentionsOnly);
            expect(accountData["!s1"].rooms).not.toHaveProperty("!a");
        });

        it("only drops a room that was left", async () => {
            rooms["!a"] = room("!a", "leave");
            spaceRooms["!s1"] = ["!b"];

            await reconcileMutedSpaces(cli);

            expect(mocks.set).not.toHaveBeenCalled();
            expect(accountData["!s1"].rooms).not.toHaveProperty("!a");
        });

        it("hands a room that moved to another muted space over to it", async () => {
            accountData = { ...muted(), "!s2": { mutedAt: 1, rooms: {} } };
            spaceRooms["!s1"] = ["!b"];
            spaceRooms["!s2"] = ["!a"];

            await reconcileMutedSpaces(cli);

            expect(mocks.set).not.toHaveBeenCalled();
            expect(accountData["!s2"].rooms["!a"]).toBe(RoomNotifState.MentionsOnly);
        });

        it("finishes a pending mute and clears the marker", async () => {
            accountData = muted({ pending: true });
            mocks.states.set("!b", RoomNotifState.AllMessages);

            await reconcileMutedSpaces(cli);

            expect(mocks.set).toHaveBeenCalledTimes(1);
            expect(mocks.set).toHaveBeenCalledWith(cli, "!b", RoomNotifState.Mute);
            expect(accountData["!s1"].pending).toBeUndefined();
            expect(accountData["!s1"].rooms["!b"]).toBe(RoomNotifState.AllMessages);
        });

        it("leaves a room the user changed by hand when the record is not pending", async () => {
            mocks.states.set("!b", RoomNotifState.AllMessages);

            await reconcileMutedSpaces(cli);

            expect(mocks.set).not.toHaveBeenCalled();
            expect(cli.setAccountData).not.toHaveBeenCalled();
        });

        it("leaves a space alone while it shows no rooms, which may not be loaded yet", async () => {
            spaceRooms["!s1"] = [];

            await reconcileMutedSpaces(cli);

            expect(mocks.set).not.toHaveBeenCalled();
            expect(accountData["!s1"].rooms).toHaveProperty("!a");
        });

        it("leaves a space the user is no longer in", async () => {
            rooms["!s1"] = room("!s1", "leave", true);
            spaceRooms["!s1"] = ["!b"];

            await reconcileMutedSpaces(cli);

            expect(mocks.set).not.toHaveBeenCalled();
            expect(cli.setAccountData).not.toHaveBeenCalled();
        });

        it("drops a room whose rule failed, so the next pass retries it", async () => {
            rooms["!new"] = room("!new");
            spaceRooms["!s1"] = ["!a", "!b", "!new"];
            mocks.states.set("!new", RoomNotifState.AllMessages);
            mocks.set.mockRejectedValueOnce(new Error("429"));

            await reconcileMutedSpaces(cli);

            expect(accountData["!s1"].rooms).not.toHaveProperty("!new");
            expect(accountData["!s1"].pending).toBeUndefined();
        });
    });
});
