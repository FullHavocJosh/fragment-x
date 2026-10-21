/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type Room, KnownMembership } from "matrix-js-sdk/src/matrix";

import { type MutedSpaces } from "../@types/muted-spaces";
import { RoomNotifState, getRoomNotifsState, setRoomNotifsState } from "../RoomNotifs";
import { SDKContextClass } from "../contexts/SDKContextClass";

/** The account data event that holds the muted spaces, so the state follows the user to every device. */
export const MUTED_SPACES_EVENT = "io.fragmentx.muted_spaces";

/** How many push rule requests are in flight at once. A space can have many rooms and the homeserver rate limits. */
const CONCURRENCY = 3;

export function getMutedSpaces(cli: MatrixClient): MutedSpaces {
    return cli.getAccountData(MUTED_SPACES_EVENT)?.getContent<MutedSpaces>() ?? {};
}

/** The joined rooms of the space and its sub-spaces; the spaces themselves are not rooms to mute. */
export function getSpaceRooms(cli: MatrixClient, spaceId: string): Room[] {
    return [...SDKContextClass.instance.spaceStore.getSpaceFilteredRoomIds(spaceId, true)]
        .map((roomId) => cli.getRoom(roomId))
        .filter(
            (room): room is Room =>
                Boolean(room) && !room!.isSpaceRoom() && room!.getMyMembership() === KnownMembership.Join,
        );
}

/** The state a record holds, if it is one this client knows; account data is not trusted to be. */
function recordedState(value: string): RoomNotifState | undefined {
    return Object.values(RoomNotifState).find((state) => state === value);
}

async function forEachLimited<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const worker = async (): Promise<void> => {
        for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}

/**
 * Mutes every joined room of the space and its sub-spaces and remembers the state each room had. The record is written
 * first, marked pending, so an interrupted mute can be finished or undone. Rooms whose rule could not be written are
 * dropped from the record. Resolves with the ids of the rooms that failed.
 */
export async function muteSpace(cli: MatrixClient, spaceId: string): Promise<string[]> {
    const before = getMutedSpaces(cli)[spaceId];
    const rooms: Record<string, string> = { ...before?.rooms };
    const toMute: Room[] = [];
    for (const room of getSpaceRooms(cli, spaceId)) {
        const state = getRoomNotifsState(cli, room.roomId) ?? RoomNotifState.AllMessages;
        if (state === RoomNotifState.Mute) continue;
        rooms[room.roomId] ??= state;
        toMute.push(room);
    }

    const record: MutedSpaces[string] = { mutedAt: before?.mutedAt ?? Date.now(), pending: true, rooms };
    await cli.setAccountData(MUTED_SPACES_EVENT, { ...getMutedSpaces(cli), [spaceId]: record });

    const failed: string[] = [];
    await forEachLimited(toMute, async (room) => {
        try {
            await setRoomNotifsState(cli, room.roomId, RoomNotifState.Mute);
        } catch {
            failed.push(room.roomId);
        }
    });

    const done: Record<string, string> = { ...rooms };
    for (const roomId of failed) delete done[roomId];
    await cli.setAccountData(MUTED_SPACES_EVENT, {
        ...getMutedSpaces(cli),
        [spaceId]: { mutedAt: record.mutedAt, rooms: done },
    });
    return failed;
}

/**
 * Puts every room back to the state it had before the space was muted, then forgets the space. A room the user changed
 * by hand since (it is no longer muted) or has left is left alone. A room that is also in another muted space is not
 * restored; its remembered state moves to that space, which keeps it muted until it is unmuted too. Resolves with the
 * ids of the rooms that failed.
 */
export async function unmuteSpace(cli: MatrixClient, spaceId: string): Promise<string[]> {
    const spaces = getMutedSpaces(cli);
    const record = spaces[spaceId];
    if (!record) return [];

    const others = Object.keys(spaces).filter((id) => id !== spaceId);
    const otherRooms = new Map(others.map((id) => [id, new Set(getSpaceRooms(cli, id).map((room) => room.roomId))]));
    const remaining: MutedSpaces = {};
    for (const id of others) remaining[id] = { ...spaces[id], rooms: { ...spaces[id].rooms } };

    const toRestore: [string, RoomNotifState][] = [];
    for (const [roomId, state] of Object.entries(record.rooms)) {
        const holder = others.find((id) => otherRooms.get(id)!.has(roomId));
        if (holder) {
            remaining[holder].rooms[roomId] ??= state;
        } else if (cli.getRoom(roomId)?.getMyMembership() === KnownMembership.Join) {
            const previous = recordedState(state);
            if (previous && getRoomNotifsState(cli, roomId) === RoomNotifState.Mute) toRestore.push([roomId, previous]);
        }
    }

    const failed: string[] = [];
    await forEachLimited(toRestore, async ([roomId, state]) => {
        try {
            await setRoomNotifsState(cli, roomId, state);
        } catch {
            failed.push(roomId);
        }
    });

    await cli.setAccountData(MUTED_SPACES_EVENT, remaining);
    return failed;
}

