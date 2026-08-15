import yaml from "js-yaml";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";

export default function (eleventyConfig) {
  eleventyConfig.addDataExtension("yml,yaml", (contents) =>
    yaml.load(contents),
  );

  // Locale-independent RFC-822 date for RSS feeds (always English).
  eleventyConfig.addFilter("rfc822", (date) => new Date(date).toUTCString());

  eleventyConfig.ignores.add("README.md");
  ["fonts", "images", "videos", "style.css", ".well-known", ".htaccess"].forEach((path) =>
    eleventyConfig.addPassthroughCopy(path),
  );

  eleventyConfig.addLayoutAlias("plain", "plain.liquid");
  eleventyConfig.addLayoutAlias("default", "default.liquid");
  eleventyConfig.setLayoutResolution(false);

  // Set global permalinks to resource.html style
  eleventyConfig.addGlobalData("permalink", () => {
    return (data) =>
      `${data.page.filePathStem}.${data.page.outputFileExtension}`;
  });

  // Remove .html from `page.url` entries
  eleventyConfig.addUrlTransform((page) => {
    if (page.url.endsWith(".html")) {
      return page.url.slice(0, -1 * ".html".length);
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
