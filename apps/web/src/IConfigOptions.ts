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
    };
}

/**
 * Type representing the effective config.json structure after DEFAULTS has been merged in
 */
export type IConfigOptions = ResolveDefaults<ConfigOptions, typeof DEFAULTS>;
