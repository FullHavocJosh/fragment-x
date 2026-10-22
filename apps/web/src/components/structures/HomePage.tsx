/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useContext, useState } from "react";
import { ChatSolidIcon, ExploreIcon, GroupIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { AutoHideScrollbar } from "@element-hq/web-shared-components";

import { getHomePageUrl } from "../../utils/pages";
import { _t, _tDom } from "../../languageHandler";
import SdkConfig from "../../SdkConfig";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import BaseAvatar from "../views/avatars/BaseAvatar";
import { OwnProfileStore } from "../../stores/OwnProfileStore";
import AccessibleButton, { type ButtonEvent } from "../views/elements/AccessibleButton";
import { UPDATE_EVENT } from "../../stores/AsyncStore";
import { useEventEmitter } from "../../hooks/useEventEmitter";
import MatrixClientContext, { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import MiniAvatarUploader, { AVATAR_SIZE } from "../views/elements/MiniAvatarUploader";
import PosthogTrackers from "../../PosthogTrackers";
import EmbeddedPage from "./EmbeddedPage";
import {
    BlockedList,
    HomeTopBar,
    PeopleList,
    PendingList,
    ServersList,
    getDirectContacts,
    useDirectContactCount,
    useHomeTab,
} from "./HomeTabs";

const onClickSendDm = (ev: ButtonEvent): void => {
    PosthogTrackers.trackInteraction("WebHomeCreateChatButton", ev);
    dis.dispatch({ action: Action.CreateChat });
};

const onClickExplore = (ev: ButtonEvent): void => {
    PosthogTrackers.trackInteraction("WebHomeExploreRoomsButton", ev);
    dis.fire(Action.ViewRoomDirectory);
};

const onClickNewRoom = (ev: ButtonEvent): void => {
    PosthogTrackers.trackInteraction("WebHomeCreateRoomButton", ev);
    dis.dispatch({ action: Action.CreateRoom });
};

interface IProps {
    justRegistered?: boolean;
}

const getOwnProfile = (
    userId: string,
): {
    displayName: string;
    avatarUrl?: string;
} => ({
    displayName: OwnProfileStore.instance.displayName || userId,
    avatarUrl: OwnProfileStore.instance.getHttpAvatarUrl(parseInt(AVATAR_SIZE, 10)) ?? undefined,
});

const UserWelcomeTop: React.FC = () => {
    const cli = useContext(MatrixClientContext);
    const userId = cli.getUserId()!;
    const [ownProfile, setOwnProfile] = useState(getOwnProfile(userId));
    useEventEmitter(OwnProfileStore.instance, UPDATE_EVENT, () => {
        setOwnProfile(getOwnProfile(userId));
    });

    return (
        <div>
            <MiniAvatarUploader
                hasAvatar={!!ownProfile.avatarUrl}
                hasAvatarLabel={_t("onboarding|has_avatar_label")}
                noAvatarLabel={_t("onboarding|no_avatar_label")}
                setAvatarUrl={(url) => cli.setAvatarUrl(url)}
                isUserAvatar
                onClick={(ev) => PosthogTrackers.trackInteraction("WebHomeMiniAvatarUploadButton", ev)}
            >
                <BaseAvatar
                    idName={userId}
                    name={ownProfile.displayName}
                    url={ownProfile.avatarUrl}
                    size={AVATAR_SIZE}
                />
            </MiniAvatarUploader>

            <h1>{_tDom("onboarding|welcome_user", { name: ownProfile.displayName })}</h1>
            <h2>{_tDom("onboarding|welcome_detail")}</h2>
        </div>
    );
};

const HomePage: React.FC<IProps> = ({ justRegistered = false }) => {
    const cli = useMatrixClientContext();
    const config = SdkConfig.get();
    const pageUrl = getHomePageUrl(config, cli);
    const showTopBar = Boolean(config.fragment_x?.home_top_bar);
    const [tab, setTab] = useHomeTab();
    const contactCount = useDirectContactCount(cli);

    if (pageUrl) {
        return <EmbeddedPage className="mx_HomePage" url={pageUrl} scrollbar={true} />;
    }

    let introSection: JSX.Element;
    if (justRegistered || !OwnProfileStore.instance.getHttpAvatarUrl(parseInt(AVATAR_SIZE, 10))) {
        introSection = <UserWelcomeTop />;
    } else {
        const brandingConfig = SdkConfig.getObject("branding");
        const logoUrl = brandingConfig?.get("auth_header_logo_url") ?? "themes/element/img/logos/fragment-x-logo.png";

        introSection = (
            <React.Fragment>
                <img src={logoUrl} alt={config.brand} />
                <h1>{_tDom("onboarding|intro_welcome", { appName: config.brand })}</h1>
                <h2>{_tDom("onboarding|intro_byline")}</h2>
            </React.Fragment>
        );
    }

    const welcome = (
        <div className="mx_HomePage_default_wrapper">
            {introSection}
            {/* Fragment X: with the top bar these three are Add Friend, Discover and the new group chat button. */}
            {!showTopBar && (
                <div className="mx_HomePage_default_buttons">
                    <AccessibleButton onClick={onClickSendDm} className="mx_HomePage_button_sendDm">
                        <ChatSolidIcon />
                        {_tDom("onboarding|send_dm")}
                    </AccessibleButton>
                    <AccessibleButton onClick={onClickExplore} className="mx_HomePage_button_explore">
                        <ExploreIcon />
                        {_tDom("onboarding|explore_rooms")}
                    </AccessibleButton>
                    <AccessibleButton onClick={onClickNewRoom} className="mx_HomePage_button_createGroup">
                        <GroupIcon />
                        {_tDom("onboarding|create_room")}
                    </AccessibleButton>
                </div>
            )}
        </div>
    );

    if (!showTopBar) {
        return (
            <AutoHideScrollbar className="mx_AutoHideScrollbar mx_HomePage mx_HomePage_default" as="main">
                {welcome}
            </AutoHideScrollbar>
        );
    }

    // Fragment X: a top bar with the People, Servers, Pending and Blocked tabs. The welcome content stays for a user with no
    // direct chats yet.
    let tabContent: JSX.Element;
    if (tab === "servers") {
        tabContent = <ServersList />;
    } else if (tab === "pending") {
        tabContent = <PendingList cli={cli} />;
    } else if (tab === "blocked") {
        tabContent = <BlockedList cli={cli} />;
    } else if (contactCount > 0) {
        tabContent = <PeopleList contacts={getDirectContacts()} />;
    } else {
        tabContent = <div className="mx_HomePage_default mx_HomePage_default_inTabs">{welcome}</div>;
    }

    return (
        <div className="mx_HomePage_withTopBar">
            <HomeTopBar cli={cli} tab={tab} onTabChange={setTab} />
            <AutoHideScrollbar className="mx_AutoHideScrollbar mx_HomePage_tabContent" as="main">
                {tabContent}
            </AutoHideScrollbar>
        </div>
    );
};

export default HomePage;
