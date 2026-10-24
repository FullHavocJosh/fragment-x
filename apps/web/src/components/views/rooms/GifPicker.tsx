/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useCallback, useEffect, useRef, useState } from "react";

import { _t } from "../../../languageHandler";
import { type Gif, type GifPage, type KlipyClient } from "../../../gif/KlipyClient";

interface Props {
    client: KlipyClient;
    onChoose: (gif: Gif) => void;
}

const SEARCH_DELAY_MS = 300;

/**
 * Search box and grid of GIFs from Klipy. Shows the trending GIFs until the user types. Results appear in the order
 * Klipy returns them, as its integration rules require.
 */
export function GifPicker({ client, onChoose }: Props): JSX.Element {
    const [query, setQuery] = useState("");
    const [gifs, setGifs] = useState<Gif[]>([]);
    const [hasNext, setHasNext] = useState(false);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const page = useRef(1);
    const abort = useRef<AbortController | null>(null);

    const load = useCallback(
        async (term: string, pageNumber: number): Promise<void> => {
            abort.current?.abort();
            const controller = new AbortController();
            abort.current = controller;
            setLoading(true);
            setFailed(false);
            try {
                const result: GifPage = term
                    ? await client.search(term, pageNumber, controller.signal)
                    : await client.trending(pageNumber, controller.signal);
                if (controller.signal.aborted) return;
                setGifs((previous) => (pageNumber === 1 ? result.gifs : [...previous, ...result.gifs]));
                setHasNext(result.hasNext);
                page.current = pageNumber;
            } catch {
                if (controller.signal.aborted) return;
                setFailed(true);
            }
            setLoading(false);
        },
        [client],
    );

    useEffect(() => {
        const timer = window.setTimeout(() => void load(query.trim(), 1), query ? SEARCH_DELAY_MS : 0);
        return () => window.clearTimeout(timer);
    }, [query, load]);

    useEffect(() => () => abort.current?.abort(), []);

    const onScroll = (event: React.UIEvent<HTMLDivElement>): void => {
        const grid = event.currentTarget;
        const nearEnd = grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200;
        if (nearEnd && hasNext && !loading) void load(query.trim(), page.current + 1);
    };

    return (
        <div className="mx_GifPicker">
            <input
                className="mx_GifPicker_search"
                type="search"
                autoFocus
                value={query}
                placeholder={_t("fragment_x|gif_search")}
                aria-label={_t("fragment_x|gif_search")}
                onChange={(event) => setQuery(event.target.value)}
            />
            <div className="mx_GifPicker_grid" onScroll={onScroll}>
                {gifs.map((gif) => (
                    <button
                        key={gif.slug}
                        type="button"
                        className="mx_GifPicker_item"
                        title={gif.title}
                        onClick={() => onChoose(gif)}
                    >
                        <img src={gif.previewUrl} alt={gif.title} loading="lazy" />
                    </button>
                ))}
                {!loading && !failed && gifs.length === 0 && (
                    <div className="mx_GifPicker_status">{_t("fragment_x|gif_empty")}</div>
                )}
                {failed && <div className="mx_GifPicker_status">{_t("fragment_x|gif_error")}</div>}
                {loading && <div className="mx_GifPicker_status">{_t("common|loading")}</div>}
            </div>
            <div className="mx_GifPicker_footer">{_t("fragment_x|gif_powered_by")}</div>
        </div>
    );
}
