/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash";

import { _t } from "../../../languageHandler";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import {
    applyColours,
    COLOUR_KEYS,
    type FragmentXColours,
    isHexColour,
} from "../../../settings/watchers/FragmentXColoursWatcher";
import AccessibleButton from "../elements/AccessibleButton";
import { SettingsSubsection } from "./shared/SettingsSubsection";

/** What an input shows for a colour the user has not chosen: a neutral mid grey, not the theme colour. */
const NEUTRAL = "#808080";

const SAVE_DELAY_MS = 600;

/**
 * Fragment X: pick the accent, server rail and panel colours (`fragment_x.colour_editor`). A change is shown at once and
 * saved to the account a moment after the user stops dragging, so a colour picker does not write on every movement.
 */
export function FragmentXColourPanel(): JSX.Element {
    const [colours, setColours] = useState<FragmentXColours>(() => ({
        ...SettingsStore.getValue("FragmentX.colours"),
    }));

    const save = useMemo(
        () =>
            debounce((value: FragmentXColours): void => {
                const chosen = Object.keys(value).length > 0 ? value : null;
                void SettingsStore.setValue("FragmentX.colours", null, SettingLevel.ACCOUNT, chosen);
            }, SAVE_DELAY_MS),
        [],
    );
    // Do not lose a change made just before the dialog closes: save it now, then make sure nothing is left pending.
    const latest = useRef(colours);
    useEffect(
        () => () => {
            save.flush();
            save.cancel();
        },
        [save],
    );

    const update = (next: FragmentXColours): void => {
        latest.current = next;
        setColours(next);
        applyColours(next);
        save(next);
    };

    const labels: Record<keyof FragmentXColours, string> = {
        accent: _t("fragment_x|colour_accent"),
        rail: _t("fragment_x|colour_rail"),
        panels: _t("fragment_x|colour_panels"),
    };

    return (
        <SettingsSubsection heading={_t("fragment_x|colours")} data-testid="mx_FragmentXColourPanel">
            {COLOUR_KEYS.map((key) => {
                const value = colours[key];
                return (
                    <div className="mx_FragmentXColourPanel_row" key={key}>
                        <label htmlFor={`mx_FragmentXColour_${key}`}>{labels[key]}</label>
                        <input
                            id={`mx_FragmentXColour_${key}`}
                            type="color"
                            value={isHexColour(value) ? value : NEUTRAL}
                            onChange={(ev) => update({ ...colours, [key]: ev.target.value })}
                        />
                        <AccessibleButton
                            kind="link"
                            disabled={!isHexColour(value)}
                            onClick={() => {
                                const { [key]: _removed, ...rest } = colours;
                                update(rest);
                            }}
                        >
                            {_t("action|reset")}
                        </AccessibleButton>
                    </div>
                );
            })}
            <AccessibleButton kind="secondary" disabled={Object.keys(colours).length === 0} onClick={() => update({})}>
                {_t("fragment_x|colours_reset_all")}
            </AccessibleButton>
        </SettingsSubsection>
    );
}
