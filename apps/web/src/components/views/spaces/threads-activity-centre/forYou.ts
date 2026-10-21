/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";

import { type MentionRoom } from "./useMentionRooms";
import { type ThreadData } from "./useUnreadThreadRooms";

/**
 * One conversation the user follows in the inbox's "For you" tab: a thread they took part in, or a room where they were
 * mentioned. Each is one collapsed row with a counter.
 */
export type ForYouItem =
    | { kind: "thread"; thread: ThreadData; timestamp: number }
    | { kind: "mention"; mention: MentionRoom; timestamp: number };

/** When a thread last had activity: its newest reply, else its root. */
export function threadTimestamp(data: ThreadData): number {
    return data.thread.lastReply()?.getTs() ?? data.thread.rootEvent?.getTs() ?? 0;
}

/** The unread threads the user took part in and the rooms they were mentioned in, newest activity first. */
export function buildForYou(mentions: MentionRoom[], participatingThreads: ThreadData[]): ForYouItem[] {
    const items: ForYouItem[] = [
        ...participatingThreads.map((thread): ForYouItem => ({
            kind: "thread",
            thread,
            timestamp: threadTimestamp(thread),
        })),
        ...mentions.map((mention): ForYouItem => ({
            kind: "mention",
            mention,
            timestamp: mention.room.getLastActiveTimestamp(),
        })),
    ];
    return items.sort((a, b) => b.timestamp - a.timestamp);
}

/** The rooms behind the items, each once, for marking them all read. */
export function forYouRooms(items: ForYouItem[]): Room[] {
    const rooms = new Map<string, Room>();
    for (const item of items) {
        const room = item.kind === "thread" ? item.thread.room : item.mention.room;
        rooms.set(room.roomId, room);
    }
    return [...rooms.values()];
}

/** A stable React key for an item. */
export function forYouKey(item: ForYouItem): string {
    return item.kind === "thread"
        ? `thread:${item.thread.room.roomId}:${item.thread.thread.id}`
        : `mention:${item.mention.room.roomId}`;
}

/** The room behind an item. */
export function forYouRoom(item: ForYouItem): Room {
    return item.kind === "thread" ? item.thread.room : item.mention.room;
}

/**
 * The newest messages of a conversation that the user has not read, oldest first, for the preview under an expanded row.
 * The user's own messages, redacted ones and ones without an id are left out. A thread uses its own events, a room its
 * live timeline.
 */
export function unreadPreviewEvents(item: ForYouItem, myUserId: string, limit = 3): MatrixEvent[] {
    const room = forYouRoom(item);
    const events = item.kind === "thread" ? item.thread.thread.events : room.getLiveTimeline().getEvents();
    return events
        .filter((event) => {
            const id = event.getId();
            return (
                Boolean(id) &&
                event.getSender() !== myUserId &&
                !event.isRedacted() &&
                !room.hasUserReadEvent(myUserId, id!)
            );
        })
        .slice(-limit);
}
