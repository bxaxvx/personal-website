import yaml from "js-yaml";
import fs from "node:fs";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import {
  CACHE_DIR,
  CARDS_CACHE_DIR,
  SOURCE_DIR,
  listSlugs,
  loadCards,
  loadGameSites,
} from "./_config/game-sites.mjs";

export default function (eleventyConfig) {
  eleventyConfig.addDataExtension("yml,yaml", (contents) =>
    yaml.load(contents),
  );

  // Render dates in English regardless of the build machine's locale.
  eleventyConfig.setLiquidOptions({ locale: "en-US" });

  // Locale-independent RFC-822 date for RSS feeds (always English).
  eleventyConfig.addFilter("rfc822", (date) => new Date(date).toUTCString());

  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("vendor/**");
  ["fonts", "images", "videos", "vendor", "style.css", ".well-known", ".htaccess"].forEach((path) =>
    eleventyConfig.addPassthroughCopy(path),
  );

  // Game subsites (see _config/game-sites.mjs). Steam data is fetched before
  // each build; the pages in game-sites/_pages/ paginate over it.
  eleventyConfig.addWatchTarget(`${SOURCE_DIR}/**/site.yml`);
  eleventyConfig.on("eleventy.before", async () => {
    await loadGameSites({ reset: true });
    await loadCards({ reset: true });
  });
  eleventyConfig.addGlobalData("gameCards", () => loadCards());
  eleventyConfig.addGlobalData("gameSites", () => loadGameSites());
  eleventyConfig.addGlobalData("gameSitesWithTeam", async () =>
    (await loadGameSites()).filter((game) => game.team.length),
  );
  eleventyConfig.addGlobalData("gameSitesWithPressKit", async () =>
    (await loadGameSites()).filter((game) => game.presskit),
  );
  eleventyConfig.addGlobalData("gameSitesWithPress", async () =>
    (await loadGameSites()).filter((game) => game.press.length),
  );
  fs.mkdirSync(CARDS_CACHE_DIR, { recursive: true });
  eleventyConfig.addPassthroughCopy({ [CARDS_CACHE_DIR]: "images/games" });
  for (const slug of listSlugs()) {
    fs.mkdirSync(`${CACHE_DIR}/${slug}`, { recursive: true });
    eleventyConfig.addPassthroughCopy({
      [`${CACHE_DIR}/${slug}`]: `${slug}/steam`,
      [`${SOURCE_DIR}/${slug}/images`]: `${slug}/images`,
    });
    eleventyConfig.ignores.add(`${SOURCE_DIR}/${slug}/**`);
  }
  eleventyConfig.ignores.add(`${SOURCE_DIR}/README.md`);

  // Whether _includes/icons/<name>.svg exists, for links with arbitrary names.
  eleventyConfig.addFilter("hasIcon", (name) =>
    fs.existsSync(`_includes/icons/${name}.svg`),
  );

  eleventyConfig.addLayoutAlias("game", "game.liquid");
  eleventyConfig.addLayoutAlias("plain", "plain.liquid");
  eleventyConfig.addLayoutAlias("default", "default.liquid");
  eleventyConfig.setLayoutResolution(false);

  // Set global permalinks to resource.html style
  eleventyConfig.addGlobalData("permalink", () => {
    return (data) =>
      `${data.page.filePathStem}.${data.page.outputFileExtension}`;
  });

  // Remove .html from `page.url` entries
  // Remove the trailing slash from game subsite URLs (/saturn94/ -> /saturn94);
  // .htaccess serves the folder's index.html for both.
  eleventyConfig.addUrlTransform((page) => {
    if (page.url.endsWith(".html")) {
      return page.url.slice(0, -1 * ".html".length);
    }
    if (page.url.length > 1 && page.url.endsWith("/")) {
      return page.url.slice(0, -1);
    }
  });

  eleventyConfig.addPlugin(feedPlugin, {
    type: "rss",
    outputPath: "/feed.xml",
    collection: { name: "post" },
    metadata: {
      language: "en",
      title: "Andrii Bychkovskyi — Blog",
      subtitle: "Reflections on how things work",
      base: "https://bychkovskyi.com/",
      author: { name: "Andrii Bychkovskyi" },
    },
  });
}
