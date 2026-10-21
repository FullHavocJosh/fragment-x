/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { type Room } from "matrix-js-sdk/src/matrix";

import { buildForYou, forYouKey, forYouRooms, threadTimestamp } from "./forYou";
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
});
