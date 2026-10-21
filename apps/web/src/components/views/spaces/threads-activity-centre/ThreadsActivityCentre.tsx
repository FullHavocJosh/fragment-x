/*
 * Copyright 2024 New Vector Ltd.
 * Copyright 2024 The Matrix.org Foundation C.I.C.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX, useMemo, useState } from "react";
import { Menu, MenuItem, NavBar, NavItem, Text } from "@vector-im/compound-web";
import { ChevronDownIcon, ChevronRightIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { NotificationDecoration, type NotificationDecorationData } from "@element-hq/web-shared-components";

import { ThreadsActivityCentreButton } from "./ThreadsActivityCentreButton";
import { _t } from "../../../../languageHandler";
import DecoratedRoomAvatar from "../../avatars/DecoratedRoomAvatar";
import { Action } from "../../../../dispatcher/actions";
import defaultDispatcher from "../../../../dispatcher/dispatcher";
import { type ViewRoomPayload } from "../../../../dispatcher/payloads/ViewRoomPayload";
import RightPanelStore from "../../../../stores/right-panel/RightPanelStore";
import { RightPanelPhases } from "../../../../stores/right-panel/RightPanelStorePhases";
import { type ThreadData, type UnreadThreadRooms, useUnreadThreadRooms } from "./useUnreadThreadRooms";
import { NotificationLevel } from "../../../../stores/notifications/NotificationLevel";
import { MessagePreviewStore } from "../../../../stores/message-preview/MessagePreviewStore";
import { getSenderName } from "../../../../stores/message-preview/previews/utils";
import PosthogTrackers from "../../../../PosthogTrackers";
import { getKeyBindingsManager } from "../../../../KeyBindingsManager";
import { KeyBindingAction } from "../../../../accessibility/KeyboardShortcuts";
import SdkConfig from "../../../../SdkConfig";
import { useMatrixClientContext } from "../../../../contexts/MatrixClientContext";
import { type MentionRoom, useMentionRooms } from "./useMentionRooms";
import { type ForYouItem, buildForYou, forYouKey, forYouRoom, forYouRooms, unreadPreviewEvents } from "./forYou";
import { clearRoomNotification } from "../../../../utils/notifications";
import AccessibleButton from "../../elements/AccessibleButton";

interface ThreadsActivityCentreProps {
    /**
     * Display the `Treads` label next to the icon.
     */
    displayButtonLabel?: boolean;
}

/**
 * The two views available in the Threads Activity Centre popup.
 */
type TACView = "for_you" | "mentions" | "my_threads" | "other_threads";

/**
 * Get the threads to display for the active tab, and the caption shown when that tab is empty.
 * @param view - the active tab
 * @param unreadThreadRooms - the unread threads, as returned by {@link useUnreadThreadRooms}
 */
function getActiveTabContent(
    view: TACView,
    unreadThreadRooms: UnreadThreadRooms,
): { threads: ThreadData[]; emptyCaption: string } {
    if (view === "my_threads") {
        return {
            threads: unreadThreadRooms.participatingThreads,
            emptyCaption: _t("threads_activity_centre|no_participating_threads_unread"),
        };
    }

    return {
        threads: unreadThreadRooms.otherThreads,
        emptyCaption: _t("threads_activity_centre|no_other_unread_threads"),
    };
}

/**
 * Display in a popup the list of rooms with unread threads.
 * The popup is displayed when the user clicks on the `Threads` button.
 */
