/*
Copyright 2024 New Vector Ltd.
Copyright 2021-2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, {
    type JSX,
    type MouseEvent,
    type ComponentProps,
    type ComponentType,
    createRef,
    type InputHTMLAttributes,
    type LegacyRef,
    type RefObject,
    useContext,
} from "react";
import classNames from "classnames";
import { type Room, RoomEvent } from "matrix-js-sdk/src/matrix";
import { KnownMembership } from "matrix-js-sdk/src/types";
import { type DraggableProvidedDragHandleProps } from "react-beautiful-dnd";
import {
    ChevronDownIcon,
    ChevronRightIcon,
    OverflowHorizontalIcon,
    NotificationsOffSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import RoomAvatar from "../avatars/RoomAvatar";
import { type SpaceKey } from "../../../stores/spaces";
import SpaceTreeLevelLayoutStore from "../../../stores/spaces/SpaceTreeLevelLayoutStore";
import { isUnifiedFrame, isUnifiedTree, SpaceRoomRows, sortRoomsForTree } from "./SpaceRoomRows";
import { NotificationBadge } from "../rooms/NotificationBadge/NotificationBadge";
import { _t } from "../../../languageHandler";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { ContextMenuTooltipButton } from "../../../accessibility/context_menu/ContextMenuTooltipButton";
import { toRightOf, useContextMenu } from "../../structures/ContextMenu";
import AccessibleButton, {
    type ButtonEvent,
    type ButtonProps as AccessibleButtonProps,
} from "../elements/AccessibleButton";
import { StaticNotificationState } from "../../../stores/notifications/StaticNotificationState";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";
import { getKeyBindingsManager } from "../../../KeyBindingsManager";
import { type NotificationState } from "../../../stores/notifications/NotificationState";
import SpaceContextMenu from "../context_menus/SpaceContextMenu";
import { useRovingTabIndex } from "../../../accessibility/RovingTabIndex";
import { KeyBindingAction } from "../../../accessibility/KeyboardShortcuts";
import { SDKContext } from "../../../contexts/SDKContext.ts";
import { useIsSpaceMuted } from "../../../hooks/useIsSpaceMuted";
import { hasUnread, unreadSummaryText, useSpaceUnread } from "../../../hooks/useSpaceUnread";

type ButtonProps<T extends keyof HTMLElementTagNameMap> = Omit<
    AccessibleButtonProps<T>,
    "title" | "onClick" | "size" | "element" | "ref"
> & {
    space?: Room;
    spaceKey?: SpaceKey;
    className?: string;
    selected?: boolean;
    label: string;
    icon?: JSX.Element;
    contextMenuTooltip?: string;
    notificationState?: NotificationState;
    isNarrow?: boolean;
    size: string;
    innerRef?: RefObject<HTMLDivElement | null>;
    ContextMenuComponent?: ComponentType<ComponentProps<typeof SpaceContextMenu>>;
    onClick?(ev?: ButtonEvent): void;
};

export const SpaceButton = <T extends keyof HTMLElementTagNameMap>({
    space,
    spaceKey: _spaceKey,
    className,
    icon,
    selected,
    label,
    contextMenuTooltip,
    notificationState,
    size,
    isNarrow,
    children,
    innerRef,
    ContextMenuComponent,
    ...props
}: ButtonProps<T>): JSX.Element => {
    const sdkContext = useContext(SDKContext);
    const [menuDisplayed, handle, openMenu, closeMenu] = useContextMenu<HTMLDivElement>(innerRef);
    const [onFocus, isActive, ref] = useRovingTabIndex<HTMLDivElement>(handle);
    const tabIndex = isActive ? 0 : -1;

    const spaceKey = _spaceKey ?? space?.roomId;
    // Fragment X: a space muted with Mute server shows a muted indicator
    const muted = useIsSpaceMuted(space?.roomId);
    // Fragment X (`fragment_x.server_unread`): a pill on the left edge and a line under the name when there is news
    const unread = useSpaceUnread(space?.roomId, notificationState);
    const unreadPill = hasUnread(unread) && !selected;
    const unreadSummary = !isNarrow && unread ? unreadSummaryText(unread) : undefined;

    let avatar = (
        <div className="mx_SpaceButton_avatarPlaceholder">
            <div className="mx_SpaceButton_icon">{icon}</div>
        </div>
    );
    if (space) {
        avatar = <RoomAvatar size={size} room={space} type="square" />;
    }

    let notifBadge;
    if (spaceKey && notificationState) {
        let ariaLabel = _t("a11y_jump_first_unread_room");
        if (space?.getMyMembership() === KnownMembership.Invite) {
            ariaLabel = _t("a11y|jump_first_invite");
        }

        const jumpToNotification = (ev: MouseEvent): void => {
            ev.stopPropagation();
            ev.preventDefault();
            sdkContext.spaceStore.setActiveRoomInSpace(spaceKey);
        };

        notifBadge = (
            <div className="mx_SpacePanel_badgeContainer">
                <NotificationBadge
                    onClick={jumpToNotification}
                    notification={notificationState}
                    className="mx_SpacePanel_notificationBadge"
                    ariaLabel={ariaLabel}
                    tabIndex={tabIndex}
                    showUnsentTooltip={true}
                />
            </div>
        );
    }

    let contextMenu: JSX.Element | undefined;
    if (menuDisplayed && handle.current && ContextMenuComponent) {
        contextMenu = (
            <ContextMenuComponent
                {...toRightOf(handle.current.getBoundingClientRect(), 0)}
                space={space}
                onFinished={closeMenu}
            />
        );
    }

    const viewSpaceHome = (): void =>
        // space is set here because of the assignment condition of onClick
        defaultDispatcher.dispatch({ action: Action.ViewRoom, room_id: space!.roomId });
    const activateSpace = (): void => {
        if (spaceKey) sdkContext.spaceStore.setActiveSpace(spaceKey);
    };
    const onClick = props.onClick ?? (selected && space ? viewSpaceHome : activateSpace);

    return (
        <AccessibleButton
            {...props}
            className={classNames("mx_SpaceButton", className, {
                mx_SpaceButton_active: selected,
                mx_SpaceButton_hasMenuOpen: menuDisplayed,
                mx_SpaceButton_narrow: isNarrow,
                mx_SpaceButton_withIcon: Boolean(icon),
                mx_SpaceButton_muted: muted,
                mx_SpaceButton_unread: unreadPill,
            })}
            aria-label={label}
            title={!isNarrow || menuDisplayed ? undefined : label}
            onClick={onClick}
            onContextMenu={openMenu}
            ref={ref}
            tabIndex={tabIndex}
            onFocus={onFocus}
        >
            {children}
            <div className="mx_SpaceButton_selectionWrapper">
                <div className="mx_SpaceButton_avatarWrapper">
                    {avatar}
                    {notifBadge}
                    {muted && (
                        <div
                            className="mx_SpaceButton_mutedIndicator"
                            role="img"
                            aria-label={_t("fragment_x|space_muted")}
                        >
                            <NotificationsOffSolidIcon />
                        </div>
                    )}
                </div>
                {!isNarrow &&
                    (unreadSummary ? (
                        <span className="mx_SpaceButton_textColumn">
                            <span className="mx_SpaceButton_name">{label}</span>
                            <span className="mx_SpaceButton_summary">{unreadSummary}</span>
                        </span>
                    ) : (
                        <span className="mx_SpaceButton_name">{label}</span>
                    ))}

                {ContextMenuComponent && (
                    <ContextMenuTooltipButton
                        className="mx_SpaceButton_menuButton"
                        onClick={openMenu}
                        title={contextMenuTooltip}
                        isExpanded={menuDisplayed}
                    >
                        <OverflowHorizontalIcon />
                    </ContextMenuTooltipButton>
                )}

                {contextMenu}
            </div>
        </AccessibleButton>
    );
};

interface IItemProps extends InputHTMLAttributes<HTMLLIElement> {
    space: Room;
    activeSpaces: SpaceKey[];
    isNested?: boolean;
    isPanelCollapsed?: boolean;
    onExpand?: () => void;
    parents?: Set<string>;
    innerRef?: LegacyRef<HTMLLIElement>;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

interface IItemState {
    name: string;
    collapsed: boolean;
    childSpaces: Room[];
    /** Fragment X unified tree: the number of joined rooms directly in the space. */
    childRoomCount: number;
}

