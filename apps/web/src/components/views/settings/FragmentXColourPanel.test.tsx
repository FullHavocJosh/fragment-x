/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";

import { FragmentXColourPanel } from "./FragmentXColourPanel";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import { applyColours } from "../../../settings/watchers/FragmentXColoursWatcher";

describe("FragmentXColourPanel", () => {
    let setValue: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.spyOn(SettingsStore, "getValue").mockReturnValue(null);
        setValue = vi.spyOn(SettingsStore, "setValue").mockResolvedValue(undefined);
    });

    afterEach(() => {
        applyColours(null);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const input = (name: string): HTMLInputElement => screen.getByLabelText(name) as HTMLInputElement;

    it("shows a picker for each colour, with reset disabled until one is chosen", () => {
        render(<FragmentXColourPanel />);
        expect(input("Accent").type).toBe("color");
        expect(input("Server rail")).toBeInTheDocument();
        expect(input("Room list and panels")).toBeInTheDocument();
        expect(input("Chat background")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reset all colours" })).toHaveAttribute("aria-disabled", "true");
    });

    it("shows a chosen colour at once and saves it to the account after a delay", () => {
        render(<FragmentXColourPanel />);

        fireEvent.change(input("Accent"), { target: { value: "#7c6cf0" } });
        expect(document.head.querySelector("style[data-fragment-x-colours]")?.textContent).toContain("#7c6cf0");
        expect(setValue).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(setValue).toHaveBeenCalledWith("FragmentX.colours", null, SettingLevel.ACCOUNT, { accent: "#7c6cf0" });
    });

    it("saves only the last colour of a quick series of changes", () => {
        render(<FragmentXColourPanel />);

        fireEvent.change(input("Accent"), { target: { value: "#111111" } });
        fireEvent.change(input("Accent"), { target: { value: "#222222" } });
        fireEvent.change(input("Accent"), { target: { value: "#333333" } });
        act(() => {
            vi.advanceTimersByTime(700);
        });

        expect(setValue).toHaveBeenCalledTimes(1);
        expect(setValue).toHaveBeenCalledWith("FragmentX.colours", null, SettingLevel.ACCOUNT, { accent: "#333333" });
    });

    it("starts from the saved colours and resets one of them", async () => {
        vi.spyOn(SettingsStore, "getValue").mockReturnValue({ accent: "#7c6cf0", rail: "#101010" });
        render(<FragmentXColourPanel />);
        expect(input("Accent").value).toBe("#7c6cf0");

        await userEvent.click(screen.getAllByRole("button", { name: "Reset" })[0]);
        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(setValue).toHaveBeenCalledWith("FragmentX.colours", null, SettingLevel.ACCOUNT, { rail: "#101010" });
    });

    it("clears the saved colours with Reset all colours", async () => {
        vi.spyOn(SettingsStore, "getValue").mockReturnValue({ accent: "#7c6cf0" });
        render(<FragmentXColourPanel />);

        await userEvent.click(screen.getByRole("button", { name: "Reset all colours" }));
        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(setValue).toHaveBeenCalledWith("FragmentX.colours", null, SettingLevel.ACCOUNT, null);
        expect(document.head.querySelector("style[data-fragment-x-colours]")).toBeNull();
    });
});
