/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";

import { type IBodyProps } from "./IBodyProps";
import { getGifContent } from "../../../gif/gifMessage";

const MAX_WIDTH = 320;
const MAX_HEIGHT = 280;

/** A Klipy GIF in the timeline. The image loads straight from Klipy, as its integration rules require. */
export default function GifBody({ mxEvent, maxImageHeight }: IBodyProps): JSX.Element | null {
    const gif = getGifContent(mxEvent.getContent());
    if (!gif) return null;

    const maxHeight = Math.min(MAX_HEIGHT, maxImageHeight ?? MAX_HEIGHT);
    const scale = Math.min(1, MAX_WIDTH / gif.width, maxHeight / gif.height);
    return (
        <div className="mx_GifBody">
            <img
                src={gif.url}
                alt={gif.title}
                title={gif.title}
                loading="lazy"
                width={Math.round(gif.width * scale)}
                height={Math.round(gif.height * scale)}
            />
        </div>
    );
}