export class SpaceItem extends React.PureComponent<IItemProps, IItemState> {
    public static contextType = SDKContext;
    declare public context: React.ContextType<typeof SDKContext>;

    private buttonRef = createRef<HTMLDivElement>();

    public constructor(props: IItemProps, context: React.ContextType<typeof SDKContext>) {
        super(props, context);

        const collapsed = SpaceTreeLevelLayoutStore.instance.getSpaceCollapsedState(
            props.space.roomId,
            this.props.parents,
            !props.isNested, // default to collapsed for root items
        );

        this.state = {
            name: this.props.space.name,
            collapsed,
            childSpaces: this.childSpaces,
            childRoomCount: this.childRoomCount,
        };
    }

    public componentDidMount(): void {
        this.context.spaceStore.on(this.props.space.roomId, this.onSpaceUpdate);
        this.props.space.on(RoomEvent.Name, this.onRoomNameChange);
    }

    public componentWillUnmount(): void {
        this.context.spaceStore.off(this.props.space.roomId, this.onSpaceUpdate);
        this.props.space.off(RoomEvent.Name, this.onRoomNameChange);
    }

    private onSpaceUpdate = (): void => {
        this.setState({
            childSpaces: this.childSpaces,
            childRoomCount: this.childRoomCount,
        });
    };

