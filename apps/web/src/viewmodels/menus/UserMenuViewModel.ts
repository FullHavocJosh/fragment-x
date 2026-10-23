/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import {
    BaseViewModel,
    type UserMenuPresenceChoiceValue,
    type UserMenuSnapshot,
    type UserMenuViewActions,
} from "@element-hq/web-shared-components";
import { logger } from "matrix-js-sdk/src/logger";

import { type OwnProfileStore } from "../../stores/OwnProfileStore";
import { UPDATE_EVENT } from "../../stores/AsyncStore";
import type { MatrixDispatcher } from "../../dispatcher/dispatcher";
import Modal from "../../Modal";
import { Action } from "../../dispatcher/actions";
import { UserTab } from "../../components/views/dialogs/UserTab";
import FeedbackDialog from "../../components/views/dialogs/FeedbackDialog";
import { shouldShowFeedback } from "../../utils/Feedback";
import { getHomePageUrl } from "../../utils/pages";
import SdkConfig from "../../SdkConfig";
import { type MatrixClient, type MatrixEvent, SetPresence, type User, UserEvent } from "matrix-js-sdk/src/matrix";
import { clearAllUserStatus } from "../../utils/userStatus";
import { type SetStatusViewModel, UserMenuSetStatusViewModel } from "../status/SetStatusViewModel";
import SettingsStore from "../../settings/SettingsStore";
import { isPresenceEnabled } from "../../utils/presence";
import { _t } from "../../languageHandler";
import Presence from "../../Presence";

// Matches maximum size of an avatar in the UserMenu
const AVATAR_PX = 88;

interface UserMenuViewModelProps {
    ownProfileStore: OwnProfileStore;
}

