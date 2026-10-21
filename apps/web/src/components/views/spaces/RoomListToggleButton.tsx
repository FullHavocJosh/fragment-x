/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import classNames from "classnames";
import { LeftPanelCloseIcon, LeftPanelOpenIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { IconButton, Text, Tooltip } from "@vector-im/compound-web";

import { _t } from "../../../languageHandler";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import SdkConfig from "../../../SdkConfig";
import { useSettingValue } from "../../../hooks/useSettings";
import { isUnifiedTree } from "./SpaceRoomRows";
import { KeyboardShortcut } from "../settings/KeyboardShortcut";

/**
 * Fragment X: a button in the space panel that collapses or expands the room list next to it, so the chat can use the
 * full width. Only shown with the `fragment_x.room_list_toggle_button` config option.
 */
const RoomListToggleButton: React.FC<{
    isPanelCollapsed: boolean;
}> = ({ isPanelCollapsed }): JSX.Element | null => {
    const roomListCollapsed = useSettingValue("RoomList.isPanelCollapsed");
    if (!SdkConfig.get().fragment_x?.room_list_toggle_button) return null;

    // With the unified tree there is no room list column: the button expands and collapses the rail itself, which
    // shows or hides the names of the spaces and rooms.
    const unified = isUnifiedTree();
    const isRoomListCollapsed = unified ? isPanelCollapsed : roomListCollapsed;
    const label = isRoomListCollapsed ? _t("action|expand") : _t("action|collapse");
    let button = (
        <IconButton
            aria-label={label}
            className={classNames("mx_RailButton", { expanded: !isPanelCollapsed })}
            onClick={() => defaultDispatcher.fire(unified ? Action.ToggleSpacePanel : Action.ToggleRoomListPanel)}
        >
            <>
                {isRoomListCollapsed ? <LeftPanelOpenIcon /> : <LeftPanelCloseIcon />}
                {!isPanelCollapsed && (
                    <Text className="mx_RailButton_label" as="span" size="md">
                        {label}
                    </Text>
                )}
            </>
        </IconButton>
    );

    if (isPanelCollapsed) {
        button = (
            <Tooltip
                label={label}
                placement="right"
                // With the unified tree this button is the only one that expands the rail, so it shows the shortcut.
                caption={
                    unified ? <KeyboardShortcut value={{ ctrlOrCmdKey: true, shiftKey: true, key: "d" }} /> : undefined
                }
            >
                {button}
            </Tooltip>
        );
    }

    return button;
};

export default RoomListToggleButton;