    private onRoomNameChange = (): void => {
        this.setState({
            name: this.props.space.name,
        });
    };

    private get childSpaces(): Room[] {
        return this.context.spaceStore
            .getChildSpaces(this.props.space.roomId)
            .filter((s) => !this.props.parents?.has(s.roomId));
    }

    private get childRoomCount(): number {
        return isUnifiedTree()
            ? sortRoomsForTree(this.context.spaceStore.getChildRooms(this.props.space.roomId)).length
            : 0;
    }

    private get isCollapsed(): boolean {
        // In the unified tree the rail keeps its tree when it shows icons only, so a narrow rail does not collapse it.
        return this.state.collapsed || (!!this.props.isPanelCollapsed && !isUnifiedTree());
    }

    private toggleCollapse = (evt: ButtonEvent): void => {
        // Fragment X unified tree: opening a space only opens that space; the rail's own Expand and Collapse button
        // is what shows or hides the names, so a space must not widen an icons-only rail.
        if (this.props.onExpand && this.isCollapsed && !isUnifiedTree()) {
            this.props.onExpand();
        }
        const newCollapsedState = !this.isCollapsed;

        SpaceTreeLevelLayoutStore.instance.setSpaceCollapsedState(
            this.props.space.roomId,
            this.props.parents,
            newCollapsedState,
        );
        this.setState({ collapsed: newCollapsedState });
        // don't bubble up so encapsulating button for space
        // doesn't get triggered
        evt.stopPropagation();
    };

    private onKeyDown = (ev: React.KeyboardEvent): void => {
        let handled = true;
        const action = getKeyBindingsManager().getRoomListAction(ev);
        const hasChildren = this.state.childSpaces?.length || this.state.childRoomCount;
        switch (action) {
            case KeyBindingAction.CollapseRoomListSection:
                if (hasChildren && !this.isCollapsed) {
                    this.toggleCollapse(ev);
                } else {
                    const parentItem = this.buttonRef?.current?.parentElement?.parentElement;
                    const parentButton = parentItem?.previousElementSibling as HTMLElement;
                    parentButton?.focus();
                }
                break;

            case KeyBindingAction.ExpandRoomListSection:
                if (hasChildren) {
                    if (this.isCollapsed) {
                        this.toggleCollapse(ev);
                    } else {
                        const childLevel = this.buttonRef?.current?.nextElementSibling;
                        const firstSpaceItemChild = childLevel?.querySelector<HTMLLIElement>(".mx_SpaceItem");
                        firstSpaceItemChild?.querySelector<HTMLDivElement>(".mx_SpaceButton")?.focus();
                    }
                }
                break;

            default:
                handled = false;
        }

        if (handled) {
            ev.stopPropagation();
            ev.preventDefault();
        }
    };

