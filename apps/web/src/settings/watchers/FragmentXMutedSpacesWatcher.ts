/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { debounce } from "lodash";
import { ClientEvent, type MatrixClient, type MatrixEvent, RoomEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import SdkConfig from "../../SdkConfig";
import { SDKContextClass } from "../../contexts/SDKContextClass";
import { MUTED_SPACES_EVENT, getMutedSpaces, reconcileMutedSpaces } from "../../utils/muteSpace";

/** Waits for the space store and the rooms to settle after a change before looking at the muted spaces. */
const DELAY_MS = 2000;

/**
 * Fragment X: keeps the muted spaces (`fragment_x.mute_server`) in line with their rooms. A room that joins a muted
 * space is muted, a room that leaves is dropped, and a mute that was interrupted is finished, see
 * {@link reconcileMutedSpaces}. It runs when the client starts, when the user's rooms or the muted spaces change, and when
 * the rooms of a muted space change.
 */
export class FragmentXMutedSpacesWatcher {
    private cli?: MatrixClient;
    private watchedSpaces = new Set<string>();
    private running = false;
    private again = false;

    private readonly schedule = debounce(() => void this.reconcile(), DELAY_MS);

    public start(cli: MatrixClient): void {
        this.stop();
        if (!SdkConfig.get().fragment_x?.mute_server) return;
        this.cli = cli;
        cli.on(RoomEvent.MyMembership, this.schedule);
        cli.on(ClientEvent.AccountData, this.onAccountData);
        this.watchSpaces();
        this.schedule();
    }

    public stop(): void {
        this.schedule.cancel();
        if (this.cli) {
            this.cli.off(RoomEvent.MyMembership, this.schedule);
            this.cli.off(ClientEvent.AccountData, this.onAccountData);
        }
        this.unwatchSpaces();
        this.cli = undefined;
    }

    // Each muted space has its own event in the space store, which fires when its rooms change.
    private watchSpaces(): void {
        this.unwatchSpaces();
        if (!this.cli) return;
        const spaceStore = SDKContextClass.instance.spaceStore;
        for (const spaceId of Object.keys(getMutedSpaces(this.cli))) {
            spaceStore.on(spaceId, this.schedule);
            this.watchedSpaces.add(spaceId);
        }
    }

    private unwatchSpaces(): void {
        const spaceStore = SDKContextClass.instance.spaceStore;
        for (const spaceId of this.watchedSpaces) spaceStore.off(spaceId, this.schedule);
        this.watchedSpaces.clear();
    }

    private readonly onAccountData = (event: MatrixEvent): void => {
        if (event.getType() !== MUTED_SPACES_EVENT) return;
        this.watchSpaces();
        this.schedule();
    };

    // One pass at a time; a change during a pass asks for another one after it.
    private async reconcile(): Promise<void> {
        const cli = this.cli;
        if (!cli) return;
        if (this.running) {
            this.again = true;
            return;
        }
        this.running = true;
        try {
            await SDKContextClass.instance.spaceStore.storeReadyPromise;
            if (this.cli === cli) await reconcileMutedSpaces(cli);
        } catch (error) {
            logger.warn("Could not bring the muted spaces up to date", error);
        } finally {
            this.running = false;
        }
        if (this.again) {
            this.again = false;
            this.schedule();
        }
    }
}
