/*
Copyright 2026 Element Creations Ltd.
Copyright 2024 New Vector Ltd.
Copyright 2021, 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, {
    type ComponentProps,
    type Dispatch,
    type ReactNode,
    type RefCallback,
    type SetStateAction,
    type JSX,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useContext,
} from "react";
import { DragDropContext, Draggable, Droppable, type DroppableProvidedProps } from "react-beautiful-dnd";
import classNames from "classnames";
import { type Room } from "matrix-js-sdk/src/matrix";
import {
    ChatSolidIcon,
    HomeSolidIcon,
    RoomIcon,
    VideoCallSolidIcon,
    PlusIcon,
    GridIcon,
    ChevronDownIcon,
    ChevronRightIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { useCreateAutoDisposedViewModel, UserMenu } from "@element-hq/web-shared-components";

import { _t } from "../../../languageHandler";
import { useContextMenu } from "../../structures/ContextMenu";
import { useHomeTab } from "../../structures/HomeTabs";
import SpaceCreateMenu from "./SpaceCreateMenu";
import { SpaceButton, SpaceItem } from "./SpaceTreeLevel";
import {
    HomeRoomRows,
    isMessagesEntry,
    isPinnedMessages,
    isUnifiedFrame,
    isUnifiedTree,
    partitionHomeRooms,
    useHomeRooms,
    useMessagesRooms,
} from "./SpaceRoomRows";
import SpaceTreeLevelLayoutStore from "../../../stores/spaces/SpaceTreeLevelLayoutStore";
import UserPanel from "./UserPanel";
import { useEventEmitter, useEventEmitterState } from "../../../hooks/useEventEmitter";
import {
    getMetaSpaceName,
    MetaSpace,
    type SpaceKey,
    UPDATE_HOME_BEHAVIOUR,
    UPDATE_INVITED_SPACES,
    UPDATE_SELECTED_SPACE,
    UPDATE_TOP_LEVEL_SPACES,
} from "../../../stores/spaces";
import { RovingTabIndexProvider } from "../../../accessibility/RovingTabIndex";
import { UPDATE_STATUS_INDICATOR } from "../../../stores/notifications/RoomNotificationStateStore";
import type SpaceContextMenu from "../context_menus/SpaceContextMenu";
import IconizedContextMenu, {
    IconizedContextMenuCheckbox,
    IconizedContextMenuOptionList,
} from "../context_menus/IconizedContextMenu";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import UIStore from "../../../stores/UIStore";
import QuickSettingsButton from "./QuickSettingsButton";
import RailSearchButton from "./RailSearchButton";
import RoomListToggleButton from "./RoomListToggleButton";
import { useSettingValue } from "../../../hooks/useSettings";
import IndicatorScrollbar from "../../structures/IndicatorScrollbar";
import { useDispatcher } from "../../../hooks/useDispatcher";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { type ActionPayload } from "../../../dispatcher/payloads";
import { Action } from "../../../dispatcher/actions";
import { type NotificationState } from "../../../stores/notifications/NotificationState";
import { KeyBindingAction } from "../../../accessibility/KeyboardShortcuts";
import { getKeyBindingsManager } from "../../../KeyBindingsManager";
import { shouldShowComponent } from "../../../customisations/helpers/UIComponents";
import { UIComponent } from "../../../settings/UIFeature";
import { ThreadsActivityCentre } from "./threads-activity-centre/";
import AccessibleButton, { type ButtonEvent } from "../elements/AccessibleButton";
import { Landmark, LandmarkNavigation } from "../../../accessibility/LandmarkNavigation";
import { KeyboardShortcut } from "../settings/KeyboardShortcut";
import { ModuleApi } from "../../../modules/Api.ts";
import { useModuleSpacePanelItems } from "../../../modules/ExtrasApi.ts";
import { UserMenuViewModel } from "../../../viewmodels/menus/UserMenuViewModel.ts";
import SdkConfig from "../../../SdkConfig";
import { SDKContext } from "../../../contexts/SDKContext.ts";
import { OwnProfileStore } from "../../../stores/OwnProfileStore.ts";
import { type SDKContextClass } from "../../../contexts/SDKContextClass.ts";

const useSpaces = (): [Room[], MetaSpace[], Room[], SpaceKey] => {
    const sdkContext = useContext(SDKContext);
    const invites = useEventEmitterState<Room[]>(sdkContext.spaceStore, UPDATE_INVITED_SPACES, () => {
        return sdkContext.spaceStore.invitedSpaces;
    });
    const [metaSpaces, actualSpaces] = useEventEmitterState<[MetaSpace[], Room[]]>(
        sdkContext.spaceStore,
        UPDATE_TOP_LEVEL_SPACES,
        () => [sdkContext.spaceStore.enabledMetaSpaces, sdkContext.spaceStore.spacePanelSpaces],
    );
    const activeSpace = useEventEmitterState<SpaceKey>(sdkContext.spaceStore, UPDATE_SELECTED_SPACE, () => {
        return sdkContext.spaceStore.activeSpace;
    });
    return [invites, metaSpaces, actualSpaces, activeSpace];
};

export const HomeButtonContextMenu: React.FC<ComponentProps<typeof SpaceContextMenu>> = ({
    onFinished,
    hideHeader,
    ...props
}) => {
    const allRoomsInHome = useSettingValue("Spaces.allRoomsInHome");

    return (
        <IconizedContextMenu {...props} onFinished={onFinished} className="mx_SpacePanel_contextMenu" compact>
            {!hideHeader && <div className="mx_SpacePanel_contextMenu_header">{_t("common|home")}</div>}
            <IconizedContextMenuOptionList first>
                <IconizedContextMenuCheckbox
                    label={_t("settings|sidebar|metaspaces_home_all_rooms")}
                    active={allRoomsInHome}
                    onClick={() => {
                        onFinished();
                        void SettingsStore.setValue(
                            "Spaces.allRoomsInHome",
                            null,
                            SettingLevel.ACCOUNT,
                            !allRoomsInHome,
                        );
                    }}
                />
            </IconizedContextMenuOptionList>
        </IconizedContextMenu>
    );
};

interface IMetaSpaceButtonProps extends ComponentProps<typeof SpaceButton> {
    selected: boolean;
    isPanelCollapsed: boolean;
    icon: JSX.Element;
}

type MetaSpaceButtonProps = Pick<IMetaSpaceButtonProps, "selected" | "isPanelCollapsed">;

const MetaSpaceButton: React.FC<IMetaSpaceButtonProps> = ({ selected, isPanelCollapsed, size = "32px", ...props }) => {
    return (
        <li
            className={classNames("mx_SpaceItem", {
                collapsed: isPanelCollapsed,
            })}
            role="treeitem"
            aria-selected={selected}
        >
            <SpaceButton {...props} selected={selected} isNarrow={isPanelCollapsed} size={size} />
        </li>
    );
};

const getHomeNotificationState = (sdkContext: SDKContextClass): NotificationState => {
    return sdkContext.spaceStore.allRoomsInHome
        ? sdkContext.roomNotificationStateStore.globalState
        : sdkContext.spaceStore.getNotificationState(MetaSpace.Home);
};

const HomeButton: React.FC<MetaSpaceButtonProps> = ({ selected, isPanelCollapsed }) => {
    const sdkContext = useContext(SDKContext);
    const allRoomsInHome = useEventEmitterState(sdkContext.spaceStore, UPDATE_HOME_BEHAVIOUR, () => {
        return sdkContext.spaceStore.allRoomsInHome;
    });
    const [notificationState, setNotificationState] = useState(getHomeNotificationState(sdkContext));
    const updateNotificationState = useCallback(() => {
        setNotificationState(getHomeNotificationState(sdkContext));
    }, [sdkContext]);
    useEffect(updateNotificationState, [updateNotificationState, allRoomsInHome]);
    useEventEmitter(sdkContext.roomNotificationStateStore, UPDATE_STATUS_INDICATOR, updateNotificationState);

    // Fragment X unified tree: Home lists its rooms (direct messages and rooms in no space) under it.
    const unified = isUnifiedTree();
    const allHomeRooms = useHomeRooms(unified);
    // Fragment X messages entry: Home is called Messages and lists only the direct messages, each with its last message.
    const messages = isMessagesEntry();
    const dmRooms = messages ? partitionHomeRooms(allHomeRooms).dms : allHomeRooms;
    // Fragment X pinned messages: only the pinned and the unread conversations, the pinned ones first
    const homeRooms = useMessagesRooms(dmRooms, isPinnedMessages());
    const homeLabel = messages ? _t("fragment_x|messages") : getMetaSpaceName(MetaSpace.Home, allRoomsInHome);
    const [storedTreeCollapsed, setTreeCollapsed] = useState(() =>
        SpaceTreeLevelLayoutStore.instance.getSpaceCollapsedState(MetaSpace.Home, undefined, false),
    );
    // Fragment X unified frame: there are no arrows, so Messages always lists its conversations.
    const treeCollapsed = isUnifiedFrame() ? false : storedTreeCollapsed;

    if (!unified) {
        return (
            <MetaSpaceButton
                spaceKey={MetaSpace.Home}
                selected={selected}
                isPanelCollapsed={isPanelCollapsed}
                label={getMetaSpaceName(MetaSpace.Home, allRoomsInHome)}
                notificationState={notificationState}
                ContextMenuComponent={HomeButtonContextMenu}
                contextMenuTooltip={_t("common|options")}
                size="32px"
                icon={<HomeSolidIcon />}
            />
        );
    }

    const hasRooms = homeRooms.length > 0;
    const toggle = hasRooms ? (
        <AccessibleButton
            className="mx_SpaceButton_toggleCollapse"
            tabIndex={-1}
            aria-label={treeCollapsed ? _t("action|expand") : _t("action|collapse")}
            onClick={(ev: ButtonEvent) => {
                SpaceTreeLevelLayoutStore.instance.setSpaceCollapsedState(MetaSpace.Home, undefined, !treeCollapsed);
                setTreeCollapsed(!treeCollapsed);
                // don't also select Home
                ev.stopPropagation();
            }}
        >
            {treeCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </AccessibleButton>
    ) : null;

    return (
        <li
            className={classNames("mx_SpaceItem", {
                collapsed: treeCollapsed,
                hasSubSpaces: hasRooms,
                mx_SpaceItem_narrow: isPanelCollapsed,
            })}
            role="treeitem"
            aria-selected={selected}
            aria-expanded={hasRooms ? !treeCollapsed : undefined}
        >
            <SpaceButton
                spaceKey={MetaSpace.Home}
                selected={selected}
                isNarrow={isPanelCollapsed}
                label={homeLabel}
                notificationState={notificationState}
                ContextMenuComponent={HomeButtonContextMenu}
                contextMenuTooltip={_t("common|options")}
                size="32px"
                icon={messages ? <ChatSolidIcon /> : <HomeSolidIcon />}
            >
                {toggle}
            </SpaceButton>
            {hasRooms && !treeCollapsed && (
                <ul className="mx_SpaceTreeLevel" role="group">
                    <HomeRoomRows rooms={homeRooms} isNarrow={isPanelCollapsed} showPreview={messages} />
                </ul>
            )}
        </li>
    );
};

const OrphansButton: React.FC<MetaSpaceButtonProps> = ({ selected, isPanelCollapsed }) => {
    const sdkContext = useContext(SDKContext);
    return (
        <MetaSpaceButton
            spaceKey={MetaSpace.Orphans}
            selected={selected}
            isPanelCollapsed={isPanelCollapsed}
            label={getMetaSpaceName(MetaSpace.Orphans)}
            notificationState={sdkContext.spaceStore.getNotificationState(MetaSpace.Orphans)}
            size="32px"
            icon={<RoomIcon />}
        />
    );
};

const VideoRoomsButton: React.FC<MetaSpaceButtonProps> = ({ selected, isPanelCollapsed }) => {
    const sdkContext = useContext(SDKContext);
    return (
        <MetaSpaceButton
            spaceKey={MetaSpace.VideoRooms}
            selected={selected}
            isPanelCollapsed={isPanelCollapsed}
            label={getMetaSpaceName(MetaSpace.VideoRooms)}
            notificationState={sdkContext.spaceStore.getNotificationState(MetaSpace.VideoRooms)}
            size="32px"
            icon={<VideoCallSolidIcon />}
        />
    );
};

const CreateSpaceButton: React.FC<Pick<IInnerSpacePanelProps, "isPanelCollapsed" | "setPanelCollapsed">> = ({
    isPanelCollapsed,
    setPanelCollapsed,
}) => {
    const [menuDisplayed, handle, openMenu, closeMenu] = useContextMenu<HTMLDivElement>();

    useEffect(() => {
        if (!isPanelCollapsed && menuDisplayed) {
            closeMenu();
        }
    }, [isPanelCollapsed]); // eslint-disable-line react-hooks/exhaustive-deps

    let contextMenu: JSX.Element | undefined;
    if (menuDisplayed) {
        contextMenu = <SpaceCreateMenu onFinished={closeMenu} />;
    }

    const onNewClick = menuDisplayed
        ? closeMenu
        : () => {
              if (!isPanelCollapsed) setPanelCollapsed(true);
              openMenu();
          };

    return (
        <li
            className={classNames("mx_SpaceItem mx_SpaceItem_new", {
                collapsed: isPanelCollapsed,
            })}
            role="treeitem"
            aria-selected={false}
        >
            <SpaceButton
                data-testid="create-space-button"
                className={classNames("mx_SpaceButton_new", {
                    mx_SpaceButton_newCancel: menuDisplayed,
                })}
                label={menuDisplayed ? _t("action|cancel") : _t("create_space|label")}
                onClick={onNewClick}
                isNarrow={isPanelCollapsed}
                innerRef={handle}
                size="32px"
                icon={<PlusIcon />}
            />

            {contextMenu}
        </li>
    );
};

/**
 * Fragment X (`fragment_x.servers_entry`): the Servers entry, a grid icon above the servers, after a divider. It opens Home
 * on the Servers tab, where the servers are listed and Create a space and Discover are.
 */
