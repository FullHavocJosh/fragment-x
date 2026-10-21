/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";

import { groupMembersByRole, isRoleHeader, roleOf, type MemberRole } from "./memberRoles";
import { type MemberWithSeparator, SEPARATOR } from "../../../viewmodels/memberlist/MemberListViewModel";

const member = (userId: string, powerLevel: number, isInvite = false): MemberWithSeparator => ({
    member: {
        roomId: "!room:server",
        userId,
        displayUserId: userId,
        name: userId,
        rawDisplayName: userId,
        disambiguate: false,
        powerLevel,
        lastModifiedTime: 0,
        isInvite,
    },
});

const key = (item: MemberWithSeparator): string => (item === SEPARATOR ? "separator" : (item.member?.userId ?? "3pid"));

describe("memberRoles", () => {
    it("tiers power levels into roles", () => {
        expect(roleOf(Infinity)).toBe("owner");
        expect(roleOf(100)).toBe("admin");
        expect(roleOf(75)).toBe("moderator");
        expect(roleOf(50)).toBe("moderator");
        expect(roleOf(49)).toBe("member");
        expect(roleOf(0)).toBe("member");
    });

    const members: MemberWithSeparator[] = [
        member("@owner:s", Infinity),
        member("@admin:s", 100),
        member("@mod1:s", 50),
        member("@mod2:s", 50),
        member("@a:s", 0),
        member("@b:s", 0),
        member("@c:s", 0),
        SEPARATOR,
        member("@invited:s", 0, true),
    ];

    it("puts a header with the count before each role", () => {
        const { items } = groupMembersByRole(members, new Set(), key);
        const headers = items.filter(isRoleHeader).map((h) => [h.role, h.count, h.collapsed]);
        expect(headers).toEqual([
            ["owner", 1, false],
            ["admin", 1, false],
            ["moderator", 2, false],
            ["member", 3, false],
        ]);
        // header, member, header, member, header, 2 members, header, 3 members, separator, invited
        expect(items).toHaveLength(4 + 7 + 2);
        expect(isRoleHeader(items[0])).toBe(true);
    });

    it("leaves invited members after the separator without a header", () => {
        const { items } = groupMembersByRole(members, new Set(), key);
        expect(items.slice(-2)).toEqual([SEPARATOR, members[8]]);
    });

    it("hides the members of a collapsed role but keeps its header and count", () => {
        const collapsed = new Set<MemberRole>(["member"]);
        const { items } = groupMembersByRole(members, collapsed, key);
        const memberHeader = items.filter(isRoleHeader).find((h) => h.role === "member");
        expect(memberHeader).toMatchObject({ count: 3, collapsed: true });
        expect(items.some((i) => i !== SEPARATOR && !isRoleHeader(i) && i.member?.userId === "@a:s")).toBe(false);
        // the other roles are untouched and the invited member is still listed
        expect(items.some((i) => i !== SEPARATOR && !isRoleHeader(i) && i.member?.userId === "@admin:s")).toBe(true);
        expect(items.some((i) => i !== SEPARATOR && !isRoleHeader(i) && i.member?.userId === "@invited:s")).toBe(true);
    });

    it("numbers positions over the whole list, collapsed members included", () => {
        const { positions } = groupMembersByRole(members, new Set<MemberRole>(["moderator"]), key);
        expect(positions.get("@owner:s")).toBe(0);
        expect(positions.get("@mod2:s")).toBe(3);
        expect(positions.get("@a:s")).toBe(4);
        // the separator is not a member, so it takes no position
        expect(positions.get("@invited:s")).toBe(7);
    });

    it("orders the roles highest first even when the incoming list is not sorted", () => {
        const { items } = groupMembersByRole(
            [member("@a:s", 0), member("@owner:s", Infinity), member("@m:s", 50)],
            new Set(),
            key,
        );
        expect(items.map((i) => (isRoleHeader(i) ? i.role : key(i)))).toEqual([
            "owner",
            "@owner:s",
            "moderator",
            "@m:s",
            "member",
            "@a:s",
        ]);
    });

    it("makes no headers for a room with only invited members", () => {
        const { items } = groupMembersByRole([member("@i:s", 0, true)], new Set(), key);
        expect(items.some(isRoleHeader)).toBe(false);
    });
});
