// @vitest-environment happy-dom

/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { Window as HappyWindow } from "happy-dom";

import { CallPopout, CallPopoutEvent } from "./CallPopout";
import { WidgetMessagingStore } from "../stores/widgets/WidgetMessagingStore";
import { type IApp } from "../stores/WidgetStore";

const ROOM = "!room:example.org";
const widget = { id: "call", roomId: ROOM, creatorUserId: "@a:example.org", type: "m.call" } as unknown as IApp;

describe("CallPopout", () => {
    let iframe: HTMLIFrameElement;
    let parent: HTMLElement;
    let widgetWindow: object;
    let newWidgetWindow: object;
    let transport: { transportWindow: unknown };
    let widgetApi: { transport: typeof transport; contentLoadedActionSent: boolean };
    let popup: HappyWindow;

    beforeEach(() => {
        parent = document.createElement("div");
        document.body.appendChild(parent);
        iframe = document.createElement("iframe");
        iframe.setAttribute("style", "width: 100%;");
        parent.appendChild(iframe);
        widgetWindow = { name: "widget" };
        newWidgetWindow = { name: "widget after the move" };
        Object.defineProperty(iframe, "contentWindow", { get: () => widgetWindow, configurable: true });
        transport = { transportWindow: widgetWindow };
        widgetApi = { transport, contentLoadedActionSent: true };

        vi.spyOn(WidgetMessagingStore.instance, "getMessagingForUid").mockReturnValue({
            hostIframe: iframe,
            widgetApi,
        } as any);
        popup = new HappyWindow();
        vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    });

    afterEach(() => {
        CallPopout.instance.bringBack(ROOM);
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("does nothing when the call has no running iframe", () => {
        vi.spyOn(WidgetMessagingStore.instance, "getMessagingForUid").mockReturnValue(undefined);
        expect(CallPopout.instance.open(ROOM, widget, "Room")).toBe(false);
        expect(CallPopout.instance.isOpen(ROOM)).toBe(false);
    });

    it("reports a blocked window", () => {
        vi.spyOn(window, "open").mockReturnValue(null);
        expect(CallPopout.instance.open(ROOM, widget, "Room")).toBe(false);
        expect(parent.contains(iframe)).toBe(true);
    });

    it("moves the iframe into the popup and leaves a placeholder", () => {
        const onChange = vi.fn();
        CallPopout.instance.on(CallPopoutEvent.Change, onChange);

        expect(CallPopout.instance.open(ROOM, widget, "Room")).toBe(true);

        expect(CallPopout.instance.isOpen(ROOM)).toBe(true);
        expect(popup.document.body.querySelector("iframe")).not.toBeNull();
        expect(popup.document.title).toBe("Room");
        // The tile finds an iframe where it left one, so it does not make a second
        expect(parent.querySelectorAll("iframe")).toHaveLength(1);
        expect(parent.querySelector("iframe")).not.toBe(iframe);
        expect(onChange).toHaveBeenCalledWith(ROOM);
        CallPopout.instance.off(CallPopoutEvent.Change, onChange);
    });

    it("forwards the widget's messages from the popup to the app window", () => {
        CallPopout.instance.open(ROOM, widget, "Room");
        const received = vi.fn();
        window.addEventListener("message", received);

        const fromWidget = new MessageEvent("message", { data: { action: "content_loaded" }, origin: "https://call" });
        Object.defineProperty(fromWidget, "source", { value: widgetWindow });
        popup.dispatchEvent(fromWidget as any);

        expect(received).toHaveBeenCalledTimes(1);
        expect(received.mock.calls[0][0].data).toEqual({ action: "content_loaded" });

        const fromElsewhere = new MessageEvent("message", { data: { action: "x" }, origin: "https://evil" });
        Object.defineProperty(fromElsewhere, "source", { value: { name: "other" } });
        popup.dispatchEvent(fromElsewhere as any);
        expect(received).toHaveBeenCalledTimes(1);
        window.removeEventListener("message", received);
    });

    it("makes the transport follow the iframe's window, and lets the widget API take content loaded again", () => {
        CallPopout.instance.open(ROOM, widget, "Room");
        expect(transport.transportWindow).toBe(widgetWindow);
        Object.defineProperty(iframe, "contentWindow", { get: () => newWidgetWindow, configurable: true });
        expect(transport.transportWindow).toBe(newWidgetWindow);
        expect(widgetApi.contentLoadedActionSent).toBe(false);
    });

    it("brings the call back and closes the popup", () => {
        const close = vi.spyOn(popup, "close");
        CallPopout.instance.open(ROOM, widget, "Room");

        CallPopout.instance.bringBack(ROOM);

        expect(CallPopout.instance.isOpen(ROOM)).toBe(false);
        expect(parent.querySelectorAll("iframe")).toHaveLength(1);
        expect(parent.querySelector("iframe")).toBe(iframe);
        expect(iframe.getAttribute("style")).toBe("width: 100%;");
        expect(close).toHaveBeenCalled();
    });

    it("brings the call back when the popup is closed", () => {
        CallPopout.instance.open(ROOM, widget, "Room");
        popup.dispatchEvent(new Event("pagehide") as any);
        expect(CallPopout.instance.isOpen(ROOM)).toBe(false);
        expect(parent.querySelector("iframe")).toBe(iframe);
    });
});
