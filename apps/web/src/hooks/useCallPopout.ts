/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { CallPopout, CallPopoutEvent } from "../utils/CallPopout";
import { useEventEmitterState } from "./useEventEmitter";

/** Whether the call of a room is open in a window of its own. */
export const useCallPopout = (roomId: string): boolean =>
    useEventEmitterState(CallPopout.instance, CallPopoutEvent.Change, () => CallPopout.instance.isOpen(roomId));
