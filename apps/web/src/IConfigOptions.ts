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
    };
}

/**
 * Type representing the effective config.json structure after DEFAULTS has been merged in
 */
export type IConfigOptions = ResolveDefaults<ConfigOptions, typeof DEFAULTS>;
