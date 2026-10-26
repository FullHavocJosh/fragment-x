/*
Copyright 2024 New Vector Ltd.
Copyright 2019-2022 The Matrix.org Foundation C.I.C.
Copyright 2016 OpenMarket Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type ResolveDefaults, type WebConfigJson } from "shared-types";

import { type ValidatedServerConfig } from "./utils/ValidatedServerConfig";
import { type DEFAULTS } from "./SdkConfig.ts";

/**
 * Bug reports are enabled but must only be locally
 * downloadable.
 */
export const BugReportEndpointURLLocal = "local";

export interface ConfigOptions extends WebConfigJson {
    /**
     * This is not a real config field, we're just abusing the config structure to pass around a validated server config
     */
    validated_server_config?: ValidatedServerConfig;

    /**
     * Fragment X options.
     */
    fragment_x?: {
        /**
         * When true, a room that has no saved right panel state opens with the member list. A panel the user has
         * opened or closed in a room keeps that state.
         */
        member_list_default_open?: boolean;
        /**
         * When true, the space panel collapses to icons and the right panel closes when the window gets narrower than
         * 1100px, and a room does not open its panel by default while the window is that narrow.
         */
        narrow_collapse?: boolean;
        /**
         * When true, the space panel (server rail) shows a search button that opens the spotlight search.
         */
        rail_search_button?: boolean;
        /**
         * When true, the space panel shows a button that collapses or expands the room list.
         */
        room_list_toggle_button?: boolean;
        /**
         * When true, the room list column ends in a user panel (avatar, name, menu, settings, and a microphone
         * button during a call), and the space panel no longer shows the user menu.
         */
        user_panel?: boolean;
        /**
         * When true (with `user_panel`), the settings entry is in the menu of the user's avatar and the user panel has no
         * settings button.
         */
        settings_in_user_menu?: boolean;
        /**
         * When true, the Inbox button is not in the server rail: the user menu has an Inbox item, with a dot while the
         * inbox has something in it, that opens the inbox.
         */
        inbox_in_user_menu?: boolean;
        /**
         * When true, Home is titled "Direct Messages" and lists only direct messages by default (the People filter is
         * applied when Home opens and can be switched off).
         */
        home_direct_messages?: boolean;
        /**
         * When true, the Home page gets a top bar with People, Pending and Blocked tabs, an Add Friend button, and new
         * group chat and help buttons.
         */
        home_top_bar?: boolean;
        /**
         * When true, double clicking a message starts a reply to it (links, media and controls in the message keep
         * their own behaviour).
         */
        double_click_reply?: boolean;
        /**
         * When true, the member list groups members under collapsible role headings (owner, admin, moderator, members)
         * and highlights the user's own entry.
         */
        member_list_roles?: boolean;
        /**
         * When true, the room list sections are Discord-style: the favourites section is titled "Pinned", the people
         * section "Direct Messages", and section headings are small capitals.
         */
        discord_sections?: boolean;
        /**
         * When true, Appearance settings has a Colours section where the user picks the accent, server rail and panel
         * colours; they are saved in the account and applied on top of the theme.
         */
        colour_editor?: boolean;
        /**
         * When true, the Threads activity centre in the rail gets a Mentions tab, listing the rooms with unread mentions
         * with a counter each; a click opens the room. Muted rooms are left out.
         */
        inbox_mentions?: boolean;
        /**
         * When true, the server rail is the whole navigation: the rooms of each space are listed under it in one tree and
         * the room list column is gone. The rail's expand and collapse button shows or hides the names.
         */
        unified_tree?: boolean;
        /**
         * When true, the Threads activity centre in the rail is the inbox: it is called Inbox, opens on a For you tab
         * that merges the rooms with unread mentions and the unread threads the user took part in (newest first, one
         * collapsed row each with a counter), has an Unread threads tab, and a Mark all read button.
         */
        inbox_for_you?: boolean;
        /**
         * When true, the room header has one Room info button: the room name. The separate info icon, which does the same,
         * is not shown.
         */
        single_room_info_button?: boolean;
        /**
         * When true, the context menu of a space has Mute server and Unmute server. Muting mutes every joined room of the
         * space and its sub-spaces and remembers each room's notification state in account data; unmuting puts them back.
         */
        mute_server?: boolean;
        /**
         * When true, a room in the rail tree has Element's room menu (mark read or unread, favourite, low priority,
         * invite, copy link, leave) on right click and on a button that shows on hover, and the room header has a
         * notification bell with the room's notification settings. The room list column, which had both, is not there.
         */
        room_context_menu?: boolean;
        /**
         * When true, the room's top bar has the colour of the server rail (one frame around the chat; the colour editor's
         * Server rail colour sets both), every icon in the rail, the room header and the composer is a 24px glyph in a 32px
         * button, spaces, subspaces and rooms in the rail all have the same 32px icon, and every icon in the rail is
         * centred on one axis (no indent; an open space and its rows share a highlight, and each open subspace has a
         * second one inset in it).
         */
        unified_frame?: boolean;
        /**
         * When true, the rail has a Servers entry (a grid icon) above the servers, after a divider, instead of the plus
         * button below them. It opens Home on the Servers tab, where the servers are listed and Create a space and
         * Discover are.
         */
        servers_entry?: boolean;
        /**
         * When true (needs `unified_tree`), Home is called Messages in the rail, with a chat icon, and lists only the
         * direct messages, each with its latest message as a second line. The rooms that are in no space are listed
         * under the Servers entry (needs `servers_entry`) as Other rooms.
         */
        messages_entry?: boolean;
        /**
         * When true (needs `messages_entry`), Messages in the rail lists the pinned direct messages first and the unread
         * ones under them (and the one that is open), and a click on Messages shows all of them on the Home page. A pin
         * button in the room header of a direct message pins it (the room's favourite tag, so it is the same in every
         * client).
         */
        pinned_messages?: boolean;
        /**
         * When true, the user panel shows a dot on the user's avatar and, when expanded, a line under the name (Online or
         * Idle) while the homeserver reports the user as online or idle. A server without presence, or an offline user,
         * shows nothing.
         */
        user_presence?: boolean;
        /**
         * When true, the room header has the icons of Discord's: one for the pinned messages (not in a direct message,
         * which has the pin for the conversation), one that searches the room, and one at the right end that shows or hides
         * the side panel, whatever it holds.
         */
        header_icons?: boolean;
        /**
         * When true, the chat has three touches of Discord's: the time beside the name of the sender (in the first message
         * of a group; the following messages keep the time on hover), the date between days is a centred pill, and the
         * attachment button is a plus at the left of the composer.
         */
        chat_cosmetics?: boolean;
        /**
         * When true (needs `home_top_bar`), the people tab of the Home page has a column beside the list, Active Now,
         * with the people the user has a direct chat with who are online or idle. It is left out when the homeserver has no
         * presence.
         */
        active_now?: boolean;
        /**
         * When true, a server (space) with unread messages has a small pill on the left edge of its row and, in the
         * expanded rail, a line under its name such as "3 new messages in 2 rooms". Muted rooms count for nothing.
         */
        server_unread?: boolean;
        /**
         * When true (and `klipy_app_key` is set), the composer has a GIF button that searches Klipy and posts the
         * chosen GIF as a link message that shows inline in Fragment X.
         */
        gif_picker?: boolean;
        /**
         * The Klipy API app key for `gif_picker`. It is public in the client, as Klipy requires requests to come from
         * the user's browser.
         */
        klipy_app_key?: string;
        /**
         * When true, the call button in the room header that sends a call to the floating window is called Float call
         * (and Return to call) and has its own icon, and a call can be popped out into a separate window.
         */
        call_popout?: boolean;
        /**
         * When true (with `unified_frame` and `unified_tree`), the server rail keeps what the user opened and closed:
         * opening a room or a conversation changes no space, and the selected row is a tab: the chat's colour, running
         * to the chat and curving into it.
         */
        rail_tab?: boolean;
        /**
         * When true (with `unified_frame` and `unified_tree`), the edge of the server rail can be dragged. Dragging in
         * collapses it to its icons, dragging out of the icons expands it, and it stops at the width where every name is on
         * one line. The Expand and Collapse button still works.
         */
        rail_resize?: boolean;
        /**
         * When true, phones use the web app: they are not sent to the mobile guide page, which asks for a native app, and
         * get no prompt to download one. The `/mobile` page is served either way.
         */
        mobile_web?: boolean;
    };
}

/**
 * Type representing the effective config.json structure after DEFAULTS has been merged in
 */
export type IConfigOptions = ResolveDefaults<ConfigOptions, typeof DEFAULTS>;