const ServersEntry: React.FC<{ isPanelCollapsed: boolean; selected: boolean }> = ({ isPanelCollapsed, selected }) => {
    const sdkContext = useContext(SDKContext);
    const [tab, setTab] = useHomeTab();
    // With the Messages entry, the rooms that are in no space are listed under Servers as "Other rooms".
    const messages = isMessagesEntry();
    const allHomeRooms = useHomeRooms(messages);
    const otherRooms = messages ? partitionHomeRooms(allHomeRooms).others : [];

    return (
        <>
            <li className="mx_SpacePanel_dividerItem" role="presentation">
                <hr className="mx_SpacePanel_divider" />
            </li>
            <li
                // narrow, not collapsed: collapsed hides the rooms listed under the entry
                className={classNames("mx_SpaceItem", { mx_SpaceItem_narrow: isPanelCollapsed })}
                role="treeitem"
                aria-selected={selected && tab === "servers"}
            >
                <SpaceButton
                    data-testid="servers-entry"
                    label={_t("fragment_x|servers")}
                    selected={selected && tab === "servers"}
                    isNarrow={isPanelCollapsed}
                    size="32px"
                    icon={<GridIcon />}
                    onClick={() => {
                        setTab("servers");
                        sdkContext.spaceStore.setActiveSpace(MetaSpace.Home);
                        defaultDispatcher.fire(Action.ViewHomePage);
                    }}
                />
                {otherRooms.length > 0 && (
                    <ul className="mx_SpaceTreeLevel" role="group" aria-label={_t("common|orphan_rooms")}>
                        {!isPanelCollapsed && (
                            <li className="mx_SpaceRoomGroupLabel" role="presentation">
                                {_t("common|orphan_rooms")}
                            </li>
                        )}
                        <HomeRoomRows rooms={otherRooms} isNarrow={isPanelCollapsed} />
                    </ul>
                )}
            </li>
        </>
    );
};