/**
 * Brings the muted spaces in line with their rooms, for rooms that joined or left a muted space and for a mute that was
 * interrupted (its record is still pending). A room that joined and is not muted is muted and recorded. A recorded room
 * that is no longer in the space is dropped; if it is still joined, still muted and in no other muted space, it goes
 * back to the state it had. A recorded room that is not muted while the record is pending is muted. A space the user has
 * left, or one that shows no rooms, is left alone: its rooms may only not be loaded yet.
 */
export async function reconcileMutedSpaces(cli: MatrixClient): Promise<void> {
    const spaces = getMutedSpaces(cli);
    const ids = Object.keys(spaces).filter((id) => cli.getRoom(id)?.getMyMembership() === KnownMembership.Join);
    if (ids.length === 0) return;

    const current = new Map(ids.map((id) => [id, new Set(getSpaceRooms(cli, id).map((room) => room.roomId))]));
    const next: MutedSpaces = { ...spaces };
    for (const id of ids) next[id] = { ...spaces[id], rooms: { ...spaces[id].rooms } };

    const toMute = new Set<string>();
    const toRestore: [string, RoomNotifState][] = [];
    let changed = false;

    for (const id of ids) {
        const record = spaces[id];
        const inSpace = current.get(id)!;
        const loaded = inSpace.size > 0 || Object.keys(record.rooms).length === 0;
        if (!loaded) continue;

        for (const [roomId, state] of Object.entries(record.rooms)) {
            if (inSpace.has(roomId)) {
                if (record.pending && getRoomNotifsState(cli, roomId) !== RoomNotifState.Mute) toMute.add(roomId);
                continue;
            }
            delete next[id].rooms[roomId];
            changed = true;
            const holder = ids.find((other) => other !== id && current.get(other)!.has(roomId));
            if (holder) {
                next[holder].rooms[roomId] ??= state;
            } else if (
                recordedState(state) &&
                cli.getRoom(roomId)?.getMyMembership() === KnownMembership.Join &&
                getRoomNotifsState(cli, roomId) === RoomNotifState.Mute
            ) {
                toRestore.push([roomId, recordedState(state)!]);
            }
        }

        for (const roomId of inSpace) {
            if (roomId in next[id].rooms) continue;
            if (ids.some((other) => other !== id && roomId in next[other].rooms)) continue;
            const state = getRoomNotifsState(cli, roomId) ?? RoomNotifState.AllMessages;
            if (state === RoomNotifState.Mute) continue;
            next[id].rooms[roomId] = state;
            toMute.add(roomId);
            changed = true;
        }

        if (record.pending) changed = true;
        delete next[id].pending;
    }

    if (!changed) return;

    if (toMute.size > 0) {
        // The record first, pending, so an interruption can be finished the next time.
        const pending: MutedSpaces = { ...next };
        for (const id of ids) pending[id] = { ...next[id], pending: true };
        await cli.setAccountData(MUTED_SPACES_EVENT, pending);
    }

    const failed = new Set<string>();
    await forEachLimited([...toMute], async (roomId) => {
        try {
            await setRoomNotifsState(cli, roomId, RoomNotifState.Mute);
        } catch {
            failed.add(roomId);
        }
    });
    await forEachLimited(toRestore, async ([roomId, state]) => {
        try {
            await setRoomNotifsState(cli, roomId, state);
        } catch {
            // Left muted and no longer recorded; the user can unmute the room by hand.
        }
    });

    // A room whose rule failed is dropped from the record, so the next pass finds it again and retries.
    for (const id of ids) for (const roomId of failed) delete next[id].rooms[roomId];
    await cli.setAccountData(MUTED_SPACES_EVENT, next);
}
