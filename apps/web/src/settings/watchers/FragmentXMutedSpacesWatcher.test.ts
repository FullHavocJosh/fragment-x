/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { EventEmitter } from "node:events";

import { type MatrixClient, ClientEvent, RoomEvent, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SdkConfig from "../../SdkConfig";
import { FragmentXMutedSpacesWatcher } from "./FragmentXMutedSpacesWatcher";
import { MUTED_SPACES_EVENT } from "../../utils/muteSpace";

const mocks = vi.hoisted(() => ({
    reconcile: vi.fn(),
    muted: {} as Record<string, unknown>,
    spaceStore: undefined as unknown as { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> },
}));

vi.mock("../../utils/muteSpace", () => ({
    MUTED_SPACES_EVENT: "io.fragmentx.muted_spaces",
    getMutedSpaces: () => mocks.muted,
    reconcileMutedSpaces: mocks.reconcile,
}));

vi.mock("../../contexts/SDKContextClass", () => ({
    SDKContextClass: {
        instance: {
            get spaceStore() {
                return mocks.spaceStore;
            },
        },
    },
}));

describe("FragmentXMutedSpacesWatcher", () => {
    let cli: MatrixClient & EventEmitter;
    let watcher: FragmentXMutedSpacesWatcher;

    const flush = async (): Promise<void> => {
        await vi.advanceTimersByTimeAsync(2100);
    };

    beforeEach(() => {
        vi.useFakeTimers();
        mocks.reconcile.mockReset().mockResolvedValue(undefined);
        mocks.muted = {};
        mocks.spaceStore = Object.assign(new EventEmitter(), {
            on: vi.fn(),
            off: vi.fn(),
            storeReadyPromise: Promise.resolve(),
        }) as never;
        cli = new EventEmitter() as MatrixClient & EventEmitter;
        watcher = new FragmentXMutedSpacesWatcher();
        SdkConfig.put({ fragment_x: { mute_server: true } });
    });

    afterEach(() => {
        watcher.stop();
        SdkConfig.reset();
        vi.useRealTimers();
    });

    it("does nothing without fragment_x.mute_server", async () => {
        SdkConfig.reset();
        watcher.start(cli);
        await flush();
        expect(mocks.reconcile).not.toHaveBeenCalled();
    });

    it("reconciles after the client starts, once the changes have settled", async () => {
        watcher.start(cli);
        expect(mocks.reconcile).not.toHaveBeenCalled();
        await flush();
        expect(mocks.reconcile).toHaveBeenCalledTimes(1);
        expect(mocks.reconcile).toHaveBeenCalledWith(cli);
    });

    it("reconciles again when the user's membership of a room changes, once for a burst", async () => {
        watcher.start(cli);
        await flush();
        mocks.reconcile.mockClear();

        cli.emit(RoomEvent.MyMembership);
        cli.emit(RoomEvent.MyMembership);
        cli.emit(RoomEvent.MyMembership);
        await flush();

        expect(mocks.reconcile).toHaveBeenCalledTimes(1);
    });

    it("watches the rooms of each muted space, and the new set when the muted spaces change", async () => {
        mocks.muted = { "!s1": {} };
        watcher.start(cli);
        expect(mocks.spaceStore.on).toHaveBeenCalledWith("!s1", expect.any(Function));

        mocks.muted = { "!s2": {} };
        cli.emit(ClientEvent.AccountData, { getType: () => MUTED_SPACES_EVENT } as unknown as MatrixEvent);

        expect(mocks.spaceStore.off).toHaveBeenCalledWith("!s1", expect.any(Function));
        expect(mocks.spaceStore.on).toHaveBeenCalledWith("!s2", expect.any(Function));
    });

    it("ignores other account data", async () => {
        watcher.start(cli);
        await flush();
        mocks.reconcile.mockClear();

        cli.emit(ClientEvent.AccountData, { getType: () => "m.push_rules" } as unknown as MatrixEvent);
        await flush();

        expect(mocks.reconcile).not.toHaveBeenCalled();
    });

    it("asks for another pass when a change comes during a pass", async () => {
        let release!: () => void;
        mocks.reconcile.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
        watcher.start(cli);
        await flush();
        expect(mocks.reconcile).toHaveBeenCalledTimes(1);

        cli.emit(RoomEvent.MyMembership);
        await flush();
        expect(mocks.reconcile).toHaveBeenCalledTimes(1);

        release();
        await flush();
        expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    });

    it("keeps going after a pass failed", async () => {
        mocks.reconcile.mockRejectedValueOnce(new Error("offline"));
        watcher.start(cli);
        await flush();

        cli.emit(RoomEvent.MyMembership);
        await flush();

        expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    });

    it("stops listening and cancels a pending pass", async () => {
        mocks.muted = { "!s1": {} };
        watcher.start(cli);
        watcher.stop();
        await flush();

        expect(mocks.reconcile).not.toHaveBeenCalled();
        expect(mocks.spaceStore.off).toHaveBeenCalledWith("!s1", expect.any(Function));
        expect(cli.listenerCount(RoomEvent.MyMembership)).toBe(0);
        expect(cli.listenerCount(ClientEvent.AccountData)).toBe(0);
    });
});
