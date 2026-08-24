# Store listing copy

Everything a Chrome Web Store or Edge Add-ons dashboard asks for in words, so
the answers are written once, reviewed once, and pasted twice. This file is the
**copy**. The procedure around it — which account, which fee, which order — is
tracked separately and is not part of this repository.

Two rules hold this file together:

- **A justification says what the feature does, not what the permission is
  called.** Restating the permission is the single most common reason a review
  comes back, because it answers nothing the reviewer could not read off the
  manifest themselves.
- **Every claim here is checkable against `manifest.json` in the same commit.**
  If a permission is added and this file is not, the justification below is
  describing a build that no longer exists.

## The one thing to set

The domain is **not registered yet**. `cdcra2.com` is the recommendation —
free as of 2026-08-23, with its whole matching TLD set. If a different name is
bought, it is replaced here, in
`site/build.mjs --base`, and nowhere else.

| Field | Value |
| --- | --- |
| Homepage URL | `https://cdcra2.com/` |
| Privacy policy URL | `https://cdcra2.com/privacy.html` |
| Support URL | `https://cdcra2.com/` — until there is somewhere better to send people |

## Identity

| Field | Value |
| --- | --- |
| Name | Companion for Chrono Divide |
| Category | Games (Chrome) / Games & Entertainment (Edge) |
| Language | English |

The name is deliberately the "Companion for X" form: it states the relationship
without claiming the relationship is official, and it lets the description carry
an affiliation line that can change later without renaming the item.

## Summary

One line, and both stores cut it short — Chrome at 132 characters. This is 98:

> Map renders, faction labels and build hotkeys for Chrono Divide. Everything stays in your browser.

## Description

> **An unofficial companion for the browser game Chrono Divide.** It is not made
> by, endorsed by or affiliated with the Chrono Divide team.
>
> The client already knows more about your match than it shows you. This
> extension draws the rest of it, and gives a keyboard to the things that only
> had a mouse.
>
> **Before the match**
> • Faction labels next to every player — the country in words, not a flag to recognise
> • A full render of the map on the loading screen, where the client shows nothing
> • Your own per-map notes, shown when that map comes up
>
> **During it**
> • Build hotkeys — one press queues one of something; placement stays yours
> • Build chords — a sidebar tab opens as a grid of cameos under the cursor, laid out like the keys themselves, showing only what you can actually order and what each queue is holding
> • Queue-next and cancel keys, including the game's own Ctrl+click order, which the game gives no key to
> • Superweapon keys — once you own one, its building's key aims it
> • A production panel showing all six queues at once, including the ones the sidebar cannot draw
> • The pause menu moved off Escape, so Abort Mission stops being one reflex away
> • Player colours you choose, applied to units, buildings, radar and health bars
> • Net and memory readouts — ping, order round-trip, frame rate, and what the tab is holding, which no browser reports to a page
>
> **After it**
> • Read a ladder replay as a build order — both players on one clock, with production, losses and APM
>
> Every key is rebindable, and every panel can be moved and resized.
>
> **Nothing leaves your browser.** No account, no analytics, no server of ours to
> talk to. Your settings, notes and renders live in the browser's own extension
> storage. The only requests the extension makes are to Chrono Divide's own
> servers, for your replays and your match list.
>
> Red Alert 2 and its assets belong to their owners.

## Single-purpose statement

> The extension has one purpose: to present information about a Chrono Divide
> match that the game's own client already holds but does not display, and to
> bind keyboard shortcuts to actions the client already performs. It runs on one
> site, `game.chronodivide.com`, and does nothing on any other page.

## Permission justifications

One per entry in `manifest.json`, in the order the manifest lists them.

| Permission | Justification |
| --- | --- |
| `storage` | Keeps the user's own settings, key bindings and per-map notes, and caches the map renders the extension draws, so a map is rendered once rather than on every loading screen. |
| `unlimitedStorage` | A single full-size map render is on the order of twenty megabytes and the extension caches a set of them; the default quota holds two or three maps before evicting the work it just did. |
| `https://game.chronodivide.com/*` (host access) | This is the game itself, and the extension is an overlay on it: it reads the match state the page already holds and draws its panels into that page. It is the only site the extension runs on. |
| `https://replays-eu.chronodivide.com/*`, `https://replays-sea.chronodivide.com/*` | Downloads a replay file the user has asked to open, from the game's own replay servers, so a build order can be read out of it. |
| `https://wol-eu.chronodivide.com/*`, `https://wol-sea.chronodivide.com/*` | Lists the user's own recent ranked matches from the game's ladder API, so they can pick one to read, and samples which maps the ranked queues are currently playing. |

No `tabs`, no `scripting`, no `<all_urls>`, no remote code: everything the
extension runs is in the package.

## Data usage

The honest answer to every collection question is **no**, and the form is
mandatory anyway. Ticking any collection box makes a privacy-policy URL
required — the site carries one either way, at the URL above.

| Question | Answer |
| --- | --- |
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |
| Is any data sold to third parties | No |
| Is any data used or transferred for purposes unrelated to the item's single purpose | No |
| Is any data used or transferred to determine creditworthiness or for lending | No |

The player name typed on the site's Replays page is sent to Chrono Divide's own
ladder API by the user's own action, from the website, not from the extension —
it is stated on the privacy page for completeness.

## Assets

| Asset | State |
| --- | --- |
| Icon, 128×128 | In the package (`icons/icon-128.png`) |
| Logo, 300×300 (Edge) | `store/logo-300.png`, written by `scripts/gen-icon.mjs` |
| Screenshots, 1280×800 or 640×400 | **Not made yet** — needs a live match, so it is the user's to shoot |
| Promotional tiles | Optional in both stores; skipped |

Confirm both dimension sets against the live dashboards before uploading: both
stores have moved them before, and a rejected asset costs a review cycle.
