/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import classNames from "classnames";
import { SearchIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { IconButton, Text, Tooltip } from "@vector-im/compound-web";

import { _t } from "../../../languageHandler";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import SdkConfig from "../../../SdkConfig";

/**
 * Fragment X: a search button at the top of the space panel that opens the spotlight search, so the global search is
 * part of the main navigation. Only shown with the `fragment_x.rail_search_button` config option.
 */
const RailSearchButton: React.FC<{
    isPanelCollapsed: boolean;
}> = ({ isPanelCollapsed }): JSX.Element | null => {
    if (!SdkConfig.get().fragment_x?.rail_search_button) return null;

    let button = (
        <IconButton
            aria-label={_t("action|search")}
            className={classNames("mx_RailSearchButton", { expanded: !isPanelCollapsed })}
            onClick={() => defaultDispatcher.fire(Action.OpenSpotlight)}
        >
            <>
                <SearchIcon />
                {!isPanelCollapsed && (
                    <Text className="mx_RailSearchButton_label" as="span" size="md">
                        {_t("action|search")}
                    </Text>
                )}
            </>
        </IconButton>
    );

    if (isPanelCollapsed) {
        button = (
            <Tooltip label={_t("action|search")} placement="right">
                {button}
            </Tooltip>
        );
    }

    return button;
};

export default RailSearchButton;
