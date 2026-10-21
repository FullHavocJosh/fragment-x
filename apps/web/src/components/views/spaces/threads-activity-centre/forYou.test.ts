/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { buildForYou, forYouKey, forYouRoom, forYouRooms, threadTimestamp, unreadPreviewEvents } from "./forYou";
import { type MentionRoom } from "./useMentionRooms";
import { type ThreadData } from "./useUnreadThreadRooms";

const room = (roomId: string, lastActive: number): Room =>
    ({ roomId, getLastActiveTimestamp: () => lastActive }) as unknown as Room;

const mention = (roomId: string, lastActive: number): MentionRoom => ({ room: room(roomId, lastActive), count: 1 });

const thread = (roomId: string, threadId: string, replyTs?: number, rootTs = 1): ThreadData =>
    ({
        room: room(roomId, 0),
        thread: {
            id: threadId,
            room: room(roomId, 0),
            lastReply: () => (replyTs === undefined ? null : { getTs: () => replyTs }),
            rootEvent: { getTs: () => rootTs },
        },
    }) as unknown as ThreadData;

describe("forYou", () => {
    it("takes a thread's last reply as its time, else its root", () => {
        expect(threadTimestamp(thread("!a", "$t", 500, 100))).toBe(500);
        expect(threadTimestamp(thread("!a", "$t", undefined, 100))).toBe(100);
    });

    it("merges mentions and threads, newest activity first", () => {
        const items = buildForYou(
            [mention("!m1", 300), mention("!m2", 100)],
            [thread("!t1", "$a", 200), thread("!t2", "$b", 400)],
        );

        expect(items.map(forYouKey)).toEqual(["thread:!t2:$b", "mention:!m1", "thread:!t1:$a", "mention:!m2"]);
    });

    it("keeps a mention and a thread from the same room as two conversations", () => {
        const items = buildForYou([mention("!r", 100)], [thread("!r", "$a", 200)]);
        expect(items).toHaveLength(2);
    });

    it("is empty with nothing to follow", () => {
        expect(buildForYou([], [])).toEqual([]);
    });

    it("lists each room once for marking read", () => {
        const items = buildForYou(
            [mention("!r", 100), mention("!s", 50)],
            [thread("!r", "$a", 200), thread("!r", "$b", 300)],
        );
        expect(
            forYouRooms(items)
                .map((r) => r.roomId)
                .sort(),
        ).toEqual(["!r", "!s"]);
    });

    describe("unreadPreviewEvents", () => {
        const event = (id: string, sender: string, redacted = false): MatrixEvent =>
            ({ getId: () => id, getSender: () => sender, isRedacted: () => redacted }) as unknown as MatrixEvent;

        const roomWith = (events: MatrixEvent[], read: string[] = []): Room =>
            ({
                roomId: "!r",
                getLastActiveTimestamp: () => 0,
                getLiveTimeline: () => ({ getEvents: () => events }),
                hasUserReadEvent: (_user: string, id: string) => read.includes(id),
            }) as unknown as Room;

        const mentionItem = (room: Room) => buildForYou([{ room, count: 1 }], [])[0];

        it("takes a room's unread messages from others, oldest first", () => {
            const room = roomWith([event("$1", "@a"), event("$2", "@b"), event("$3", "@a")]);
            expect(unreadPreviewEvents(mentionItem(room), "@me").map((e) => e.getId())).toEqual(["$1", "$2", "$3"]);
        });

        it("leaves out the user's own, read and redacted messages", () => {
            const room = roomWith(
                [event("$own", "@me"), event("$read", "@a"), event("$gone", "@a", true), event("$ok", "@b")],
                ["$read"],
            );
            expect(unreadPreviewEvents(mentionItem(room), "@me").map((e) => e.getId())).toEqual(["$ok"]);
        });

        it("keeps only the newest few", () => {
            const room = roomWith(["$1", "$2", "$3", "$4", "$5"].map((id) => event(id, "@a")));
            expect(unreadPreviewEvents(mentionItem(room), "@me").map((e) => e.getId())).toEqual(["$3", "$4", "$5"]);
            expect(unreadPreviewEvents(mentionItem(room), "@me", 1).map((e) => e.getId())).toEqual(["$5"]);
        });

        it("uses a thread's own events for a thread", () => {
            const data = thread("!r", "$t", 100);
            Object.assign(data.thread, { events: [event("$x", "@a"), event("$y", "@me")] });
            Object.assign(data.room, { hasUserReadEvent: () => false });
            const [item] = buildForYou([], [data]);

            expect(forYouRoom(item).roomId).toBe("!r");
            expect(unreadPreviewEvents(item, "@me").map((e) => e.getId())).toEqual(["$x"]);
        });
    });
});
