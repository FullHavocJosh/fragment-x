/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MemberWithSeparator, SEPARATOR } from "../../../viewmodels/memberlist/MemberListViewModel";

/**
 * Fragment X: the roles the member list is grouped by, like Discord's roles. Matrix has numeric power levels, so they
 * are grouped into tiers: room creators (an infinite power level in recent room versions), admins (100 and up),
 * moderators (50 and up) and everyone else.
 */
export type MemberRole = "owner" | "admin" | "moderator" | "member";

export interface RoleHeader {
    roleHeader: true;
    role: MemberRole;
    count: number;
    collapsed: boolean;
}

export type MemberListItem = MemberWithSeparator | RoleHeader;

export function isRoleHeader(item: MemberListItem): item is RoleHeader {
    return typeof item === "object" && "roleHeader" in item;
}

export function roleOf(powerLevel: number): MemberRole {
    if (powerLevel === Infinity) return "owner";
    if (powerLevel >= 100) return "admin";
    if (powerLevel >= 50) return "moderator";
    return "member";
}

export interface GroupedMembers {
    /** The items to show: a header before each role's members, and none of the members of a collapsed role. */
    items: MemberListItem[];
    /** The position of each member (and 3pid invite) in the whole list, collapsed ones included, by item key. */
    positions: Map<string, number>;
}

const ROLE_ORDER: MemberRole[] = ["owner", "admin", "moderator", "member"];

/**
 * Group the joined members of the member list under role headers, highest role first. The order of the members within a
 * role is the order of the incoming list, which is not guaranteed to be sorted by power level (a room creator can come
 * after ordinary members). Invited members after the separator are left alone.
 */
export function groupMembersByRole(
    members: MemberWithSeparator[],
    collapsedRoles: ReadonlySet<MemberRole>,
    getKey: (item: MemberWithSeparator) => string,
): GroupedMembers {
    const joinedByRole = new Map<MemberRole, MemberWithSeparator[]>(ROLE_ORDER.map((role) => [role, []]));
    const rest: MemberWithSeparator[] = [];
    let afterSeparator = false;
    for (const item of members) {
        if (item === SEPARATOR) afterSeparator = true;
        if (!afterSeparator && item !== SEPARATOR && item.member && !item.member.isInvite) {
            joinedByRole.get(roleOf(item.member.powerLevel))!.push(item);
        } else {
            rest.push(item);
        }
    }

    const items: MemberListItem[] = [];
    const positions = new Map<string, number>();
    let position = 0;
    for (const role of ROLE_ORDER) {
        const roleMembers = joinedByRole.get(role)!;
        if (roleMembers.length === 0) continue;
        const collapsed = collapsedRoles.has(role);
        items.push({ roleHeader: true, role, count: roleMembers.length, collapsed });
        for (const item of roleMembers) {
            positions.set(getKey(item), position++);
            if (!collapsed) items.push(item);
        }
    }
    for (const item of rest) {
        if (item !== SEPARATOR) positions.set(getKey(item), position++);
        items.push(item);
    }
    return { items, positions };
}