export class UserMenuViewModel
    extends BaseViewModel<UserMenuSnapshot, UserMenuViewModelProps>
    implements UserMenuViewActions
{
    public readonly setStatusVm: SetStatusViewModel;

    /**
     * Fragment X (`fragment_x.user_presence`): the presence of the user, for a dot on the avatar and a line under the name.
     * Only when the homeserver reports it as online or idle: offline, unknown and a server without presence show nothing,
     * rather than a wrong "Online".
     */
    private static computePresence(client: MatrixClient): UserMenuSnapshot["presence"] {
        if (!SdkConfig.get().fragment_x?.user_presence || !isPresenceEnabled(client)) return undefined;
        switch (client.getUser(client.getSafeUserId())?.presence) {
            case "online":
                return { state: "online", label: _t("presence|online") };
            case "unavailable":
                return { state: "idle", label: _t("presence|idle") };
            default:
                return undefined;
        }
    }

    /**
     * Fragment X (`fragment_x.user_presence`): the choices of presence, under the profile in the menu. Not on a server
     * without presence.
     */
    private static computePresenceChoices(client: MatrixClient): UserMenuSnapshot["presenceChoices"] {
        if (!SdkConfig.get().fragment_x?.user_presence || !isPresenceEnabled(client) || client.isGuest())
            return undefined;
        const override = Presence.getOverride();
        const choices: [UserMenuPresenceChoiceValue, string, boolean][] = [
            ["auto", _t("presence|auto"), !override],
            ["online", _t("presence|online"), override === SetPresence.Online],
            ["idle", _t("presence|idle"), override === SetPresence.Unavailable],
            ["invisible", _t("presence|invisible"), override === SetPresence.Offline],
        ];
        return choices.map(([value, label, checked]) => ({ value, label, checked }));
    }

    private static computeSnapshot(
        client: MatrixClient,
        ownProfileStore: OwnProfileStore,
        isPanelCollapsed: boolean,
    ): UserMenuSnapshot {
        const hasHomePage = !!getHomePageUrl(SdkConfig.get(), client);
        const isAuthenticated = !client.isGuest();
        const userId = client.getSafeUserId();
        const displayName = ownProfileStore.displayName || userId;
        const avatarUrl = ownProfileStore.getHttpAvatarUrl(AVATAR_PX) ?? undefined;

        const setStatusViewModel = new UserMenuSetStatusViewModel({
            client,
            ownProfileStore,
        });

        return {
            open: false,
            userId,
            displayName,
            avatarUrl,
            expanded: !isPanelCollapsed,
            showAvatar: isAuthenticated,
            userStatus: ownProfileStore.userStatus,
            presence: UserMenuViewModel.computePresence(client),
            presenceChoices: UserMenuViewModel.computePresenceChoices(client),
            showUserStatus: SettingsStore.getValue("feature_user_status") && isAuthenticated,
            setStatusViewModel,
            actions: {
                createAccount: !isAuthenticated,
                signIn: !isAuthenticated,
                openHomePage: hasHomePage,
                linkNewDevice: isAuthenticated,
                openSecurity: isAuthenticated,
                openFeedback: shouldShowFeedback(),
                // Fragment X: the user panel has a settings gear next to the name, so the menu does not repeat it, unless
                // the gear is not there (`settings_in_user_menu`).
                openSettings:
                    !SdkConfig.get().fragment_x?.user_panel || !!SdkConfig.get().fragment_x?.settings_in_user_menu,
            },
        };
    }

    public constructor(
        props: UserMenuViewModelProps,
        private readonly dispatcher: MatrixDispatcher,
        private readonly client: MatrixClient,
        isPanelCollapsed: boolean,
    ) {
        super(props, UserMenuViewModel.computeSnapshot(client, props.ownProfileStore, isPanelCollapsed));
        this.setStatusVm = new UserMenuSetStatusViewModel({ client, ownProfileStore: props.ownProfileStore });
        props.ownProfileStore.on(UPDATE_EVENT, this.recalculateProfile);
        if (SdkConfig.get().fragment_x?.user_presence) client.on(UserEvent.Presence, this.onPresence);
    }

    public dispose(): void {
        this.props.ownProfileStore.off(UPDATE_EVENT, this.recalculateProfile);
        this.client.off(UserEvent.Presence, this.onPresence);
        this.setStatusVm.dispose();
        super.dispose();
    }

    private readonly onPresence = (_event: MatrixEvent | undefined, user: User): void => {
        if (user.userId !== this.client.getSafeUserId()) return;
        this.snapshot.merge({ presence: UserMenuViewModel.computePresence(this.client) });
    };

    public readonly recalculateProfile = (): void => {
        const displayName = this.props.ownProfileStore.displayName || this.snapshot.current.userId;
        const avatarUrl = this.props.ownProfileStore.getHttpAvatarUrl(AVATAR_PX) ?? undefined;
        const userStatus = this.props.ownProfileStore.userStatus;
        this.snapshot.merge({ displayName, avatarUrl, userStatus });
    };

    public readonly setOpen = (isOpen: boolean): void => {
        this.snapshot.merge({ open: isOpen });
    };

    public readonly setExpanded = (expanded: boolean): void => {
        this.snapshot.merge({ expanded });
    };

    public readonly createAccount = (): void => {
        this.setOpen(false);
        this.dispatcher.dispatch({ action: "start_registration" });
    };

    public readonly signIn = (): void => {
        this.setOpen(false);
        this.dispatcher.dispatch({ action: "start_login" });
    };

    public readonly openHomePage = (): void => {
        this.setOpen(false);
        this.dispatcher.dispatch({ action: Action.ViewHomePage });
    };

    public readonly openFeedback = (): void => {
        this.setOpen(false);
        Modal.createDialog(FeedbackDialog);
    };

    public readonly linkNewDevice = (): void => {
        this.setOpen(false);
        this.dispatcher.dispatch({
            action: Action.ViewUserSettings,
            initialTabId: UserTab.SessionManager,
            props: { showMsc4108QrCode: true },
        });
    };

    public readonly openSecurity = (): void => {
        this.setOpen(false);
        this.dispatcher.dispatch({
            action: Action.ViewUserSettings,
            initialTabId: UserTab.Security,
        });
    };

    public readonly openSettings = (): void => {
        this.setOpen(false);
        this.dispatcher.dispatch({
            action: Action.ViewUserSettings,
        });
    };

    public readonly setPresenceChoice = (value: UserMenuPresenceChoiceValue): void => {
        this.setOpen(false);
        const state = {
            auto: null,
            online: SetPresence.Online,
            idle: SetPresence.Unavailable,
            invisible: SetPresence.Offline,
        }[value];
        Presence.setOverride(state)
            .catch((err) => logger.warn("Failed to set presence", err))
            .finally(() =>
                this.snapshot.merge({ presenceChoices: UserMenuViewModel.computePresenceChoices(this.client) }),
            );
    };

    public readonly clearStatus = (): void => {
        this.setOpen(false);
        clearAllUserStatus(this.client).catch((err) => {
            logger.warn("Failed to clear user status", err);
        });
    };
}
