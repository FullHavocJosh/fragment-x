/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { vi, describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "test-utils-rtl";
import { stubClient } from "test-utils";

import BaseAvatar from "./BaseAvatar";
import MatrixClientContext from "../../../contexts/MatrixClientContext";
import * as authedMedia from "../../../utils/authedMediaFallback";

describe("BaseAvatar", () => {
    const url = "https://hs.example/_matrix/media/v3/thumbnail/hs.example/abc?width=32&height=32&method=crop";

    afterEach(() => vi.restoreAllMocks());

    function renderAvatar(): ReturnType<typeof render> {
        const client = stubClient();
        vi.spyOn(client, "getAccessToken").mockReturnValue("tok");
        return render(
            <MatrixClientContext.Provider value={client}>
                <BaseAvatar name="Alice" size="32px" url={url} />
            </MatrixClientContext.Provider>,
        );
    }

    it("shows the authenticated image when the plain media url fails", async () => {
        const fetchBlob = vi.spyOn(authedMedia, "fetchAuthedMediaBlobUrl").mockResolvedValue("blob:authed");
        const { container } = renderAvatar();

        fireEvent.error(container.querySelector("img")!);

        await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:authed"));
        expect(fetchBlob).toHaveBeenCalledWith(url, "tok");
    });

    it("falls back to the initial when the authenticated fetch fails too", async () => {
        vi.spyOn(authedMedia, "fetchAuthedMediaBlobUrl").mockResolvedValue(null);
        const { container } = renderAvatar();

        fireEvent.error(container.querySelector("img")!);

        await waitFor(() => expect(container.querySelector("img")).toBeNull());
    });
});
