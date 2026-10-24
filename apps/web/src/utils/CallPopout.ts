/*
Copyright 2026 Fragment X contributors

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";
import { TypedEventEmitter } from "matrix-js-sdk/src/matrix";

import WidgetUtils from "./WidgetUtils";
import { type IApp } from "../stores/WidgetStore";
import { WidgetMessagingStore } from "../stores/widgets/WidgetMessagingStore";
import type { WidgetMessaging } from "../stores/widgets/WidgetMessaging";

export enum CallPopoutEvent {
    Change = "change",
}

type EventMap = { [CallPopoutEvent.Change]: (roomId: string) => void };

interface Session {
    popup: Window;
    iframe: HTMLIFrameElement;
    messaging: WidgetMessaging;
    /** Stands in the iframe's old place so that the widget tile does not make a second iframe. */
    placeholder: HTMLIFrameElement;
    homeStyle: string | null;
    detach: () => void;
}

const POPUP_FEATURES = "popup=yes,width=1100,height=720";
const POPUP_IFRAME_STYLE = "display:block;width:100vw;height:100vh;border:0;";

/**
 * Prepares the widget API for an iframe that is about to move. A moved iframe is a new window, so the transport has to
 * follow the iframe's current window instead of the one it read at the start. And the widget API accepts the widget's
 * content loaded message once; the reloaded widget sends it again, which the API only takes when told to expect it.
 */
function prepareForMove(messaging: WidgetMessaging, iframe: HTMLIFrameElement): void {
    const widgetApi = messaging.widgetApi as unknown as { contentLoadedActionSent?: boolean } | null;
    const transport = messaging.widgetApi?.transport;
    if (transport) {
        Object.defineProperty(transport, "transportWindow", { get: () => iframe.contentWindow, configurable: true });
    }
    if (widgetApi) widgetApi.contentLoadedActionSent = false;
}

/**
 * Moves the iframe of a call into a window of its own, and back.
 *
 * The widget API reads the iframe's window once and sends its messages there, and it listens on the app's own window.
 * A moved iframe becomes a new window and its messages go to the window it sits in, so the transport follows the
 * iframe's window, and the messages that reach the popup are forwarded to the app's
 * window. The widget reloads in its new place and starts its handshake again, so a move is a brief reconnect.
 *
 * This works without Document Picture in Picture, so it works in Firefox and Safari too.
 */
export class CallPopout extends TypedEventEmitter<CallPopoutEvent, EventMap> {
    public static readonly instance = new CallPopout();

    private readonly sessions = new Map<string, Session>();

    public isOpen(roomId: string): boolean {
        return this.sessions.has(roomId);
    }

    /**
     * Pops the call of a room out. Must run from a user gesture, or the browser blocks the window.
     * @returns false if there is nothing to pop out or the browser blocked the window.
     */
    public open(roomId: string, widget: IApp, title: string): boolean {
        const existing = this.sessions.get(roomId);
        if (existing) {
            existing.popup.focus();
            return true;
        }
        const messaging = WidgetMessagingStore.instance.getMessagingForUid(WidgetUtils.getWidgetUid(widget));
        const iframe = messaging?.hostIframe;
        const parent = iframe?.parentElement;
        if (!messaging?.widgetApi || !iframe || !parent) return false;

        const popup = window.open("about:blank", `fragment_x_call_${roomId}`, POPUP_FEATURES);
        if (!popup) return false;

        popup.document.title = title;
        popup.document.body.style.cssText = "margin:0;background:#000;overflow:hidden;";

        // The widget's replies go to the popup window; hand them to the app's window, where the widget API listens
        const forward = (ev: MessageEvent): void => {
            if (ev.source !== iframe.contentWindow) return;
            try {
                window.dispatchEvent(
                    new MessageEvent("message", { data: ev.data, origin: ev.origin, source: ev.source }),
                );
            } catch {
                // Firefox does not accept a window from another document as the source; the widget API does not use it
                window.dispatchEvent(new MessageEvent("message", { data: ev.data, origin: ev.origin }));
            }
        };
        const onClosed = (): void => this.bringBack(roomId);
        const closePopup = (): void => popup.close();

        popup.addEventListener("message", forward);
        popup.addEventListener("pagehide", onClosed);
        window.addEventListener("pagehide", closePopup);

        const placeholder = document.createElement("iframe");
        placeholder.style.display = "none";
        placeholder.setAttribute("aria-hidden", "true");
        parent.insertBefore(placeholder, iframe);
        const homeStyle = iframe.getAttribute("style");
        prepareForMove(messaging, iframe);
        iframe.setAttribute("style", POPUP_IFRAME_STYLE);
        popup.document.body.appendChild(iframe);

        this.sessions.set(roomId, {
            popup,
            iframe,
            messaging,
            placeholder,
            homeStyle,
            detach: () => {
                popup.removeEventListener("message", forward);
                popup.removeEventListener("pagehide", onClosed);
                window.removeEventListener("pagehide", closePopup);
            },
        });
        this.emit(CallPopoutEvent.Change, roomId);
        return true;
    }

    /** Moves the call back into the app and closes the window. */
    public bringBack(roomId: string): void {
        const session = this.sessions.get(roomId);
        if (!session) return;
        this.sessions.delete(roomId);
        const { popup, iframe, messaging, placeholder, homeStyle } = session;
        session.detach();

        if (placeholder.parentElement) {
            if (homeStyle === null) iframe.removeAttribute("style");
            else iframe.setAttribute("style", homeStyle);
            // In the app's document the iframe loads again, and the widget starts its handshake again
            prepareForMove(messaging, iframe);
            placeholder.replaceWith(iframe);
        } else {
            logger.warn("CallPopout: the place of the call iframe is gone, so the call cannot return to it");
        }
        if (!popup.closed) popup.close();
        this.emit(CallPopoutEvent.Change, roomId);
    }
}