export function ThreadsActivityCentre({ displayButtonLabel }: ThreadsActivityCentreProps): JSX.Element {
    const [open, setOpen] = useState(false);
    // Fragment X: with inbox_mentions the panel starts on a Mentions tab, the rooms where the user was mentioned. With
    // inbox_for_you it is the inbox: a For you tab merging those with the threads the user took part in, an Unread
    // threads tab, and Mark all read.
    const forYouEnabled = Boolean(SdkConfig.get().fragment_x?.inbox_for_you);
    const mentionsEnabled = Boolean(SdkConfig.get().fragment_x?.inbox_mentions) || forYouEnabled;
    const [view, setView] = useState<TACView>(forYouEnabled ? "for_you" : mentionsEnabled ? "mentions" : "my_threads");
    const cli = useMatrixClientContext();
    const mentionRooms = useMentionRooms(cli, mentionsEnabled);
    const threadRooms = useUnreadThreadRooms(open);
    const roomsAndNotifications = {
        ...threadRooms,
        // A mention anywhere lights the button like a mention in a thread does.
        greatestNotificationLevel:
            mentionRooms.length > 0 ? NotificationLevel.Highlight : threadRooms.greatestNotificationLevel,
    };

    const { threads: activeThreads, emptyCaption: activeEmptyCaption } = getActiveTabContent(
        view === "mentions" || view === "for_you" ? "my_threads" : view,
        roomsAndNotifications,
    );
    const forYou = useMemo(
        () => (forYouEnabled ? buildForYou(mentionRooms, threadRooms.participatingThreads) : []),
        [forYouEnabled, mentionRooms, threadRooms.participatingThreads],
    );
    const markAllRead = (): void => {
        void Promise.all(forYouRooms(forYou).map((room) => clearRoomNotification(room, cli)));
    };
    const inboxLabel = forYouEnabled ? _t("fragment_x|inbox") : undefined;

    return (
        <div
            className="mx_ThreadsActivityCentre_container"
            onKeyDown={(evt) => {
                // Do nothing if the TAC is closed
                if (!open) return;

                const action = getKeyBindingsManager().getNavigationAction(evt);

                // Block spotlight opening
                if (action === KeyBindingAction.FilterRooms) {
                    evt.stopPropagation();
                }
            }}
        >
            <Menu
                className="mx_ThreadsActivityCentre_menu"
                align="start"
                side="top"
                open={open}
                onOpenChange={(newOpen) => {
                    // Track only when the Threads Activity Centre is opened
                    if (newOpen) PosthogTrackers.trackInteraction("WebThreadsActivityCentreButton");

                    setOpen(newOpen);
                }}
                title={inboxLabel ?? _t("threads_activity_centre|header")}
                showTitle={false}
                trigger={
                    <ThreadsActivityCentreButton
                        label={inboxLabel}
                        displayLabel={displayButtonLabel}
                        notificationLevel={roomsAndNotifications.greatestNotificationLevel}
                    />
                }
            >
                {/* Tab toggle: My threads | Other threads */}
                <NavBar
                    className="mx_ThreadsActivityCentre_tabs"
                    role="tablist"
                    aria-label={inboxLabel ?? _t("threads_activity_centre|header")}
                >
                    {forYouEnabled && (
                        <NavItem
                            aria-controls="mx_ThreadsActivityCentre_panel"
                            active={view === "for_you"}
                            onClick={() => setView("for_you")}
                        >
                            {_t("fragment_x|for_you")}
                        </NavItem>
                    )}
                    {mentionsEnabled && !forYouEnabled && (
                        <NavItem
                            aria-controls="mx_ThreadsActivityCentre_panel"
                            active={view === "mentions"}
                            onClick={() => setView("mentions")}
                        >
                            {_t("fragment_x|inbox_mentions")}
                        </NavItem>
                    )}
                    {!forYouEnabled && (
                        <NavItem
                            aria-controls="mx_ThreadsActivityCentre_panel"
                            active={view === "my_threads"}
                            onClick={() => setView("my_threads")}
                        >
                            {_t("threads_activity_centre|my_threads_tab")}
                        </NavItem>
                    )}
                    <NavItem
                        aria-controls="mx_ThreadsActivityCentre_panel"
                        active={view === "other_threads"}
                        onClick={() => setView("other_threads")}
                    >
                        {forYouEnabled
                            ? _t("fragment_x|unread_threads")
                            : _t("threads_activity_centre|other_threads_tab")}
                    </NavItem>
                </NavBar>
                {/* Make the content of the pop-up scrollable */}
                <div id="mx_ThreadsActivityCentre_panel" role="tabpanel" className="mx_ThreadsActivityCentre_rows">
                    {view === "for_you" ? (
                        <>
                            {forYou.map((item) => (
                                <ForYouEntry key={forYouKey(item)} item={item} onClose={() => setOpen(false)} />
                            ))}
                            {forYou.length === 0 && (
                                <Text
                                    as="div"
                                    size="sm"
                                    weight="regular"
                                    className="mx_ThreadsActivityCentre_emptyCaption"
                                >
                                    {_t("fragment_x|inbox_empty")}
                                </Text>
                            )}
                        </>
                    ) : view === "mentions" ? (
                        <>
                            {mentionRooms.map((mention) => (
                                <MentionRoomRow
                                    key={mention.room.roomId}
                                    mention={mention}
                                    onClick={() => setOpen(false)}
                                />
                            ))}
                            {mentionRooms.length === 0 && (
                                <Text
                                    as="div"
                                    size="sm"
                                    weight="regular"
                                    className="mx_ThreadsActivityCentre_emptyCaption"
                                >
                                    {_t("fragment_x|no_mentions")}
                                </Text>
                            )}
                        </>
                    ) : (
                        <>
                            {activeThreads.map((threadData) => (
                                <ThreadsActivityCentreThreadRow
                                    key={`${threadData.room.roomId}:${threadData.thread.id}`}
                                    threadData={threadData}
                                    onClick={() => setOpen(false)}
                                />
                            ))}
                            {activeThreads.length === 0 && (
                                <Text
                                    as="div"
                                    size="sm"
                                    weight="regular"
                                    className="mx_ThreadsActivityCentre_emptyCaption"
                                >
                                    {activeEmptyCaption}
                                </Text>
                            )}
                        </>
                    )}
                </div>
                {view === "for_you" && (
                    <div className="mx_ThreadsActivityCentre_footer">
                        <AccessibleButton kind="link" disabled={forYou.length === 0} onClick={markAllRead}>
                            {_t("fragment_x|mark_all_read")}
                        </AccessibleButton>
                    </div>
                )}
            </Menu>
        </div>
    );
}

