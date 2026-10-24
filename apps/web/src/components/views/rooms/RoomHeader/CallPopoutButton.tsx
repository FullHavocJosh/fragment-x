/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { IconButton, Tooltip } from "@vector-im/compound-web";
import PopOutIcon from "@vector-im/compound-design-tokens/assets/web/icons/pop-out";
import { type Room } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../../languageHandler";
import Modal from "../../../../Modal";
import ErrorDialog from "../../dialogs/ErrorDialog";
import { useCall } from "../../../../hooks/useCall";
import { useCallPopout } from "../../../../hooks/useCallPopout";
import { CallPopout } from "../../../../utils/CallPopout";

/** Header button that opens the call of a room in a window of its own, or brings it back. */
export function CallPopoutButton({ room }: { room: Room }): JSX.Element | null {
    const call = useCall(room.roomId);
    const poppedOut = useCallPopout(room.roomId);
    if (!call) return null;

    const onClick = (): void => {
        if (poppedOut) {
            CallPopout.instance.bringBack(room.roomId);
        } else if (!CallPopout.instance.open(room.roomId, call.widget, room.name)) {
            Modal.createDialog(ErrorDialog, {
                title: _t("fragment_x|pop_out_blocked_title"),
                description: _t("fragment_x|pop_out_blocked_description"),
            });
        }
    };

    return (
        <Tooltip label={poppedOut ? _t("fragment_x|bring_call_back") : _t("fragment_x|pop_out_call")}>
            <IconButton onClick={onClick}>
                <PopOutIcon />
            </IconButton>
        </Tooltip>
    );
}
