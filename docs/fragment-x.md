# Fragment X

Fragment X is a thought-project fork of Element Web that explores a Discord-style Matrix client. It is not affiliated
with or endorsed by Element. See the README for the project note and the list of AI tools used.

## Layout

- `apps/web`: the Fragment X web app, built from Element Web and configured as described below.
- `apps/desktop`: Element's Electron desktop app, kept from upstream and not used by Fragment X.
- The Fragment X desktop app: a new Rust app that does not use Electron, to be added next to `apps/web`. It is built on
  the Matrix Rust SDK and aims for parity with Element Web.
- Android and iOS apps are separate forks of Element X (`fragment-x-android`, `fragment-x-ios`).

## Configuration

`apps/web/config.fragment.sample.json` is the Fragment X starting point. Copy it to `apps/web/config.json` (which is
git-ignored) and replace the placeholder homeserver:

```sh
cp apps/web/config.fragment.sample.json apps/web/config.json
# then edit default_server_config: "m.homeserver".base_url and server_name
```

What it sets, all through configuration with no code changes:

- `brand`: `Fragment X`.
- `default_theme`: `custom-Fragment Dark`, defined in `setting_defaults.custom_themes`. The legacy `colors` keys style the
  timeline and accent; the `compound` overrides restyle the left side, because the space rail, left panel and room list all
  use the single Compound token `--cpd-color-bg-canvas-default`. One canvas token means those areas currently share one
  colour; a darker server rail like Discord's needs a CSS change in `apps/web/res/css/structures/_SpacePanel.pcss`.
- `element_call.use_exclusively: true`: Element Call is the only call option. The "Voice call using" menu with Legacy Call
  and Jitsi is not shown, and the call button starts Element Call directly.
- `fragment_x.member_list_default_open: true`: a room with no saved right panel state opens with the member list, like a
  Discord server. A panel the user has opened or closed keeps its state. This is a small code change in
  `apps/web/src/stores/right-panel/RightPanelStore.ts`, not only configuration.
- `fragment_x.rail_search_button: true`: a Search button at the top of the server rail opens the spotlight search (the same
  dialog as `Ctrl/Cmd+K`), so global search is part of the main navigation. See
  `apps/web/src/components/views/spaces/RailSearchButton.tsx`.
- `fragment_x.room_list_toggle_button: true`: a button in the server rail collapses or expands the room list so the chat can
  use the full width (the separator between the room list and the chat does the same on double click and click). See
  `apps/web/src/components/views/spaces/RoomListToggleButton.tsx`.
- `fragment_x.user_panel: true`: the room list column ends in a user panel like Discord's (avatar and name with the user
  menu, a settings button, and a microphone mute button while the user is in an Element Call). The server rail no longer
  shows the user menu. Element Call has no deafen control, so there is no deafen button. See
  `apps/web/src/components/views/spaces/UserPanel.tsx`.
- `fragment_x.home_direct_messages: true`: Home is titled "Direct Messages" and opens with the People filter applied, so it
  lists direct messages like Discord's home. The People chip can be switched off to see every room again; other spaces
  are unaffected. See `applyHomeDefaultFilter` in `apps/web/src/viewmodels/room-list/RoomListViewModel.ts`.
- `fragment_x.home_top_bar: true`: the Home page gets a top bar like Discord's Friends page: People (direct chats),
  Servers (the spaces you are in, with member and room counts; a row selects the space, and Discover opens the room
  directory), Pending (invites) and Blocked (ignored users, with Unblock) tabs, an Add Friend button that starts a direct chat, and
  buttons for a new group chat and help. A user with no direct chats still sees the welcome content. See
  `apps/web/src/components/structures/HomeTabs.tsx`.
- `fragment_x.double_click_reply: true`: double clicking a message starts a reply to it, like Discord. Links, images, media
  and buttons inside the message keep their own behaviour, and nothing happens while editing the message or when the
  user cannot send messages. See `onDoubleClick` in `apps/web/src/components/views/rooms/EventTile.tsx`.
- `fragment_x.member_list_roles: true`: the member list groups people under role headings (Owner, Admin, Moderator,
  Members, with counts) that collapse and expand, and highlights the user's own entry. Power levels are grouped into tiers:
  an infinite level is Owner, 100 and up Admin, 50 and up Moderator, the rest Members. Which headings are collapsed is
  remembered in the browser. See `apps/web/src/components/views/rooms/MemberList/memberRoles.ts`.
