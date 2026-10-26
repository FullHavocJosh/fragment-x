/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/** What decides whether a phone is sent to the mobile guide instead of the web app. */
export interface MobileRedirectInput {
    userAgent: string;
    /** The user chose to stay on the web app in this session. */
    skipped: boolean;
    /** A deep link or a 3pid verification is open; those must reach the web app. */
    deepLink: boolean;
    /** `fragment_x.mobile_web`: phones use the web app. */
    mobileWeb: boolean;
}

/** Whether to send this browser to the mobile guide page, which asks for a native app. */
export function shouldRedirectToMobileGuide({ userAgent, skipped, deepLink, mobileWeb }: MobileRedirectInput): boolean {
    if (mobileWeb || skipped || deepLink) return false;
    return /iPad|iPhone|iPod|Android/.test(userAgent);
}
