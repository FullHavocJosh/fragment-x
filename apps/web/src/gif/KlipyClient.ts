/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

const KLIPY_API = "https://api.klipy.com/api/v1";
const PER_PAGE = 24;

interface KlipyMedia {
    url: string;
    width: number;
    height: number;
}

interface KlipyFile {
    [size: string]: { [format: string]: KlipyMedia | undefined } | undefined;
}

interface KlipyItem {
    slug?: string;
    title?: string;
    file?: KlipyFile;
}

interface KlipyResponse {
    result?: boolean;
    data?: { data?: KlipyItem[]; has_next?: boolean };
}

/**
 * One GIF as the picker and the message need it. The URLs are the ones Klipy returned, unchanged: Klipy requires
 * that its media loads directly from them.
 */
export interface Gif {
    slug: string;
    title: string;
    /** Small animated preview for the picker grid. */
    previewUrl: string;
    /** The GIF that is sent and shown in the timeline. */
    url: string;
    width: number;
    height: number;
}

export interface GifPage {
    gifs: Gif[];
    hasNext: boolean;
}

function pick(file: KlipyFile | undefined, sizes: string[], formats: string[]): KlipyMedia | undefined {
    for (const size of sizes) {
        for (const format of formats) {
            const media = file?.[size]?.[format];
            if (media?.url) return media;
        }
    }
    return undefined;
}

export function toGif(item: KlipyItem): Gif | undefined {
    const full = pick(item.file, ["md", "hd", "sm"], ["gif", "webp"]);
    const preview = pick(item.file, ["sm", "md", "xs"], ["webp", "gif"]) ?? full;
    if (!item.slug || !full || !preview) return undefined;
    return {
        slug: item.slug,
        title: item.title ?? "",
        previewUrl: preview.url,
        url: full.url,
        width: full.width,
        height: full.height,
    };
}

export class KlipyError extends Error {}

/**
 * Talks to the Klipy GIF API straight from the browser. Klipy requires requests to come from the end user client, so
 * there is no proxy, and no cache of its media.
 */
export class KlipyClient {
    public constructor(
        private readonly appKey: string,
        private readonly customerId: string,
        private readonly locale?: string,
    ) {}

    public trending(page = 1, signal?: AbortSignal): Promise<GifPage> {
        return this.fetchPage("trending", { page: String(page) }, signal);
    }

    public search(query: string, page = 1, signal?: AbortSignal): Promise<GifPage> {
        return this.fetchPage("search", { q: query, page: String(page) }, signal);
    }

    private async fetchPage(
        endpoint: "trending" | "search",
        params: Record<string, string>,
        signal?: AbortSignal,
    ): Promise<GifPage> {
        const query = new URLSearchParams({
            ...params,
            per_page: String(PER_PAGE),
            customer_id: this.customerId,
            content_filter: "medium",
            format_filter: "gif,webp",
        });
        if (this.locale) query.set("locale", this.locale);
        const url = `${KLIPY_API}/${encodeURIComponent(this.appKey)}/gifs/${endpoint}?${query}`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new KlipyError(`Klipy responded ${response.status}`);
        const body: KlipyResponse = await response.json();
        if (!body.result || !body.data) throw new KlipyError("Klipy returned no result");
        const gifs = (body.data.data ?? []).map(toGif).filter((gif): gif is Gif => !!gif);
        return { gifs, hasNext: !!body.data.has_next };
    }
}
