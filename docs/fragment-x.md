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
  mute that was interrupted is finished. It runs in every open app a couple of seconds after a change. A muted space shows a small muted bell on
  its icon, in the rail and in the tree, and its icon and name are dimmed.
- `fragment_x.room_context_menu: true`: with the unified tree there is no room list column, which had the room menu. A room
  row in the tree gets the same menu (mark as read or unread, favourite, low priority, invite, copy link, leave) on right
  click and on a three dot button that shows on hover, and the room header gets a bell with the room's notification
  settings (default, all messages, mentions and keywords, mute). Both reuse Element's room list item menus, see
  `apps/web/src/components/views/spaces/SpaceRoomRows.tsx` and `RoomHeader.tsx`.
- `fragment_x.unified_frame: true`: the top bar of a room has the colour of the server rail, so the rail and the top bar are
  one frame around the chat (the colour editor's Server rail colour sets both). Every icon in the rail, the room header and
  the composer is a 24px glyph in a 32px button. Spaces, subspaces and rooms in the rail all have the same 32px icon.
  Every icon in the rail is centred on one vertical axis and every name starts at the same x: there is no indent for
  subspaces and rooms; an open space and its rows share a highlight and each open subspace with its rooms has a second,
  darker one inset in it instead. The Inbox, the user's avatar (32px too) and the names beside them use the same axis and text offset. There are no arrows and no selection or unread pills in the left column: a space opens when the selection is in it (the selected space and the spaces around it; the others are closed), clicking the selected space again closes it and a third click opens it, and Messages always lists its conversations. Every user, space, subspace and room icon is a circle, and a rounded square while the pointer is over it or it is selected. The frame is a grid of square cells as wide as the rail (68px): the top bar is one cell high, so the search icon is
  centred on both the rail column and the bar next to it, an icon at the right end of the bar is as far from the edge as
  the search icon is from the left one, and the user's avatar and the composer row are centred in a cell at the bottom.
  Icon buttons are 32px with 8px around them. The corner where the rail and the top bar meet the chat is rounded (16px).
  Every icon that is not a person, a space or a room (Search, Collapse, Inbox, settings, the icons in the top bar) has the
  same hover: no box, the icon brightens and glows. The highlights around a space and around a subspace have 4px between
  them and what is next to them or inside them, and the selected or hover highlight of every row (a space, a subspace, a
  room, a direct message) ends 14px from each edge of the rail, so it is inside the trays; in the icons only rail it is a
  40px tile. The menu items of the room info card and of the user menu have no dark box: they take the colour behind them
  and the item under the pointer has the same 8px rounded highlight as a rail row; the side panel's header has no line
  under the search box. The styles are in
  `apps/web/res/css/structures/_FragmentXFrame.pcss`, under the class `mx_MatrixChat_fragmentXFrame` that `LoggedInView`
  adds.
- `fragment_x.servers_entry: true`: the rail has a Servers entry (a grid icon) above the servers, after a divider, in place of
  the plus button below them, like Discord's. It opens Home on the Servers tab (needs `home_top_bar`), which lists the
  servers and has Create a space and Discover buttons. The tab shown on Home is shared state, see `useHomeTab` in
  `apps/web/src/components/structures/HomeTabs.tsx`.
- `fragment_x.messages_entry: true` (needs `unified_tree`; `servers_entry` for the second part): Home is called Messages in
  the rail, with a chat icon, and lists only the direct messages, pinned first, each with its latest message as a second
  line (the same preview text the room list uses). The rooms that are in no space are listed under the Servers entry as
  Other rooms. The Home page and its tabs are unchanged.
- `fragment_x.pinned_messages: true` (needs `messages_entry`): Messages in the rail lists only the conversations that matter:
  the pinned direct messages first (by name), then the unread ones (newest first), and the open one if it is neither, so it
  does not vanish while it is read. A click on Messages shows the Home page on its People tab, the list of all your
  conversations, instead of the conversation that was open last. A pin button in the room header of a direct message pins
  it; a pin is the room's favourite tag (the same as Favourite in the context menu and in other clients). See
  `selectMessagesRooms` in `apps/web/src/components/views/spaces/SpaceRoomRows.tsx`.
- `fragment_x.user_presence: true` (needs `user_panel`): the user panel shows a dot on the user's avatar (green for online,
  amber for idle) and, in the expanded rail, a line under the name (Online or Idle). It shows only while the homeserver
  reports the user as online or idle: a server without presence (see `enable_presence_by_hs_url`), or an offline user,
  shows nothing, rather than a wrong Online. The data is the user's own `User.presence`; see `computePresence` in
  `apps/web/src/viewmodels/menus/UserMenuViewModel.ts`.
  The user menu (a click on the avatar, collapsed or expanded) also lists the choices Automatic, Online, Idle and
  Invisible. Automatic follows the user's activity (online, idle after 3 minutes); the others stay until changed, are kept
  in this browser (`mx_fragment_x_presence`) and set the presence the homeserver reports for the user to others (Invisible
  is offline). See `Presence.setOverride` in `apps/web/src/Presence.ts`.
- `fragment_x.header_icons: true`: the room header has a side panel toggle at the right end, like Discord's, that shows or
  hides the panel with whatever it holds (its icon is the left column's collapse icon, mirrored). The toggle works in a room
  that has no saved panel state yet. Threads, pinned messages and search are not in the header, because the room info card
  in the side panel has them; the notification options show in the header only while the side panel is open. The call start
  buttons show only in a direct message (in a call or its lobby they stay, so the call can be left). The member count still
  opens the member list.
- `fragment_x.narrow_collapse: true`: when the window is narrower than 1100px the space panel collapses to its icons-only
  view and the right panel closes, and a room does not open its panel by default (`member_list_default_open`) while the
  window is that narrow. Only the change to narrow does it, so either panel can be opened again. See
  `apps/web/src/utils/narrowWindow.ts` and `SpacePanel.tsx`.
- `fragment_x.chat_cosmetics: true`: three touches of Discord's in the chat. The time shows beside the name of the sender in
  the first message of a group (the messages that follow keep the time on hover, in the gutter); the date between days is a
  centred pill on the line; and the attachment button is a plus at the left of the composer, with the emoji and the other
  buttons staying on the right. See `EventTile.tsx` (`mx_EventTile_senderLine`), `MessageComposerButtons.tsx` and
  `apps/web/res/css/structures/_FragmentXChat.pcss`.
- `fragment_x.active_now: true` (needs `home_top_bar`): the people tab of the Home page has an Active Now column beside the
  list, like Discord's: the people you have a direct chat with who are online or idle (online first, then by name), with a
  status line and a dot; a row opens the chat. Only people you chat with are listed, and only while the homeserver reports
  them as online or idle; an offline or unknown person is left out, and with no presence on the server the column is not
  shown. See `ActiveNow` in `apps/web/src/components/structures/HomeTabs.tsx`.
- `fragment_x.server_unread: true`: a server (space) with unread messages has a small pill on the left edge of its row and,
  in the expanded rail, a line under its name such as "3 new messages in 2 rooms" ("New activity in 2 rooms" when the
  rooms have only unread activity and no count). The numbers are added up from the notification state of each joined
  room of the space and its subspaces, so muted rooms count for nothing; see `useSpaceUnread` in
  `apps/web/src/hooks/useSpaceUnread.ts`. A selected server keeps its tall pill.
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
