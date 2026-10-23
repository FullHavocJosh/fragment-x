/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "test-utils-rtl";

import { ThreadsActivityCentreButton } from "./ThreadsActivityCentreButton";
import { NotificationLevel } from "../../../../stores/notifications/NotificationLevel";

describe("ThreadsActivityCentreButton", () => {
    it("has no unread class while there is nothing in it", () => {
        render(<ThreadsActivityCentreButton notificationLevel={NotificationLevel.None} />);
        expect(screen.getByRole("button", { name: "Threads" })).not.toHaveClass(
            "mx_ThreadsActivityCentreButton_unread",
        );
    });

    it.each([NotificationLevel.Activity, NotificationLevel.Notification, NotificationLevel.Highlight])(
        "has the unread class for notification level %s",
        (notificationLevel) => {
            render(<ThreadsActivityCentreButton notificationLevel={notificationLevel} />);
            expect(screen.getByRole("button", { name: "Threads" })).toHaveClass(
                "mx_ThreadsActivityCentreButton_unread",
            );
        },
    );
});
