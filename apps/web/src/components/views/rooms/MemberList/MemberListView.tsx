/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { Form } from "@vector-im/compound-web";
import React, { type JSX, useCallback, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { Flex, type VirtualizedListContext, FlatVirtualizedList } from "@element-hq/web-shared-components";

import {
    type MemberWithSeparator,
    SEPARATOR,
    useMemberListViewModel,
} from "../../../viewmodels/memberlist/MemberListViewModel";
import { RoomMemberTileView } from "./tiles/RoomMemberTileView";
import { ThreePidInviteTileView } from "./tiles/ThreePidInviteTileView";
import { MemberListHeaderView } from "./MemberListHeaderView";
import BaseCard from "../../right_panel/BaseCard";
import { _t } from "../../../../languageHandler";
import SdkConfig from "../../../../SdkConfig";
import { useMatrixClientContext } from "../../../../contexts/MatrixClientContext";
import { groupMembersByRole, isRoleHeader, type MemberListItem, type MemberRole, type RoleHeader } from "./memberRoles";

interface IProps {
    roomId: string;
    onClose: () => void;
}

/**
 * Height of a single member list item
 */
const MEMBER_LIST_ITEM_HEIGHT = 56;
/**
 * Amount to extend the top and bottom of the viewport by.
 * From manual testing 15 items seems to be enough to never really see the blank space when scrolling.
 */
const EXTENDED_VIEWPORT_HEIGHT = 15 * MEMBER_LIST_ITEM_HEIGHT;

const COLLAPSED_ROLES_KEY = "mx_fragment_x_member_roles_collapsed";

function loadCollapsedRoles(): Set<MemberRole> {
    try {
        const stored = JSON.parse(window.localStorage.getItem(COLLAPSED_ROLES_KEY) ?? "[]");
        return new Set(Array.isArray(stored) ? stored : []);
    } catch {
        return new Set();
    }
}

function saveCollapsedRoles(roles: ReadonlySet<MemberRole>): void {
    try {
        window.localStorage.setItem(COLLAPSED_ROLES_KEY, JSON.stringify([...roles]));
    } catch {
        // storage can be unavailable; the collapsed state then lasts until the panel closes
    }
}

function roleLabel(role: MemberRole): string {
    switch (role) {
        case "owner":
            return _t("power_level|creator");
        case "admin":
            return _t("power_level|admin");
        case "moderator":
            return _t("power_level|moderator");
        default:
            return _t("fragment_x|members");
    }
}

/** Fragment X: a role heading in the member list; it collapses and expands the members of that role. */
const RoleHeaderView: React.FC<{ header: RoleHeader; onToggle: (role: MemberRole) => void }> = ({
    header,
    onToggle,
}) => (
    <button
        type="button"
        className="mx_MemberListView_roleHeader"
        aria-expanded={!header.collapsed}
        onClick={() => onToggle(header.role)}
    >
        {header.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        <span>{`${roleLabel(header.role)} — ${header.count}`}</span>
    </button>
);

const MemberListView: React.FC<IProps> = (props: IProps) => {
    const vm = useMemberListViewModel(props.roomId);
    const { isPresenceEnabled, memberCount } = vm;
    const ownUserId = useMatrixClientContext().getSafeUserId();

    // Fragment X: group the members under collapsible role headings.
    const rolesEnabled = Boolean(SdkConfig.get().fragment_x?.member_list_roles);
    const [collapsedRoles, setCollapsedRoles] = useState<Set<MemberRole>>(loadCollapsedRoles);
    const onToggleRole = useCallback((role: MemberRole): void => {
        setCollapsedRoles((previous) => {
            const next = new Set(previous);
            if (!next.delete(role)) next.add(role);
            saveCollapsedRoles(next);
            return next;
        });
    }, []);

    const getItemKey = useCallback((item: MemberListItem): string => {
        if (isRoleHeader(item)) {
            return `role-${item.role}`;
        } else if (item === SEPARATOR) {
            return "separator";
        } else if (item.member) {
            return `member-${item.member.userId}`;
        } else {
            return `threePidInvite-${item.threePidInvite.event.getStateKey()}`;
        }
    }, []);

    const grouped = useMemo(
        () => (rolesEnabled ? groupMembersByRole(vm.members, collapsedRoles, getItemKey) : undefined),
        [rolesEnabled, vm.members, collapsedRoles, getItemKey],
    );
    const items: MemberListItem[] = grouped?.items ?? vm.members;

    const getItemComponent = useCallback(
        (
            index: number,
            item: MemberListItem,
            context: VirtualizedListContext<any>,
            onFocus: (item: MemberWithSeparator, e: React.FocusEvent) => void,
        ): JSX.Element => {
            if (isRoleHeader(item)) {
                return <RoleHeaderView header={item} onToggle={onToggleRole} />;
            }
            const itemKey = getItemKey(item);
            const isRovingItem = itemKey === context.tabIndexKey;
            const focused = isRovingItem && context.focused;
            // With role headings the list index no longer matches the position among the members.
            const position = grouped?.positions.get(itemKey);
            if (item === SEPARATOR) {
                return <hr className="mx_MemberListView_separator" />;
            } else if (item.member) {
                const tile = (
                    <RoomMemberTileView
                        item={item}
                        member={item.member}
                        showPresence={isPresenceEnabled}
                        focused={focused}
                        tabIndex={isRovingItem ? 0 : -1}
                        index={position ?? index}
                        memberCount={memberCount}
                        onFocus={onFocus}
                    />
                );
                // Fragment X: your own entry is highlighted in whichever role you are in.
                return rolesEnabled && item.member.userId === ownUserId ? (
                    <div className="mx_MemberListView_self" role="presentation">
                        {tile}
                    </div>
                ) : (
                    tile
                );
            } else {
                return (
                    <ThreePidInviteTileView
                        item={item}
                        threePidInvite={item.threePidInvite}
                        focused={focused}
                        tabIndex={isRovingItem ? 0 : -1}
                        memberIndex={position ?? index - 1} // Adjust as invites are below the separator
                        memberCount={memberCount}
                        onFocus={onFocus}
                    />
                );
            }
        },
        [isPresenceEnabled, getItemKey, memberCount, grouped, rolesEnabled, ownUserId, onToggleRole],
    );

    const isItemFocusable = useCallback((item: MemberListItem): boolean => {
        return item !== SEPARATOR && !isRoleHeader(item);
    }, []);

    return (
        <BaseCard
            id="memberlist-panel"
            className="mx_MemberListView"
            ariaLabelledBy="memberlist-panel-tab"
            role="tabpanel"
            header={_t("common|people")}
            onClose={props.onClose}
        >
            <Flex align="stretch" direction="column" className="mx_MemberListView_container">
                <Form.Root onSubmit={(e) => e.preventDefault()}>
                    <MemberListHeaderView vm={vm} />
                </Form.Root>
                <FlatVirtualizedList
                    items={items}
                    getItemComponent={getItemComponent}
                    getItemKey={getItemKey}
                    isItemFocusable={isItemFocusable}
                    role="listbox"
                    aria-label={_t("member_list|list_title")}
                    // Role headings are shorter than member rows, so the rows have no fixed height with them.
                    fixedItemHeight={rolesEnabled ? undefined : MEMBER_LIST_ITEM_HEIGHT}
                    increaseViewportBy={{
                        bottom: EXTENDED_VIEWPORT_HEIGHT,
                        top: EXTENDED_VIEWPORT_HEIGHT,
                    }}
                />
            </Flex>
        </BaseCard>
    );
};

export default MemberListView;