/**
 * Fragment X: a room the user was mentioned in, with the number of unread mentions; a click opens the room.
 */
function MentionRoomRow({ mention, onClick }: { mention: MentionRoom; onClick: () => void }): JSX.Element {
    const { room, count } = mention;
    return (
        <MenuItem
            className="mx_ThreadsActivityCentreThreadRow"
            label={null}
            hideChevron
            aria-label={_t("threads_activity_centre|a11y|mention_no_sender", { roomName: room.name, count })}
            Icon={<DecoratedRoomAvatar room={room} size="40px" />}
            onSelect={() => {
                onClick();
                defaultDispatcher.dispatch<ViewRoomPayload>({
                    action: Action.ViewRoom,
                    show_room_tile: true,
                    room_id: room.roomId,
                    metricsTrigger: "WebThreadsActivityCentre",
                });
            }}
        >
            <div className="mx_ThreadsActivityCentreThreadRow_content">
                <div className="mx_ThreadsActivityCentreThreadRow_header">
                    <Text as="span" size="md" weight="semibold" className="mx_ThreadsActivityCentreThreadRow_roomName">
                        {room.name}
                    </Text>
                </div>
            </div>
            <span
                className="mx_ThreadsActivityCentreThreadRow_decoration"
                data-notification-level="highlight"
                data-testid="mention-count"
            >
                <NotificationDecoration {...threadDecorationProps(NotificationLevel.Highlight, count, false)} />
            </span>
        </MenuItem>
    );
}

/**
 * Open a thread in its room's right panel and navigate to the room. Sets a two-card stack (thread list beneath the
 * thread view) so the thread view gets a working back button, mirroring the canonical Action.ShowThread path.
 */
function openThread({ thread, room }: ThreadData): void {
    if (thread.rootEvent) {
        RightPanelStore.instance.setCards(
            [
                { phase: RightPanelPhases.ThreadPanel },
                {
                    phase: RightPanelPhases.ThreadView,
                    state: { threadHeadEvent: thread.rootEvent },
                },
            ],
            true,
            room.roomId,
        );
    }

    defaultDispatcher.dispatch<ViewRoomPayload>({
        action: Action.ViewRoom,
        show_room_tile: true,
        room_id: room.roomId,
        metricsTrigger: "WebThreadsActivityCentre",
        focusNext: "threadsPanel",
    });
}

