# Personal website

My personal homepage, built with [Eleventy](https://www.11ty.dev/).

## License and attribution

This site is a fork of [kramo.page](https://codeberg.org/kramo/kramo.page)
by Laura Kramolis (kramo), licensed under the
[GNU AGPL v3.0](LICENSE).

Modified by bxaxvx starting in 2026. In accordance with the AGPL,
the full source code of this modified version is published at
<https://github.com/bxaxvx/personal-website> and linked from the
site footer ("Website Source").

## The `mysite` command

```bash
npm install
mysite              # list the commands
```

| Command | What it does |
| --- | --- |
| `mysite press [url]` | add a press mention |
| `mysite dev` | local preview on <http://localhost:8080> |
| `mysite build` | build into `_site/` |
| `mysite deploy` | build and upload to the server |

`mysite` is a symlink on `PATH` pointing at the `site` script in this
repository, so the commands work from any directory — the script moves itself
to the repository root before doing anything. Recreate it with:

```bash
ln -s "$PWD/site" ~/.local/bin/mysite
```

Inside the repository `./site` does exactly the same thing. `npx @11ty/eleventy`
and `npx @11ty/eleventy --serve` also still work as before; this only wraps them.

### Adding a press mention

```bash
mysite press https://example.com/interview
```

It reads the page and pre-fills the title, publication date and language, then
asks where the entry belongs: the site-wide list in `_data/articles.yml`, any
game's list in `game-sites/<game>/site.yml`, or several at once. Every field is
editable before anything is written — pages lie about their dates often enough
that the suggestion is only ever a starting point, and a page that does not
answer at all just leaves the fields empty.

Nothing is merged behind your back: the site-wide list and the per-game lists
stay separate, and a link that belongs in both is added to both because you
said so. A link already present in a file is skipped rather than duplicated.

The languages available for `lang:` come from `_data/languages.yml`. To add
one, put a flag SVG in `images/flags/` and add a line there; a code that is
missing from that file renders as a plain text badge, so the mistake is
visible on the page instead of quietly showing the wrong flag.

### Deploying

Copy the example config and fill in the server:

```bash
cp deploy.config.example.json deploy.config.json
```

`deploy.config.json` is gitignored — this repository is public, so the host
and account name stay out of it. If SSH still asks for a password, set up a
key first with `ssh-copy-id <user>@<host>`.

```bash
mysite deploy --dry-run   # show what would change, upload nothing
mysite deploy             # build, show the changes, ask, then upload
```

The deploy mirrors `_site/` to the server with `rsync` over SSH, so only
changed files travel. Three things stand between a typo and a broken site:

* the build runs with `STEAM_STRICT=1`, so if Steam is unreachable the deploy
  fails instead of publishing pages built from the stale `.cache/` copy;
* nothing is uploaded until you have seen the list of added, updated and
  deleted files and confirmed it;
* files on the server that are not in `_site/` get deleted, so a wrong `path`
  would wipe a folder — an unusually large number of deletions stops the
  deploy and asks for `--force`.

Anything on the server that should survive a deploy (logs, uploads) belongs in
the config's `exclude` list.

## Layout

```
_data/           site-wide data: press entries, games, links, languages
_config/         Eleventy helpers
_config/cli/     the ./site commands
_includes/       layouts, icons, shared partials
game-sites/      one folder per game subsite — see game-sites/README.md
posts/           blog posts
```