    public render(): React.ReactNode {
        const {
            space,
            activeSpaces,
            isNested,
            isPanelCollapsed,
            onExpand,
            parents,
            innerRef,
            dragHandleProps,
            ...otherProps
        } = this.props;

        const collapsed = this.isCollapsed;

        const itemClasses = classNames(this.props.className, {
            mx_SpaceItem: true,
            mx_SpaceItem_narrow: isPanelCollapsed,
            collapsed: collapsed,
            hasSubSpaces: this.state.childSpaces?.length || this.state.childRoomCount,
            // Fragment X unified frame: a subspace is as large as a space, and is not indented (the rail styles tell a subspace apart)
            mx_SpaceItem_subspace: isNested && isUnifiedFrame(),
        });

        const isInvite = space.getMyMembership() === KnownMembership.Invite;

        const notificationState = isInvite
            ? StaticNotificationState.forSymbol("!", NotificationLevel.Highlight)
            : this.context.spaceStore.getNotificationState(space.roomId);

        const hasChildren = this.state.childSpaces?.length || this.state.childRoomCount;

        let childItems;
        if (hasChildren && !collapsed) {
            childItems = (
                <SpaceTreeLevel
                    spaces={this.state.childSpaces}
                    activeSpaces={activeSpaces}
                    isNested={true}
                    parents={new Set(parents).add(space.roomId)}
                    // Fragment X unified tree: the rooms of the space are listed after its sub-spaces.
                    roomsOf={isUnifiedTree() ? space : undefined}
                    isPanelCollapsed={isPanelCollapsed}
                />
            );
        }

        const toggleCollapseButton = hasChildren ? (
            <AccessibleButton
                className="mx_SpaceButton_toggleCollapse"
                onClick={this.toggleCollapse}
                tabIndex={-1}
                aria-label={collapsed ? _t("action|expand") : _t("action|collapse")}
            >
                {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </AccessibleButton>
        ) : null;

        const { tabIndex, ...restDragHandleProps } = dragHandleProps || {};
        const selected = activeSpaces.includes(space.roomId);

        return (
            <li
                {...otherProps}
                className={itemClasses}
                ref={innerRef}
                aria-expanded={hasChildren ? !collapsed : undefined}
                aria-selected={selected}
                role="treeitem"
            >
                <SpaceButton
                    {...restDragHandleProps}
                    space={space}
                    className={isInvite ? "mx_SpaceButton_invite" : undefined}
                    selected={selected}
                    label={this.state.name}
                    contextMenuTooltip={_t("space|context_menu|options")}
                    notificationState={notificationState}
                    isNarrow={isPanelCollapsed}
                    size={isNested && !isUnifiedFrame() ? "24px" : "32px"}
                    onKeyDown={this.onKeyDown}
                    ContextMenuComponent={
                        this.props.space.getMyMembership() === KnownMembership.Join ? SpaceContextMenu : undefined
                    }
                >
                    {toggleCollapseButton}
                </SpaceButton>

                {childItems}
            </li>
        );
    }
}

interface ITreeLevelProps {
    spaces: Room[];
    activeSpaces: SpaceKey[];
    isNested?: boolean;
    parents: Set<string>;
    /** Fragment X unified tree: list the rooms of this space after the sub-spaces. */
    roomsOf?: Room;
    /** Fragment X unified tree: the rail shows icons only. */
    isPanelCollapsed?: boolean;
}

const SpaceTreeLevel: React.FC<ITreeLevelProps> = ({
    spaces,
    activeSpaces,
    isNested,
    parents,
    roomsOf,
    isPanelCollapsed,
}) => {
    return (
        <ul className="mx_SpaceTreeLevel" role="group">
            {spaces.map((s) => {
                return (
                    <SpaceItem
                        key={s.roomId}
                        activeSpaces={activeSpaces}
                        space={s}
                        isNested={isNested}
                        parents={parents}
                        isPanelCollapsed={roomsOf ? isPanelCollapsed : undefined}
                    />
                );
            })}
            {roomsOf && <SpaceRoomRows space={roomsOf} isNarrow={isPanelCollapsed} />}
        </ul>
    );
};