/**
 * Fragment X: one conversation of the inbox's For you tab with a button that expands it to the latest unread messages, so
 * they can be read without leaving the panel. A preview opens the conversation: the message in its room, or the thread.
 */
function ForYouEntry({ item, onClose }: { item: ForYouItem; onClose: () => void }): JSX.Element {
    const cli = useMatrixClientContext();
    const [expanded, setExpanded] = useState(false);
    const previews = expanded ? unreadPreviewEvents(item, cli.getSafeUserId()) : [];
    const room = forYouRoom(item);

    const openPreview = (event: MatrixEvent): void => {
        onClose();
        if (item.kind === "thread") {
            openThread(item.thread);
        } else {
            defaultDispatcher.dispatch<ViewRoomPayload>({
                action: Action.ViewRoom,
                show_room_tile: true,
                room_id: room.roomId,
                event_id: event.getId(),
                highlighted: true,
                metricsTrigger: "WebThreadsActivityCentre",
            });
        }
    };

    return (
        <div className="mx_ThreadsActivityCentre_entry">
            <div className="mx_ThreadsActivityCentre_entryRow">
                <div className="mx_ThreadsActivityCentre_entryMain">
                    {item.kind === "thread" ? (
                        <ThreadsActivityCentreThreadRow threadData={item.thread} onClick={onClose} />
                    ) : (
                        <MentionRoomRow mention={item.mention} onClick={onClose} />
                    )}
                </div>
                <AccessibleButton
                    className="mx_ThreadsActivityCentre_expand"
                    aria-expanded={expanded}
                    aria-label={_t("fragment_x|inbox_preview_toggle", { roomName: room.name })}
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                </AccessibleButton>
            </div>
            {expanded && (
                <ul className="mx_ThreadsActivityCentre_previews">
                    {previews.map((event) => (
                        <li key={event.getId()}>
                            <AccessibleButton
                                className="mx_ThreadsActivityCentre_preview"
                                onClick={() => openPreview(event)}
                            >
                                <span className="mx_ThreadsActivityCentre_previewSender">{getSenderName(event)}</span>
                                <span className="mx_ThreadsActivityCentre_previewText">
                                    {MessagePreviewStore.instance.generatePreviewForEvent(event)}
                                </span>
                            </AccessibleButton>
                        </li>
                    ))}
                    {previews.length === 0 && (
                        <li className="mx_ThreadsActivityCentre_previewEmpty">{_t("fragment_x|inbox_no_preview")}</li>
                    )}
                </ul>
            )}
        </div>
    );
}

interface ThreadsActivityThreadRow {
    /**
     * The thread data including the thread, room, and notification level.
     */
    threadData: ThreadData;
    /**
     * Callback when the user clicks on the row.
     */
    onClick: () => void;
}

/**
 * Map a thread's unread state onto the notification decoration shared with the room list, so a
 * mention, a counted notification and bare activity are told apart by shape and not only by colour.
 *
 * The levels are mutually exclusive, mirroring {@link RoomNotificationState}'s `isMention` /
 * `isNotification` / `isActivityNotification` getters.
 *
 * @param level - the thread's notification level
 * @param count - the server-reported notification count, 0 for a local-only unread
 * @param muted - whether the thread's room is muted
 */
export function threadDecorationProps(
    level: NotificationLevel,
    count: number,
    muted: boolean,
): NotificationDecorationData {
    return {
        // Rows only exist for threads we have already decided are unread.
        hasAnyNotificationOrActivity: true,
        isMention: level === NotificationLevel.Highlight,
        isNotification: level === NotificationLevel.Notification,
        isActivityNotification: level === NotificationLevel.Activity,
        hasUnreadCount: count > 0,
        count,
        muted,
        // evaluateThreadUnread never yields NotificationLevel.Unsent, and threads can't be invites.
        isUnsentMessage: false,
        invited: false,
    };
}

