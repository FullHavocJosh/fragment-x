/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type IContent, type IEventRelation, type MatrixEvent, MsgType } from "matrix-js-sdk/src/matrix";

import SdkConfig from "../SdkConfig";
import { type RoomMessageEventContent } from "../../@types/url-preview";
import { addReplyToMessageContent } from "../utils/Reply";
import { attachRelation } from "../utils/messages";
import { KlipyClient, type Gif } from "./KlipyClient";

/** Content field that marks a message as a GIF. Other clients ignore it and show the link in the body. */
export const GIF_CONTENT_KEY = "fragment_x.gif";
const CUSTOMER_KEY = "mx_fragment_x_gif_customer";

export interface GifContent {
    url: string;
    width: number;
    height: number;
    title: string;
}

/** The Klipy app key, or undefined when the GIF picker is off or has no key. */
export function getKlipyAppKey(): string | undefined {
    const options = SdkConfig.get().fragment_x;
    return options?.gif_picker && options.klipy_app_key ? options.klipy_app_key : undefined;
}

/** A random id that Klipy uses for its per user features. It is not linked to the Matrix account. */
function getCustomerId(): string {
    try {
        const stored = window.localStorage.getItem(CUSTOMER_KEY);
        if (stored) return stored;
        const created = window.crypto.randomUUID();
        window.localStorage.setItem(CUSTOMER_KEY, created);
        return created;
    } catch {
        return "anonymous";
    }
}

export function createKlipyClient(): KlipyClient | undefined {
    const key = getKlipyAppKey();
    return key ? new KlipyClient(key, getCustomerId()) : undefined;
}

/** Only Klipy media is shown inline, so an event from anyone else cannot make a client load an arbitrary URL. */
export function isKlipyMediaUrl(url: unknown): url is string {
    if (typeof url !== "string") return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && /^static\d*\.klipy\.com$/.test(parsed.hostname);
    } catch {
        return false;
    }
}

export function getGifContent(content: Record<string, any>): GifContent | undefined {
    const gif = content[GIF_CONTENT_KEY];
    if (!gif || !isKlipyMediaUrl(gif.url)) return undefined;
    const width = Number(gif.width);
    const height = Number(gif.height);
    if (!(width > 0) || !(height > 0)) return undefined;
    return { url: gif.url, width, height, title: typeof gif.title === "string" ? gif.title : "" };
}

export function makeGifMessageContent(
    gif: Gif,
    relation: IEventRelation | undefined,
    replyToEvent: MatrixEvent | undefined,
): RoomMessageEventContent {
    const content: IContent = {
        msgtype: MsgType.Text,
        body: gif.url,
        [GIF_CONTENT_KEY]: { url: gif.url, width: gif.width, height: gif.height, title: gif.title },
    };
    attachRelation(content, relation);
    if (replyToEvent) addReplyToMessageContent(content, replyToEvent);
    return content as RoomMessageEventContent;
}
