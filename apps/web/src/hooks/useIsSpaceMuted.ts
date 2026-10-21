/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useContext, useState } from "react";
import { ClientEvent, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import { type MutedSpaces } from "../@types/muted-spaces";
import MatrixClientContext from "../contexts/MatrixClientContext";
import SdkConfig from "../SdkConfig";
import { MUTED_SPACES_EVENT } from "../utils/muteSpace";
import { useTypedEventEmitter } from "./useEventEmitter";

/**
 * Fragment X: whether the space is muted (`fragment_x.mute_server`), kept up to date as the account data changes. Always
 * false without the option, and the account data is then not listened to.
 */
export function useIsSpaceMuted(spaceId?: string): boolean {
    const client = useContext(MatrixClientContext);
    const enabled = Boolean(spaceId) && Boolean(SdkConfig.get().fragment_x?.mute_server);

    const read = useCallback(
        (): boolean =>
            enabled && Boolean(client?.getAccountData(MUTED_SPACES_EVENT)?.getContent<MutedSpaces>()?.[spaceId!]),
        [client, enabled, spaceId],
    );
    const [muted, setMuted] = useState(read);

    // Not an effect: reading again at render keeps the value right when the space or the option changes.
    const current = read();
    if (current !== muted) setMuted(current);

    const onAccountData = useCallback(
        (event: MatrixEvent): void => {
            if (event.getType() === MUTED_SPACES_EVENT) setMuted(read());
        },
        [read],
    );
    useTypedEventEmitter(enabled ? client : undefined, ClientEvent.AccountData, onAccountData);

    return muted;
}