/**
 * The `data-notification-level` marker for a thread row, used by tests as the decoration itself
 * exposes no per-level attribute. Mirrors `NotificationBadgeView`'s values.
 */
function notificationLevelMarker(level: NotificationLevel): "highlight" | "notification" | undefined {
    if (level === NotificationLevel.Highlight) return "highlight";
    if (level === NotificationLevel.Notification) return "notification";
    return undefined;
}

/**
 * Build a thread row's accessible name from its room, root message and unread state. The row sets
 * its own `aria-label`, which overrides its content, so the visible counter would otherwise go
 * unannounced. Each state is a single translated sentence, as word order depends on the language.
 * Mirrors `getA11yLabel` in the room list.
 */
function getThreadA11yLabel(
    roomName: string,
    sender: string,
    preview: string,
    level: NotificationLevel,
    count: number,
): string {
    const isMention = level === NotificationLevel.Highlight && count > 0;
    // Without a root event there is no sender nor preview to announce, only the room.
    if (!sender) {
        if (isMention) return _t("threads_activity_centre|a11y|mention_no_sender", { roomName, count });
        if (count > 0) return _t("threads_activity_centre|a11y|unread_no_sender", { roomName, count });
        return _t("threads_activity_centre|a11y|default_no_sender", { roomName });
    }
    if (isMention) return _t("threads_activity_centre|a11y|mention", { roomName, sender, preview, count });
    if (count > 0) return _t("threads_activity_centre|a11y|unread", { roomName, sender, preview, count });
    return _t("threads_activity_centre|a11y|default", { roomName, sender, preview });
}

/**
 * Display an unread thread the user has participated in.
 */
function ThreadsActivityCentreThreadRow({ threadData, onClick }: ThreadsActivityThreadRow): JSX.Element {
    const { thread, room, notificationLevel, notificationCount, muted } = threadData;

    const rootEvent = thread.rootEvent;
    // getSenderName resolves the disambiguated member name, falling back to the raw user ID.
    const senderName = rootEvent ? getSenderName(rootEvent) : "";
    // Let the shared preview store render the message text — it handles edits, replies,
    // emotes, HTML and non-message event types consistently with the room list.
    const previewText = rootEvent ? MessagePreviewStore.instance.generatePreviewForEvent(rootEvent) : "";

    return (
        <MenuItem
            className="mx_ThreadsActivityCentreThreadRow"
            // label={null} renders no label span; aria-label provides the accessible name.
            label={null}
            // The design uses the notification decoration as the only trailing affordance.
            hideChevron
            aria-label={getThreadA11yLabel(room.name, senderName, previewText, notificationLevel, notificationCount)}
            Icon={<DecoratedRoomAvatar room={room} size="40px" />}
            onSelect={(event: Event) => {
                onClick();
                openThread(threadData);

                // Track the click
                PosthogTrackers.trackInteraction("WebThreadsActivityCentreRoomItem", event);
            }}
        >
            <div className="mx_ThreadsActivityCentreThreadRow_content">
                <div className="mx_ThreadsActivityCentreThreadRow_header">
                    <Text as="span" size="md" weight="semibold" className="mx_ThreadsActivityCentreThreadRow_roomName">
                        {room.name}
                    </Text>
                </div>
                {(senderName || previewText) && (
                    <Text as="span" size="sm" weight="regular" className="mx_ThreadsActivityCentreThreadRow_preview">
                        {senderName && (
                            <Text
                                as="span"
                                size="sm"
                                weight="medium"
                                className="mx_ThreadsActivityCentreThreadRow_sender"
                            >
                                {`${senderName}: `}
                            </Text>
                        )}
                        {previewText}
                    </Text>
                )}
            </div>
            {/* The decoration takes no extra props, so the marker for tests lives on a wrapper. */}
            <span
                className="mx_ThreadsActivityCentreThreadRow_decoration"
                data-notification-level={notificationLevelMarker(notificationLevel)}
            >
                <NotificationDecoration {...threadDecorationProps(notificationLevel, notificationCount, muted)} />
            </span>
        </MenuItem>
    );
}
