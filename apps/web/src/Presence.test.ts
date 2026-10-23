// @vitest-environment happy-dom

/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SetPresence } from "matrix-js-sdk/src/matrix";

import Presence from "./Presence";
import { MatrixClientPeg } from "./MatrixClientPeg";
import dis from "./dispatcher/dispatcher";
import { Action } from "./dispatcher/actions";

describe("Presence override (fragment_x.user_presence)", () => {
    const setSyncPresence = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        localStorage.clear();
        setSyncPresence.mockClear();
        vi.spyOn(MatrixClientPeg, "safeGet").mockReturnValue({
            isGuest: () => false,
            setSyncPresence,
        } as unknown as ReturnType<typeof MatrixClientPeg.safeGet>);
        void Presence.start();
    });
    afterEach(async () => {
        Presence.stop();
        vi.restoreAllMocks();
    });

    it("keeps the chosen presence when the user is active, and remembers it", async () => {
        await Presence.setOverride(SetPresence.Offline);
        expect(setSyncPresence).toHaveBeenLastCalledWith(SetPresence.Offline);
        expect(Presence.getOverride()).toBe(SetPresence.Offline);
        expect(localStorage.getItem("mx_fragment_x_presence")).toBe("offline");

        dis.dispatch({ action: Action.UserActivity }, true);
        expect(setSyncPresence).toHaveBeenLastCalledWith(SetPresence.Offline);
    });

    it("follows the activity again with null", async () => {
        await Presence.setOverride(SetPresence.Unavailable);
        await Presence.setOverride(null);
        expect(Presence.getOverride()).toBeNull();
        expect(localStorage.getItem("mx_fragment_x_presence")).toBeNull();
        expect(setSyncPresence).toHaveBeenLastCalledWith(SetPresence.Online);
    });
});
