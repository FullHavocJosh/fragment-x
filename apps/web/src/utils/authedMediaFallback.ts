/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/*
 * Media URLs are the unauthenticated /_matrix/media/v3 form; the service worker rewrites them to the authenticated
 * /_matrix/client/v1/media form. When the worker does not run (Safari on iPad, a hard reload, a restarted worker) the
 * image request is refused and the avatar shows only its initial. This fetches the authenticated form with the access
 * token instead and hands back a blob URL.
 */

const MEDIA_V3 = /\/_matrix\/media\/v3\/(download|thumbnail)\//;

const cache = new Map<string, Promise<string | null>>();

/** The authenticated form of a media URL, or null when the URL is not a v3 download or thumbnail URL. */
export function toAuthedMediaUrl(url: string): string | null {
    if (!MEDIA_V3.test(url)) return null;
    return url.replace(MEDIA_V3, "/_matrix/client/v1/media/$1/");
}

/** Fetches a media URL with the access token and resolves to a blob URL, or null when that is not possible. */
export function fetchAuthedMediaBlobUrl(url: string, accessToken: string | null | undefined): Promise<string | null> {
    const authed = toAuthedMediaUrl(url);
    if (!authed || !accessToken) return Promise.resolve(null);

    let blobUrl = cache.get(authed);
    if (!blobUrl) {
        blobUrl = fetch(authed, { headers: { Authorization: `Bearer ${accessToken}` } })
            .then(async (response) => {
                if (!response.ok) return null;
                return URL.createObjectURL(await response.blob());
            })
            .catch(() => null);
        cache.set(authed, blobUrl);
        // A failed fetch is not kept, so a later render can try again.
        void blobUrl.then((result) => {
            if (!result) cache.delete(authed);
        });
    }
    return blobUrl;
}

const srcDescriptor =
    typeof HTMLImageElement === "undefined"
        ? undefined
        : Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
const latestSrc = new WeakMap<HTMLImageElement, string>();
const retried = new WeakSet<HTMLImageElement>();
let installed = false;

/**
 * Makes images of media work without the service worker. Where no worker controls the page, an image given a media URL
 * is given its authenticated blob instead (this includes the detached Image the avatar component preloads with), and a
 * media image in the page that fails is retried the same way once.
 */
export function installAuthedMediaFallback(getAccessToken: () => string | null | undefined): void {
    if (installed || !srcDescriptor?.set) return;
    installed = true;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSet = srcDescriptor.set;
    const setSrc = (img: HTMLImageElement, value: string): void => originalSet.call(img, value);

    Object.defineProperty(HTMLImageElement.prototype, "src", {
        ...srcDescriptor,
        set(this: HTMLImageElement, value: string) {
            const url = String(value);
            if (navigator.serviceWorker?.controller || !toAuthedMediaUrl(url)) {
                latestSrc.delete(this);
                setSrc(this, url);
                return;
            }
            latestSrc.set(this, url);
            void fetchAuthedMediaBlobUrl(url, getAccessToken()).then((blobUrl) => {
                if (latestSrc.get(this) === url) setSrc(this, blobUrl ?? url);
            });
        },
    });

    document.addEventListener(
        "error",
        (ev) => {
            const img = ev.target;
            if (!(img instanceof HTMLImageElement) || retried.has(img)) return;
            const url = img.getAttribute("src");
            if (!url || !toAuthedMediaUrl(url)) return;
            retried.add(img);
            void fetchAuthedMediaBlobUrl(url, getAccessToken()).then((blobUrl) => {
                if (blobUrl) setSrc(img, blobUrl);
            });
        },
        true,
    );
}
