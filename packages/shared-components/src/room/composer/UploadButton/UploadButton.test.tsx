/*
 * Copyright (c) 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */
import React from "react";
import { render, screen } from "@test-utils";
import { describe, it, expect } from "vitest";
import { composeStories } from "@storybook/react-vite";
import { userEvent } from "vitest/browser";
import { fn } from "storybook/test";

import * as stories from "./UploadButton.stories.tsx";
import { UploadButton } from "./UploadButton";

const { Default, WithOneOption } = composeStories(stories);

describe("UploadButton", () => {
    it("renders a default button", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
    });
    it("will provide one option when only one is available", async () => {
        userEvent.setup();
        const onUploadOptionSelected = fn();
        const { getByRole } = render(<WithOneOption onUploadOptionSelected={onUploadOptionSelected} />);
        await userEvent.click(getByRole("button", { name: "Attachment" }));
        expect(onUploadOptionSelected).toHaveBeenCalledWith("local");
    });
    it("can open the menu and select an option", async () => {
        const onUploadOptionSelected = fn();
        const { container, getByRole } = render(<Default onUploadOptionSelected={onUploadOptionSelected} />);
        await userEvent.click(getByRole("button", { name: "Attachment" }));
        expect(container).toMatchSnapshot();
        await userEvent.click(screen.getByRole("menuitem", { name: "Fun Button" }));
        expect(onUploadOptionSelected).toHaveBeenCalledWith("fun");
    });
    describe("size", () => {
        // One snapshot object, not a new one on every call, or the subscription loops.
        const vmWith = (types: string[]) => {
            const snapshot = { options: types.map((type) => ({ type, label: type })) };
            return { getSnapshot: () => snapshot, subscribe: () => () => {}, onUploadOptionSelected: fn() };
        };
        const iconButtonSize = (container: HTMLElement): string =>
            container.querySelector("button")!.style.getPropertyValue("--cpd-icon-button-size");

        it("is 26px by default, with one option or a menu", () => {
            expect(iconButtonSize(render(<UploadButton vm={vmWith(["a"])} />).container)).toBe("26px");
            expect(iconButtonSize(render(<UploadButton vm={vmWith(["a", "b"])} />).container)).toBe("26px");
        });

        it("can be set, with one option or a menu", () => {
            expect(iconButtonSize(render(<UploadButton vm={vmWith(["a"])} size="32px" />).container)).toBe("32px");
            expect(iconButtonSize(render(<UploadButton vm={vmWith(["a", "b"])} size="32px" />).container)).toBe("32px");
        });
    });
    it("can ctrl click to get the first option", async () => {
        userEvent.setup();
        const onUploadOptionSelected = fn();
        const { getByRole } = render(<Default onUploadOptionSelected={onUploadOptionSelected} />);
        await userEvent.keyboard("[ControlLeft>]");
        await userEvent.click(getByRole("button", { name: "Attachment" }));
        expect(onUploadOptionSelected).toHaveBeenCalledWith("local");
    });
});
