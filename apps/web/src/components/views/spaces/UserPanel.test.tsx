/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen } from "test-utils-rtl";
import { TestSDKContext } from "test-utils";

import UserPanel from "./UserPanel";
import SdkConfig from "../../../SdkConfig";
import { SDKContext } from "../../../contexts/SDKContext";

vi.mock("@element-hq/web-shared-components", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useCreateAutoDisposedViewModel: () => ({
        setExpanded: vi.fn(),
        setOpen: vi.fn(),
        getSnapshot: () => ({ open: false }),
    }),
    UserMenu: () => <button aria-label="User menu" />,
}));

describe("<UserPanel />", () => {
    afterEach(() => SdkConfig.reset());

    const renderPanel = (): void => {
        render(
            <SDKContext.Provider value={new TestSDKContext()}>
                <UserPanel />
            </SDKContext.Provider>,
        );
    };

    it("shows nothing without the user_panel option", () => {
        renderPanel();
        expect(screen.queryByRole("button", { name: "User menu" })).not.toBeInTheDocument();
    });

    it("has a settings button next to the user menu", () => {
        SdkConfig.put({ fragment_x: { user_panel: true } });
        renderPanel();
        expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    });

    it("has no settings button when the settings are in the user menu", () => {
        SdkConfig.put({ fragment_x: { user_panel: true, settings_in_user_menu: true } });
        renderPanel();
        expect(screen.getByRole("button", { name: "User menu" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    });
});
