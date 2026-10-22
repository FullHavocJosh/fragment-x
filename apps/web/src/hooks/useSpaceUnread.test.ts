/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";

import { hasUnread, summariseUnread, unreadSummaryText } from "./useSpaceUnread";
import { NotificationLevel } from "../stores/notifications/NotificationLevel";

const state = (level: NotificationLevel, count = 0): { level: NotificationLevel; count: number } => ({ level, count });

describe("summariseUnread", () => {
    it("adds up the messages and counts the rooms they are in", () => {
        expect(
            summariseUnread([
                state(NotificationLevel.Notification, 3),
                state(NotificationLevel.Highlight, 2),
                state(NotificationLevel.None),
            ]),
        ).toEqual({ messages: 5, rooms: 2, activityRooms: 0 });
    });

    it("counts muted rooms for nothing", () => {
        expect(summariseUnread([state(NotificationLevel.Muted, 4), state(NotificationLevel.Notification, 1)])).toEqual({
            messages: 1,
            rooms: 1,
            activityRooms: 0,
        });
    });

    it("counts a room with only unread activity apart, and one that failed to send for nothing", () => {
        expect(summariseUnread([state(NotificationLevel.Activity), state(NotificationLevel.Unsent, 1)])).toEqual({
            messages: 0,
            rooms: 0,
            activityRooms: 1,
        });
    });

    it("is all zeros for no rooms", () => {
        expect(summariseUnread([])).toEqual({ messages: 0, rooms: 0, activityRooms: 0 });
    });
});

describe("unreadSummaryText", () => {
    it("says how many new messages are in how many rooms", () => {
        expect(unreadSummaryText({ messages: 3, rooms: 2, activityRooms: 0 })).toBe("3 new messages in 2 rooms");
    });

    it("uses the singular for one message in one room", () => {
        expect(unreadSummaryText({ messages: 1, rooms: 1, activityRooms: 0 })).toBe("1 new message in 1 room");
    });

    it("says there is new activity when only rooms with unread activity have news", () => {
        expect(unreadSummaryText({ messages: 0, rooms: 0, activityRooms: 2 })).toBe("New activity in 2 rooms");
    });

    it("is undefined when nothing is new", () => {
        expect(unreadSummaryText({ messages: 0, rooms: 0, activityRooms: 0 })).toBeUndefined();
    });
});

describe("hasUnread", () => {
    it("is true for messages or activity and false for nothing", () => {
        expect(hasUnread({ messages: 1, rooms: 1, activityRooms: 0 })).toBe(true);
        expect(hasUnread({ messages: 0, rooms: 0, activityRooms: 1 })).toBe(true);
        expect(hasUnread({ messages: 0, rooms: 0, activityRooms: 0 })).toBe(false);
        expect(hasUnread(undefined)).toBe(false);
    });
});