- `fragment_x.discord_sections: true`: the room list sections look like Discord's: the favourites section is titled
  "Pinned", the people section "Direct Messages", and section headings are small capitals. Sections and the people section
  are Element settings that are on by default (Settings > Appearance); this option changes titles and styling only.
- `fragment_x.colour_editor: true`: Appearance settings gets a Colours section where each user picks an accent colour,
  a server rail colour, a room list and panels colour and a chat background colour, with a reset for each. The chat
  colour is the timeline, header and composer of a custom theme (the default one); a built-in theme has no separate
  chat colour, there "Room list and panels" also changes the chat. A change shows at once and is saved to
  the account (the `FragmentX.colours` setting, so it follows the user to other devices) after a short delay. The colours
  are applied as Compound token overrides on top of the theme, see
  `apps/web/src/settings/watchers/FragmentXColoursWatcher.ts`. Without the option nothing is applied or shown.
- `fragment_x.inbox_mentions: true`: the Threads activity centre in the server rail gets a Mentions tab (first, and the one it
  opens on) listing the rooms with unread mentions, with a counter each; a click opens the room. Muted rooms and spaces are
  left out, and a mention anywhere lights the rail button. This is the first step of an inbox limited to the conversations
  you follow. See `apps/web/src/components/views/spaces/threads-activity-centre/useMentionRooms.ts`.
- `fragment_x.unified_tree: true`: the server rail is the whole navigation. Each space lists its sub-spaces and then its
  rooms (pinned first, then by name, with unread badges) under it, as one tree, and the room list column is gone. The
  rail's Expand and Collapse button (`room_list_toggle_button`) shows or hides the names, so the collapsed rail is the
  same tree as avatars. Spaces collapse and expand per space. The user panel moves to the bottom of the rail. The room
  list filters, sections and sorting are not available in this mode. See
  `apps/web/src/components/views/spaces/SpaceRoomRows.tsx`.
- `fragment_x.inbox_for_you: true`: the Threads activity centre in the server rail becomes the inbox. The button and panel are
  called Inbox. It opens on a For you tab: one collapsed row per conversation you follow, each with a counter and the
  newest first, either a thread you took part in or a room where you were mentioned (muted rooms are left out). The other
  tab is Unread threads. Mark all read clears the rooms behind the For you rows. This supersedes the Mentions tab of
  `inbox_mentions`. See `apps/web/src/components/views/spaces/threads-activity-centre/forYou.ts`.
- `fragment_x.single_room_info_button: true`: the room header has one Room info button, the room name. The separate info
  icon next to the call buttons, which opened the same panel, is not shown.
- `fragment_x.mute_server: true`: the context menu of a space has Mute server and Unmute server. Muting mutes every joined
  room of the space and its sub-spaces (the usual per-room mute, so it also silences mentions and holds on other devices
  and clients) and saves the notification state each room had in the account data event `io.fragmentx.muted_spaces`.
  Unmuting puts every room back to that state; a room that was muted before, was changed by hand since or was left is
  not touched, and a room that is also in another muted space stays muted until that space is unmuted too. A space of
  many rooms takes a moment: the rules are written three at a time. See `apps/web/src/utils/muteSpace.ts`. A watcher
  (`FragmentXMutedSpacesWatcher`) keeps muted spaces in line with their rooms: a room that joins a muted space is muted and
  recorded, a room that leaves it is dropped (and put back to its recorded state if it is still joined and muted), and a
  mute that was interrupted is finished. It runs in every open app a couple of seconds after a change.
- `disable_custom_urls` and `disable_guests`: a single-server deployment without guest access.
- The Element-hosted integration manager, room directory and presence defaults for matrix.org are removed.

## Homeserver requirements

Native sliding sync, and for calls the MatrixRTC settings from Element Call's self-hosting guide (delayed events,
`matrix_rtc.transports`, an SFU such as LiveKit with `lk-jwt-service`).

## Build

```sh
pnpm install --frozen-lockfile
cd apps/web && pnpm build   # output in apps/web/webapp
```

The repository pins a pnpm version in `devEngines`; install that version first.

## Maintenance

Changes to Element Web are kept as small commits on top of `develop` and rebased on each upstream release. Configuration
and theme changes live in the sample config; code and CSS changes are separate commits.