const metaSpaceComponentMap: Record<MetaSpace, typeof HomeButton> = {
    [MetaSpace.Home]: HomeButton,
    [MetaSpace.Orphans]: OrphansButton,
    [MetaSpace.VideoRooms]: VideoRoomsButton,
};

interface IInnerSpacePanelProps extends DroppableProvidedProps {
    children?: ReactNode;
    isPanelCollapsed: boolean;
    setPanelCollapsed: Dispatch<SetStateAction<boolean>>;
    isDraggingOver: boolean;
    innerRef: RefCallback<HTMLElement>;
}

// Optimisation based on https://github.com/atlassian/react-beautiful-dnd/blob/master/docs/api/droppable.md#recommended-droppable--performance-optimisation
const InnerSpacePanel = React.memo<IInnerSpacePanelProps>(
    ({ children, isPanelCollapsed, setPanelCollapsed, isDraggingOver, innerRef, ...props }) => {
        const sdkContext = useContext(SDKContext);
        const [invites, metaSpaces, actualSpaces, activeSpace] = useSpaces();
        const activeSpaces = activeSpace ? [activeSpace] : [];

        const moduleSpaceItems = useModuleSpacePanelItems(ModuleApi.instance.extras);

        const metaSpacesSection = metaSpaces
            .filter((key) => !(key === MetaSpace.VideoRooms && !SettingsStore.getValue("feature_video_rooms")))
            .map((key) => {
                const Component = metaSpaceComponentMap[key];
                return <Component key={key} selected={activeSpace === key} isPanelCollapsed={isPanelCollapsed} />;
            });

        return (
            <IndicatorScrollbar
                {...props}
                wrappedRef={innerRef}
                className="mx_SpaceTreeLevel"
                style={
                    isDraggingOver
                        ? {
                              pointerEvents: "none",
                          }
                        : undefined
                }
                as="ul"
                role="tree"
                aria-label={_t("common|spaces")}
            >
                {metaSpacesSection}
                {invites.map((s) => (
                    <SpaceItem
                        key={s.roomId}
                        space={s}
                        activeSpaces={activeSpaces}
                        isPanelCollapsed={isPanelCollapsed}
                        onExpand={() => setPanelCollapsed(false)}
                    />
                ))}
                {SdkConfig.get().fragment_x?.servers_entry && (
                    <ServersEntry isPanelCollapsed={isPanelCollapsed} selected={activeSpace === MetaSpace.Home} />
                )}
                {actualSpaces.map((s, i) => (
                    <Draggable key={s.roomId} draggableId={s.roomId} index={i}>
                        {(provided, snapshot) => (
                            <SpaceItem
                                {...provided.draggableProps}
                                dragHandleProps={provided.dragHandleProps}
                                key={s.roomId}
                                innerRef={provided.innerRef}
                                className={snapshot.isDragging ? "mx_SpaceItem_dragging" : undefined}
                                space={s}
                                activeSpaces={activeSpaces}
                                isPanelCollapsed={isPanelCollapsed}
                                onExpand={() => setPanelCollapsed(false)}
                            />
                        )}
                    </Draggable>
                ))}
                {children}
                {moduleSpaceItems.map((item) => (
                    <li
                        key={item.spaceKey}
                        className={classNames("mx_SpaceItem", {
                            collapsed: isPanelCollapsed,
                        })}
                        role="treeitem"
                        aria-selected={false} // TODO
                    >
                        <SpaceButton
                            {...item}
                            isNarrow={isPanelCollapsed}
                            size="32px"
                            selected={activeSpace === item.spaceKey}
                            onClick={() => {
                                sdkContext.spaceStore.setActiveSpace(item.spaceKey);
                                item.onSelected?.();
                            }}
                        />
                    </li>
                ))}
                {shouldShowComponent(UIComponent.CreateSpaces) && !SdkConfig.get().fragment_x?.servers_entry && (
                    <CreateSpaceButton isPanelCollapsed={isPanelCollapsed} setPanelCollapsed={setPanelCollapsed} />
                )}
            </IndicatorScrollbar>
        );
    },
);

