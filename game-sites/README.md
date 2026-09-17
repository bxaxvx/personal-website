# Game subsites

Every folder here becomes a subsite: `game-sites/saturn94/` →
`https://bychkovskyi.com/saturn94`. Folders starting with `_` are skipped
(`_pages/` holds the page templates; rename a game to `_saturn94` to hide it).

```
game-sites/
  saturn94/
    site.yml       # config (required)
    images/        # team photos etc. (optional) → /saturn94/images/
```

Build as usual with `npx @11ty/eleventy` and upload `_site/`. The build asks
Steam for the game's current data every time, so releasing the game or editing
the description or screenshots on Steam shows up on the site as soon as you
rebuild. The same data also feeds the cards on the site-wide Games page.

Responses and images are kept in `.cache/`: images are only downloaded when
they're new, and if Steam is unreachable the build falls back to the cached
copy and prints a warning. `STEAM_CACHE=1 npx @11ty/eleventy` builds from the
cache without touching the network.

## site.yml

```yaml
steam: 5039320                 # required: app ID (or store URL)
title: Saturn 94               # optional, defaults to the Steam name
description: ...               # optional, defaults to Steam's short description
trailer: https://youtu.be/...  # optional, YouTube link or video ID

stores:                        # optional, after the automatic Steam button
  - name: itch.io              #   ("Wishlist on Steam" before release,
    url: https://...           #    "Buy on Steam" after)
    label: Buy on itch.io      #   optional, defaults to "Get on <name>"

socials:                       # optional, icon row on the main page
  - name: Discord
    url: https://discord.gg/...

team:                          # optional, adds the Team page
  - name: Jane Doe
    role: Art, animation       # optional
    photo: jane.jpg            # optional: file in images/, or a URL
    links:                     # optional
      - name: x.com
        url: https://x.com/...

press:                         # optional, adds the Featured In page
  - date: 2026-06-25           #   (same list and RSS feed as the site-wide one)
    lang: uk                   #   "uk" or "en"
    title: "Interview about the game"
    url: https://...

presskit:                      # optional, adds the Press Kit page
  url: https://...             # press kit link
  email: press@example.com     # optional contact
```

Link `name`s pick an icon from `_includes/icons/` (`Discord`, `Steam`,
`itch.io`, `x.com`, `YouTube`, `Instagram`, `Linkedin`, `GitHub`, `Mastodon`,
…). Unknown names get a generic globe icon. The hover color comes from the
link with the same name in `_data/links.yml`; set `color: ff0000` to override.
