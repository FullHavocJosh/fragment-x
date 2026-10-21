/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect } from "vitest";
import { KnownMembership, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import { getMentionRooms } from "./useMentionRooms";
import { NotificationLevel } from "../../../../stores/notifications/NotificationLevel";
import { type RoomNotificationStateStore } from "../../../../stores/notifications/RoomNotificationStateStore";

interface FakeRoom {
    id: string;
    membership?: KnownMembership;
    isSpace?: boolean;
    level?: NotificationLevel;
    count?: number;
    muted?: boolean;
    lastActive?: number;
}

function setup(fakes: FakeRoom[]): { client: MatrixClient; store: RoomNotificationStateStore } {
    const byRoom = new Map<Room, FakeRoom>();
    const rooms = fakes.map((fake) => {
        const room = {
            roomId: fake.id,
            getMyMembership: () => fake.membership ?? KnownMembership.Join,
            isSpaceRoom: () => fake.isSpace ?? false,
            getLastActiveTimestamp: () => fake.lastActive ?? 0,
        } as unknown as Room;
        byRoom.set(room, fake);
        return room;
    });
    const store = {
        getRoomState: (room: Room) => {
            const fake = byRoom.get(room)!;
            return { level: fake.level ?? NotificationLevel.None, count: fake.count ?? 0, muted: fake.muted ?? false };
        },
    } as unknown as RoomNotificationStateStore;
    return { client: { getRooms: vi.fn().mockReturnValue(rooms) } as unknown as MatrixClient, store };
}

describe("getMentionRooms", () => {
    it("lists joined rooms with unread mentions, most recently active first, with their counts", () => {
        const { client, store } = setup([
            { id: "!old", level: NotificationLevel.Highlight, count: 1, lastActive: 100 },
            { id: "!new", level: NotificationLevel.Highlight, count: 4, lastActive: 300 },
            { id: "!mid", level: NotificationLevel.Highlight, count: 2, lastActive: 200 },
        ]);

        expect(getMentionRooms(client, store).map((m) => [m.room.roomId, m.count])).toEqual([
            ["!new", 4],
            ["!mid", 2],
            ["!old", 1],
        ]);
    });

    it("leaves out rooms with only ordinary notifications or activity", () => {
        const { client, store } = setup([
            { id: "!notif", level: NotificationLevel.Notification, count: 3 },
            { id: "!activity", level: NotificationLevel.Activity },
            { id: "!none" },
        ]);
        expect(getMentionRooms(client, store)).toEqual([]);
    });

    it("leaves out muted rooms, spaces and rooms the user is not in", () => {
        const { client, store } = setup([
            { id: "!muted", level: NotificationLevel.Highlight, count: 1, muted: true },
            { id: "!space", level: NotificationLevel.Highlight, count: 1, isSpace: true },
            { id: "!invite", level: NotificationLevel.Highlight, count: 1, membership: KnownMembership.Invite },
            { id: "!left", level: NotificationLevel.Highlight, count: 1, membership: KnownMembership.Leave },
            { id: "!ok", level: NotificationLevel.Highlight, count: 1 },
        ]);
        expect(getMentionRooms(client, store).map((m) => m.room.roomId)).toEqual(["!ok"]);
    });
});