const SpacePanel: React.FC = () => {
    const sdkContext = useContext(SDKContext);
    const client = sdkContext.client!;
    const [dragging, setDragging] = useState(false);
    const [isPanelCollapsed, setPanelCollapsed] = useState(true);
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (ref.current) UIStore.instance.trackElementDimensions("SpacePanel", ref.current);
        return () => UIStore.instance.stopTrackingElementDimensions("SpacePanel");
    }, []);

    useDispatcher(defaultDispatcher, (payload: ActionPayload) => {
        if (payload.action === Action.ToggleSpacePanel) {
            setPanelCollapsed(!isPanelCollapsed);
        }
    });

    const userMenuVm = useCreateAutoDisposedViewModel(
        () =>
            new UserMenuViewModel(
                { ownProfileStore: OwnProfileStore.instance },
                defaultDispatcher,
                client,
                isPanelCollapsed,
            ),
    );

    useDispatcher(defaultDispatcher, (payload) => {
        if (payload.action === Action.ToggleUserMenu) {
            userMenuVm.setOpen(!userMenuVm.getSnapshot().open);
        }
    });

    useEffect(() => {
        userMenuVm.setExpanded(!isPanelCollapsed);
    }, [userMenuVm, isPanelCollapsed]);

    return (
        <RovingTabIndexProvider handleHomeEnd handleUpDown={!dragging}>
            {({ onKeyDownHandler, onDragEndHandler }) => (
                <DragDropContext
                    onDragStart={() => {
                        setDragging(true);
                    }}
                    onDragEnd={(result) => {
                        setDragging(false);
                        if (!result.destination) return; // dropped outside the list
                        sdkContext.spaceStore.moveRootSpace(result.source.index, result.destination.index);
                        onDragEndHandler();
                    }}
                >
                    <nav
                        className={classNames("mx_SpacePanel", {
                            collapsed: isPanelCollapsed,
                            // Fragment X: the rail is the whole navigation, with the rooms listed under their spaces.
                            mx_SpacePanel_unified: isUnifiedTree(),
                        })}
                        onKeyDown={(ev) => {
                            const navAction = getKeyBindingsManager().getNavigationAction(ev);
                            if (
                                navAction === KeyBindingAction.NextLandmark ||
                                navAction === KeyBindingAction.PreviousLandmark
                            ) {
                                LandmarkNavigation.findAndFocusNextLandmark(
                                    Landmark.ACTIVE_SPACE_BUTTON,
                                    navAction === KeyBindingAction.PreviousLandmark,
                                );
                                ev.stopPropagation();
                                ev.preventDefault();
                                return;
                            }
                            onKeyDownHandler(ev);
                        }}
                        ref={ref}
                        aria-label={_t("common|spaces")}
                    >
                        {!SdkConfig.get().fragment_x?.user_panel && (
                            <UserMenu vm={userMenuVm} className="mx_UserMenu" />
                        )}
                        {/* Fragment X unified tree: the larger button under Search expands and collapses the rail, so the
                            round chevron on the edge would be a second button for the same thing. */}
                        {!isUnifiedTree() && (
                            <AccessibleButton
                                className={classNames("mx_SpacePanel_toggleCollapse", {
                                    expanded: !isPanelCollapsed,
                                })}
                                onClick={() => setPanelCollapsed(!isPanelCollapsed)}
                                title={isPanelCollapsed ? _t("action|expand") : _t("action|collapse")}
                                caption={
                                    <KeyboardShortcut
                                        value={{ ctrlOrCmdKey: true, shiftKey: true, key: "d" }}
                                        className="mx_SpacePanel_Tooltip_KeyboardShortcut"
                                    />
                                }
                            >
                                <ChevronRightIcon />
                            </AccessibleButton>
                        )}
                        <RailSearchButton isPanelCollapsed={isPanelCollapsed} />
                        <RoomListToggleButton isPanelCollapsed={isPanelCollapsed} />
                        <Droppable droppableId="top-level-spaces">
                            {(provided, snapshot) => (
                                <InnerSpacePanel
                                    {...provided.droppableProps}
                                    isPanelCollapsed={isPanelCollapsed}
                                    setPanelCollapsed={setPanelCollapsed}
                                    isDraggingOver={snapshot.isDraggingOver}
                                    innerRef={provided.innerRef}
                                >
                                    {provided.placeholder}
                                </InnerSpacePanel>
                            )}
                        </Droppable>

                        <ThreadsActivityCentre displayButtonLabel={!isPanelCollapsed} />

                        {/* Fragment X: the user panel's gear opens the settings, so with the unified tree and the user
                            panel the quick settings entry above it would be a second settings button. */}
                        {!(isUnifiedTree() && SdkConfig.get().fragment_x?.user_panel) && (
                            <QuickSettingsButton isPanelCollapsed={isPanelCollapsed} />
                        )}
                        {isUnifiedTree() && <UserPanel compact={isPanelCollapsed} />}
                    </nav>
                </DragDropContext>
            )}
        </RovingTabIndexProvider>
    );
};

export default SpacePanel;
