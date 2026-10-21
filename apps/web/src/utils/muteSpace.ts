/*
Copyright 2026 Fragment X contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type Room, KnownMembership } from "matrix-js-sdk/src/matrix";

import { RoomNotifState, getRoomNotifsState, setRoomNotifsState } from "../RoomNotifs";
import { SDKContextClass } from "../contexts/SDKContextClass";

/** The account data event that holds the muted spaces, so the state follows the user to every device. */
export const MUTED_SPACES_EVENT = "io.fragmentx.muted_spaces";

/**
 * One muted space: when it was muted, and the notification state each of its rooms had before, to put it back on
 * unmute. A room that was already muted is not recorded: the user muted it on purpose and it stays muted.
 */
// Type aliases, not interfaces: account data content must be assignable to Record<string, unknown>.
export type MutedSpace = {
    mutedAt: number;
    /** True while the room rules are being written, so an interrupted mute can be seen and finished. */
    pending?: boolean;
    rooms: Record<string, RoomNotifState>;
};
export type MutedSpaces = Record<string, MutedSpace>;

/** How many push rule requests are in flight at once. A space can have many rooms and the homeserver rate limits. */
const CONCURRENCY = 3;

export function getMutedSpaces(cli: MatrixClient): MutedSpaces {
    return cli.getAccountData(MUTED_SPACES_EVENT)?.getContent<MutedSpaces>() ?? {};
}

export function isSpaceMuted(cli: MatrixClient, spaceId: string): boolean {
    return Boolean(getMutedSpaces(cli)[spaceId]);
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
    const rooms: Record<string, RoomNotifState> = { ...before?.rooms };
    const toMute: Room[] = [];
    for (const room of getSpaceRooms(cli, spaceId)) {
        const state = getRoomNotifsState(cli, room.roomId) ?? RoomNotifState.AllMessages;
        if (state === RoomNotifState.Mute) continue;
        rooms[room.roomId] ??= state;
        toMute.push(room);
    }

    const record: MutedSpace = { mutedAt: before?.mutedAt ?? Date.now(), pending: true, rooms };
    await cli.setAccountData(MUTED_SPACES_EVENT, { ...getMutedSpaces(cli), [spaceId]: record });

    const failed: string[] = [];
    await forEachLimited(toMute, async (room) => {
        try {
            await setRoomNotifsState(cli, room.roomId, RoomNotifState.Mute);
        } catch {
            failed.push(room.roomId);
        }
    });

    const done: Record<string, RoomNotifState> = { ...rooms };
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
            if (getRoomNotifsState(cli, roomId) === RoomNotifState.Mute) toRestore.push([roomId, state]);
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
