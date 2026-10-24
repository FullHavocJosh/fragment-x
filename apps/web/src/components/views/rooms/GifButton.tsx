/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import classNames from "classnames";
import React, { type JSX, useContext, useMemo } from "react";
import { type IEventRelation, type MatrixEvent, THREAD_RELATION_TYPE } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../languageHandler";
import ContextMenu, { aboveLeftOf, type MenuProps, useContextMenu } from "../../structures/ContextMenu";
import { CollapsibleButton, OverflowMenuContext } from "./CollapsibleButton";
import { GifPicker } from "./GifPicker";
import { type Gif } from "../../../gif/KlipyClient";
import { createKlipyClient, makeGifMessageContent } from "../../../gif/gifMessage";
import { useScopedRoomContext } from "../../../contexts/ScopedRoomContext";
import MatrixClientContext from "../../../contexts/MatrixClientContext";
import dis from "../../../dispatcher/dispatcher";
import { doMaybeLocalRoomAction } from "../../../utils/local-room";

interface Props {
    relation?: IEventRelation;
    replyToEvent?: MatrixEvent;
    menuPosition?: MenuProps;
    className?: string;
}

/** Composer button that opens the Klipy GIF picker. Sending a GIF posts it straight away, as in Discord. */
export function GifButton({ relation, replyToEvent, menuPosition, className }: Props): JSX.Element | null {
    const overflowMenuCloser = useContext(OverflowMenuContext);
    const mxClient = useContext(MatrixClientContext);
    const { room, timelineRenderingType } = useScopedRoomContext("room", "timelineRenderingType");
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu();
    const client = useMemo(() => createKlipyClient(), []);

    if (!client || !room || !mxClient) return null;

    const onFinished = (): void => {
        closeMenu();
        overflowMenuCloser?.();
    };

    const onChoose = (gif: Gif): void => {
        const content = makeGifMessageContent(gif, relation, replyToEvent);
        const threadId = relation?.rel_type === THREAD_RELATION_TYPE.name ? relation.event_id : null;
        void doMaybeLocalRoomAction(
            room.roomId,
            (roomId: string) => mxClient.sendMessage(roomId, threadId ?? null, content),
            mxClient,
        );
        if (replyToEvent) {
            dis.dispatch({ action: "reply_to_event", event: null, context: timelineRenderingType });
        }
        dis.dispatch({ action: "message_sent" });
        onFinished();
    };

    let contextMenu: React.ReactElement | null = null;
    if (menuDisplayed && button.current) {
        const position = menuPosition ?? aboveLeftOf(button.current.getBoundingClientRect());
        contextMenu = (
            <ContextMenu {...position} onFinished={onFinished} managed={false} focusLock>
                <GifPicker client={client} onChoose={onChoose} />
            </ContextMenu>
        );
    }

    return (
        <>
            <CollapsibleButton
                className={classNames("mx_GifButton", className, { mx_GifButton_highlight: menuDisplayed })}
                onClick={openMenu}
                title={_t("fragment_x|gif_title")}
                inputRef={button}
            >
                <span className="mx_GifButton_label" aria-hidden="true">
                    GIF
                </span>
            </CollapsibleButton>
            {contextMenu}
        </>
    );
}
