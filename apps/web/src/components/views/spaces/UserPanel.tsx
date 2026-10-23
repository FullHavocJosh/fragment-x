/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useContext, useEffect } from "react";
import classNames from "classnames";
import { MicOffSolidIcon, MicOnSolidIcon, SettingsSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { IconButton, Tooltip } from "@vector-im/compound-web";
import { useCreateAutoDisposedViewModel, UserMenu } from "@element-hq/web-shared-components";

import { _t } from "../../../languageHandler";
import SdkConfig from "../../../SdkConfig";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { type ActionPayload } from "../../../dispatcher/payloads";
import { useDispatcher } from "../../../hooks/useDispatcher";
import { useEventEmitterState } from "../../../hooks/useEventEmitter";
import { SDKContext } from "../../../contexts/SDKContext.ts";
import { OwnProfileStore } from "../../../stores/OwnProfileStore.ts";
import { CallStore, CallStoreEvent } from "../../../stores/CallStore";
import { CallEvent, ElementCall } from "../../../models/Call";
import { UserMenuViewModel } from "../../../viewmodels/menus/UserMenuViewModel.ts";
import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { NotificationLevel } from "../../../stores/notifications/NotificationLevel";
import { useMentionRooms } from "./threads-activity-centre/useMentionRooms";
import { useUnreadThreadRooms } from "./threads-activity-centre/useUnreadThreadRooms";

/**
 * The Element Call the user is connected to, if any. Only Element Call can be muted from outside.
 */
function useConnectedElementCall(): ElementCall | null {
    return useEventEmitterState(CallStore.instance, CallStoreEvent.ConnectedCalls, () => {
        for (const call of CallStore.instance.connectedCalls) {
            if (call instanceof ElementCall) return call;
        }
        return null;
    });
}

/**
 * Fragment X (`inbox_in_user_menu`): tells the user menu whether the inbox has something in it, for the dot on its Inbox
 * item. The same data the inbox popup shows: a mention anywhere, or an unread thread.
 */
const InboxUnreadWatcher: React.FC<{ onChange: (unread: boolean) => void }> = ({ onChange }) => {
    const client = useMatrixClientContext();
    const mentionRooms = useMentionRooms(client, true);
    const { greatestNotificationLevel } = useUnreadThreadRooms(false);
    const unread = mentionRooms.length > 0 || greatestNotificationLevel > NotificationLevel.None;
    useEffect(() => onChange(unread), [onChange, unread]);
    return null;
};

/**
 * The microphone button, shown only while the user is in a call. Element Call has no "deafen" control, so there is none.
 */
const CallMuteButton: React.FC<{ call: ElementCall }> = ({ call }) => {
    const deviceMute = useEventEmitterState(call, CallEvent.DeviceMute, () => call.deviceMute);
    // Until Element Call has reported its state, assume the microphone is on.
    const muted = deviceMute?.audio_enabled === false;
    const label = muted ? _t("common|unmute") : _t("common|mute");

    return (
        <Tooltip label={label}>
            <IconButton
                aria-label={label}
                aria-pressed={muted}
                className="mx_UserPanel_button"
                onClick={() => void call.setAudioMuted(!muted)}
            >
                {muted ? <MicOffSolidIcon /> : <MicOnSolidIcon />}
            </IconButton>
        </Tooltip>
    );
};

/**
 * Fragment X: the user's avatar and name with their menu, a microphone button while in a call, and the settings
 * button, at the bottom of the room list column like Discord's user area. Only shown with the
 * `fragment_x.user_panel` config option; the space panel then no longer shows the user menu.
 */
const UserPanel: React.FC<{ compact?: boolean }> = ({ compact }): JSX.Element | null => {
    const sdkContext = useContext(SDKContext);
    const client = sdkContext.client!;
    const call = useConnectedElementCall();

    const userMenuVm = useCreateAutoDisposedViewModel(
        () => new UserMenuViewModel({ ownProfileStore: OwnProfileStore.instance }, defaultDispatcher, client, false),
    );
    useDispatcher(defaultDispatcher, (payload: ActionPayload) => {
        if (payload.action === Action.ToggleUserMenu) {
            userMenuVm.setOpen(!userMenuVm.getSnapshot().open);
        }
    });
    // In a narrow rail (the unified tree) only the avatar is shown, not the name.
    useEffect(() => {
        userMenuVm.setExpanded(!compact);
    }, [userMenuVm, compact]);

    if (!SdkConfig.get().fragment_x?.user_panel) return null;

    return (
        <div className={classNames("mx_UserPanel", { mx_UserPanel_compact: compact })}>
            <UserMenu vm={userMenuVm} className="mx_UserPanel_menu" />
            {SdkConfig.get().fragment_x?.inbox_in_user_menu && (
                <InboxUnreadWatcher onChange={userMenuVm.setInboxUnread} />
            )}
            <div className="mx_UserPanel_buttons">
                {call && <CallMuteButton call={call} />}
                {!SdkConfig.get().fragment_x?.settings_in_user_menu && (
                    <Tooltip label={_t("common|settings")}>
                        <IconButton
                            aria-label={_t("common|settings")}
                            className="mx_UserPanel_button"
                            onClick={() => defaultDispatcher.dispatch({ action: Action.ViewUserSettings })}
                        >
                            <SettingsSolidIcon />
                        </IconButton>
                    </Tooltip>
                )}
            </div>
        </div>
    );
};

export default UserPanel;
