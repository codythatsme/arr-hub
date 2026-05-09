import { describe, expect, it } from "@effect/vitest"

import {
  BUILT_IN_CARDIGANN_DEFINITIONS,
  getBuiltInCardigannRuntimeDefinition,
  parseCardigannDefinitionYaml,
  parseCardigannRuntimeDefinitionYaml,
} from "./CardigannDefinitionLoader"

describe("CardigannDefinitionLoader", () => {
  it("parses Cardigann-style YAML into indexer definition seeds", () => {
    const definition = parseCardigannDefinitionYaml(`
id: example-cardigann
name: Example Cardigann
description: Example private tracker
type: semi-private
links:
  - https://tracker.example
version: fixture-1
tags:
  - movies
settings:
  - name: passkey
    label: Passkey
    type: input
    required: true
    helpText: Account passkey
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
    - id: tv-hd
      cat: TV/HD
      desc: TV HD
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep]
`)

    expect(definition).toMatchObject({
      definitionKey: "example-cardigann",
      displayName: "Example Cardigann",
      protocol: "torrent",
      implementation: "cardigann_yaml",
      baseUrl: "https://tracker.example",
      privacy: "semi_private",
      supportsRss: true,
      supportsSearch: true,
      tags: ["movies"],
      version: "fixture-1",
    })
    expect(definition.authFields).toEqual([
      {
        name: "passkey",
        label: "Passkey",
        type: "text",
        required: true,
        helpText: "Account passkey",
      },
    ])
    expect(definition.categories).toEqual([
      { trackerCategory: "movies", trackerCategoryDesc: "Movies", newznabCategory: 2000 },
      { trackerCategory: "tv-hd", trackerCategoryDesc: "TV HD", newznabCategory: 5040 },
    ])
    expect(definition.capabilities).toEqual({
      searchTypes: ["search", "movie", "tvsearch"],
      categories: [
        { id: 2000, name: "Movies" },
        { id: 5040, name: "TV HD" },
      ],
    })
  })

  it("loads the built-in curated fixture definitions", () => {
    expect(BUILT_IN_CARDIGANN_DEFINITIONS.map((definition) => definition.definitionKey)).toEqual([
      "public-domain-movie-torrents",
      "open-tv-torrents",
      "nyaa",
      "animetosho",
      "animetorrents",
      "bakabt",
      "nebulance",
      "anidex",
      "shizaproject",
      "subsplease",
      "torrents-csv",
      "knaben",
      "torrentday",
      "iptorrents",
      "retroflix",
      "speedapp",
      "beyond-hd",
      "bit-hdtv",
      "torrentbytes",
      "torrentsyndikat",
      "scenehd",
      "scenetime",
      "hd-space",
      "speedcd",
      "hd-torrents",
      "funfile",
      "immortalseed",
      "xspeeds",
      "xthor",
      "revolutiontt",
      "pretome",
      "morethantv",
      "hdaccess",
      "torrent-network",
    ])
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "public-domain-movie-torrents",
      )?.capabilities.searchTypes,
    ).toEqual(["search", "movie"])
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "nyaa")
        ?.capabilities,
    ).toEqual({
      searchTypes: ["search", "tvsearch"],
      categories: [
        { id: 5070, name: "Anime English-translated" },
        { id: 5070, name: "Anime Raw" },
      ],
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "animetosho")
        ?.baseUrl,
    ).toBe("https://feed.animetosho.org")
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "animetorrents",
      ),
    ).toMatchObject({
      displayName: "AnimeTorrents",
      baseUrl: "https://animetorrents.me/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "anime", "movies", "tv", "music", "books", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "cookie", type: "cookie", required: true }),
        expect.objectContaining({
          name: "freeleechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
        expect.objectContaining({
          name: "downloadableOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2040, name: "Anime Movie HD" },
          { id: 5070, name: "Anime Series" },
          { id: 7030, name: "Manga" },
          { id: 3060, name: "Doujin Music" },
          { id: 3030, name: "Audiobooks" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "bakabt"),
    ).toMatchObject({
      displayName: "BakaBT",
      baseUrl: "https://bakabt.me/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "anime", "movies", "tv", "music", "books", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
        expect.objectContaining({
          name: "freeleechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
        expect.objectContaining({
          name: "adultContent",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 5070, name: "Anime Series" },
          { id: 5070, name: "OVA" },
          { id: 3050, name: "Soundtrack" },
          { id: 7030, name: "Manga" },
          { id: 2000, name: "Anime Movie" },
          { id: 3020, name: "Music Video" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "nebulance"),
    ).toMatchObject({
      displayName: "Nebulance",
      baseUrl: "https://nebulance.io/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "tv", "json", "api"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "apiKey", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 5000, name: "Season" },
          { id: 5000, name: "Episode" },
          { id: 5030, name: "TV SD" },
          { id: 5040, name: "TV HD" },
          { id: 5045, name: "TV UHD" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "anidex"),
    ).toMatchObject({
      displayName: "Anidex",
      baseUrl: "https://anidex.info/",
      privacy: "public",
      tags: ["public", "anime", "html"],
      capabilities: {
        searchTypes: ["search", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 5070, name: "Anime - Sub" },
          { id: 7020, name: "Light Novel" },
          { id: 7030, name: "Manga - Translated" },
          { id: 3010, name: "Music - Lossy" },
          { id: 4050, name: "Games" },
          { id: 8000, name: "Other" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "shizaproject",
      ),
    ).toMatchObject({
      displayName: "ShizaProject",
      baseUrl: "https://shiza-project.com/",
      privacy: "public",
      tags: ["public", "anime", "json", "graphql"],
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 5070, name: "TV" },
          { id: 5070, name: "OVA" },
          { id: 2000, name: "MOVIE" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "subsplease",
      ),
    ).toMatchObject({
      displayName: "SubsPlease",
      baseUrl: "https://subsplease.org/",
      privacy: "public",
      supportsSearch: true,
      tags: ["public", "anime", "json"],
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: [
          { id: 5070, name: "Anime" },
          { id: 2020, name: "Anime Movies" },
        ],
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "torrents-csv",
      ),
    ).toMatchObject({
      displayName: "TorrentsCSV",
      baseUrl: "https://torrents-csv.com/",
      privacy: "public",
      supportsRss: false,
      supportsSearch: true,
      tags: ["public", "general", "json"],
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: [{ id: 8000, name: "Other" }],
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "knaben"),
    ).toMatchObject({
      displayName: "Knaben",
      baseUrl: "https://knaben.org/",
      privacy: "public",
      supportsRss: false,
      supportsSearch: true,
      tags: ["public", "general", "json"],
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2040, name: "Movies HD" },
          { id: 5040, name: "TV HD" },
          { id: 5070, name: "Anime" },
          { id: 7020, name: "EBooks" },
          { id: 8000, name: "Other" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "torrentday",
      ),
    ).toMatchObject({
      displayName: "TorrentDay",
      baseUrl: "https://tday.love/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "json"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "cookie", type: "cookie", required: true }),
        expect.objectContaining({ name: "freeleechOnly", type: "checkbox", defaultValue: "false" }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2050, name: "Movies/Bluray" },
          { id: 5040, name: "TV/x264" },
          { id: 5070, name: "Anime" },
          { id: 3030, name: "Audio Books" },
          { id: 6050, name: "XXX/Packs" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "iptorrents",
      ),
    ).toMatchObject({
      displayName: "IPTorrents",
      baseUrl: "https://iptorrents.com/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "cookie", type: "cookie", required: true }),
        expect.objectContaining({ name: "userAgent", type: "text", required: true }),
        expect.objectContaining({ name: "freeleechOnly", type: "checkbox", defaultValue: "false" }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2050, name: "Movie/HD/Bluray" },
          { id: 5040, name: "TV/x264" },
          { id: 5070, name: "Anime" },
          { id: 3030, name: "AudioBook" },
          { id: 6050, name: "XXX/Packs" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "retroflix"),
    ).toMatchObject({
      displayName: "RetroFlix",
      baseUrl: "https://retroflix.club/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "movies", "tv", "json"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "apiKey", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2000, name: "Movies" },
          { id: 5000, name: "TV Series" },
          { id: 3020, name: "Music Videos" },
          { id: 7000, name: "Books" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "speedapp"),
    ).toMatchObject({
      displayName: "SpeedApp.io",
      baseUrl: "https://speedapp.io/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "json"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "apiKey", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2000, name: "Movie Packs" },
          { id: 2040, name: "Movies: HD" },
          { id: 2045, name: "Movies: 4K (2160p)" },
          { id: 5000, name: "TV Packs" },
          { id: 4050, name: "Games: PC-ISO" },
          { id: 7020, name: "E-books" },
          { id: 8010, name: "Miscellaneous" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "beyond-hd"),
    ).toMatchObject({
      displayName: "BeyondHD",
      baseUrl: "https://beyond-hd.me/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "movies", "tv", "json"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "apiKey", type: "password", required: true }),
        expect.objectContaining({ name: "rssKey", type: "password", required: true }),
        expect.objectContaining({ name: "freeleechOnly", type: "checkbox", defaultValue: "false" }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2000, name: "Movies" },
          { id: 2045, name: "Movies" },
          { id: 5000, name: "TV" },
          { id: 5040, name: "TV" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "bit-hdtv"),
    ).toMatchObject({
      displayName: "BitHDTV",
      baseUrl: "https://www.bit-hdtv.com/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "movies", "tv", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "cookie", type: "cookie", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 5070, name: "Anime" },
          { id: 2050, name: "Movies/Blu-ray" },
          { id: 2000, name: "Movies" },
          { id: 5000, name: "TV" },
          { id: 6000, name: "XXX" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "scenehd"),
    ).toMatchObject({
      displayName: "SceneHD",
      baseUrl: "https://scenehd.org/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "movies", "tv", "music", "json", "api"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "passkey", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2045, name: "Movie/2160" },
          { id: 2040, name: "Movie/1080" },
          { id: 2040, name: "Movie/720" },
          { id: 5045, name: "TV/2160" },
          { id: 5040, name: "TV/1080" },
          { id: 3020, name: "MVID" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "torrentbytes",
      ),
    ).toMatchObject({
      displayName: "TorrentBytes",
      baseUrl: "https://www.torrentbytes.net/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2040, name: "Movies/HD" },
          { id: 2050, name: "Movies/Full Blu-ray" },
          { id: 5040, name: "TV/HD" },
          { id: 6040, name: "XXX/HD" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "torrentsyndikat",
      ),
    ).toMatchObject({
      displayName: "TorrentSyndikat",
      baseUrl: "https://torrent-syndikat.org/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "music", "books", "json", "api"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "apiKey", type: "password", required: true }),
        expect.objectContaining({
          name: "productsOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2045, name: "Filme / 2160p" },
          { id: 2040, name: "Filme / 1080p" },
          { id: 5045, name: "Serien / 2160p" },
          { id: 5040, name: "Serien / 1080p" },
          { id: 3040, name: "Audio / Musik / FLAC" },
          { id: 7000, name: "Misc / eBooks" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "scenetime"),
    ).toMatchObject({
      displayName: "SceneTime",
      baseUrl: "https://www.scenetime.com/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "cookie", type: "cookie", required: true }),
        expect.objectContaining({
          name: "freeLeechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2040, name: "Movies HD" },
          { id: 5040, name: "TV HD" },
          { id: 5070, name: "TV ANIME" },
          { id: 7000, name: "Books and Magazines" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "hd-space"),
    ).toMatchObject({
      displayName: "HD-Space",
      baseUrl: "https://hd-space.org/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "movies", "tv", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
        expect.objectContaining({
          name: "freeleechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2050, name: "Movie / Blu-ray" },
          { id: 2040, name: "Movie / 1080p" },
          { id: 5040, name: "TV Show / 1080p HDTV" },
          { id: 5080, name: "Documentary / 720p" },
          { id: 6000, name: "XXX / 1080p" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "speedcd"),
    ).toMatchObject({
      displayName: "SpeedCD",
      baseUrl: "https://speed.cd/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "cookie", type: "cookie", required: true }),
        expect.objectContaining({
          name: "freeleechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
        expect.objectContaining({
          name: "excludeArchives",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2040, name: "Movies/HD" },
          { id: 5040, name: "TV/HD" },
          { id: 5070, name: "TV/Anime" },
          { id: 4050, name: "Games/PC ISO" },
          { id: 7000, name: "Books-Mags" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "hd-torrents",
      ),
    ).toMatchObject({
      displayName: "HD-Torrents",
      baseUrl: "https://hdts.ru/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "movies", "tv", "music", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2050, name: "Movie/Blu-Ray" },
          { id: 2045, name: "Movie/UHD/Remux" },
          { id: 5040, name: "TV Show/1080p/i" },
          { id: 3020, name: "Music/2160p" },
          { id: 6000, name: "XXX/2160p" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "funfile"),
    ).toMatchObject({
      displayName: "FunFile",
      baseUrl: "https://www.funfile.org/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 5070, name: "Anime" },
          { id: 3030, name: "Audio Books" },
          { id: 4050, name: "Games" },
          { id: 8010, name: "Miscellaneous" },
          { id: 5000, name: "TV" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "immortalseed",
      ),
    ).toMatchObject({
      displayName: "ImmortalSeed",
      baseUrl: "https://immortalseed.me/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
        expect.objectContaining({
          name: "freeleechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2045, name: "Movies-4k" },
          { id: 2040, name: "Movies-HD" },
          { id: 5040, name: "TV - High Definition" },
          { id: 3040, name: "Music -- FLAC" },
          { id: 7020, name: "Ebooks" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "xspeeds"),
    ).toMatchObject({
      displayName: "XSpeeds",
      baseUrl: "https://www.xspeeds.eu/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
        expect.objectContaining({
          name: "freeleechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2070, name: "DVDR" },
          { id: 2040, name: "Movies HD" },
          { id: 5040, name: "TV HD" },
          { id: 3040, name: "Music FLAC" },
          { id: 3030, name: "Books Audiobooks" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "xthor"),
    ).toMatchObject({
      displayName: "Xthor",
      baseUrl: "https://api.xthor.tk/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "books", "json", "api"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "passkey", type: "password", required: true }),
        expect.objectContaining({
          name: "freeleechOnly",
          type: "checkbox",
          defaultValue: "false",
        }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2045, name: "Films 2160p/x265" },
          { id: 2040, name: "Films 1080p/x264" },
          { id: 5040, name: "Series HD VF" },
          { id: 7020, name: "Livres Romans" },
          { id: 4050, name: "Logiciels Jeux PC" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find(
        (definition) => definition.definitionKey === "revolutiontt",
      ),
    ).toMatchObject({
      displayName: "RevolutionTT",
      baseUrl: "https://revott.me/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 2050, name: "Movies BluRay" },
          { id: 2040, name: "Movies HD" },
          { id: 5040, name: "TV HD" },
          { id: 3040, name: "Music Lossless" },
          { id: 7020, name: "Ebooks" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "pretome"),
    ).toMatchObject({
      displayName: "PreToMe",
      baseUrl: "https://pretome.info/",
      privacy: "private",
      supportsRss: false,
      supportsSearch: true,
      tags: ["private", "general", "movies", "tv", "music", "books", "html"],
      authFields: expect.arrayContaining([
        expect.objectContaining({ name: "username", type: "text", required: true }),
        expect.objectContaining({ name: "password", type: "password", required: true }),
        expect.objectContaining({ name: "pin", type: "password", required: true }),
      ]),
      capabilities: {
        searchTypes: ["search", "movie", "tvsearch"],
        categories: expect.arrayContaining([
          { id: 4010, name: "Applications/Windows" },
          { id: 2040, name: "Movies/720p" },
          { id: 5040, name: "TV/HDTV" },
          { id: 3040, name: "Music/FLAC" },
          { id: 7020, name: "Ebooks" },
        ]),
      },
    })
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "morethantv")
        ?.authFields,
    ).toEqual([
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        helpText: "MoreThanTV Torznab API key.",
      },
    ])
    expect(
      BUILT_IN_CARDIGANN_DEFINITIONS.find((definition) => definition.definitionKey === "hdaccess")
        ?.capabilities,
    ).toEqual({
      searchTypes: ["search", "movie", "tvsearch"],
      categories: [
        { id: 2000, name: "Movies" },
        { id: 2040, name: "Movies HD" },
        { id: 2060, name: "Movies 3D" },
        { id: 5000, name: "TV" },
        { id: 5040, name: "TV HD" },
      ],
    })
  })

  it("parses Cardigann select auth fields with options and defaults", () => {
    const definition = parseCardigannDefinitionYaml(`
id: select-auth-cardigann
name: Select Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: mode
    label: Search mode
    type: select
    required: true
    default: safe
    options:
      - value: safe
        label: Safe search
      - id: raw
        name: Raw search
      - 10
  - name: region
    label: Region
    type: select
    options:
      us: United States
      eu: Europe
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
`)

    expect(definition.authFields[0]).toMatchObject({
      name: "mode",
      label: "Search mode",
      type: "select",
      required: true,
      defaultValue: "safe",
      options: [
        { value: "safe", label: "Safe search" },
        { value: "raw", label: "Raw search" },
        { value: "10", label: "10" },
      ],
    })
    expect(definition.authFields[1]).toMatchObject({
      name: "region",
      label: "Region",
      type: "select",
      required: false,
      options: [
        { value: "us", label: "United States" },
        { value: "eu", label: "Europe" },
      ],
    })
  })

  it("parses Cardigann checkbox auth fields and informational settings", () => {
    const definition = parseCardigannDefinitionYaml(`
id: checkbox-auth-cardigann
name: Checkbox Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: true
    help: Limit searches to freeleech releases.
  - name: cookie
    label: Cookie
    type: cookie
    helptext: Paste the session cookie.
  - name: cookieInfo
    label: Cookie help
    type: info_cookie
    help: Paste the full browser cookie when the tracker requires it.
  - name: loginInfo
    label: Login help
    type: info
    help: Two-factor logins may need a freshly captured cookie.
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
`)

    expect(definition.authFields).toEqual([
      {
        name: "freeleechOnly",
        label: "Freeleech only",
        type: "checkbox",
        required: false,
        helpText: "Limit searches to freeleech releases.",
        defaultValue: "true",
      },
      {
        name: "cookie",
        label: "Cookie",
        type: "cookie",
        required: false,
        helpText: "Paste the session cookie.",
      },
      {
        name: "cookieInfo",
        label: "Cookie help",
        type: "info",
        required: false,
        helpText: "Paste the full browser cookie when the tracker requires it.",
      },
      {
        name: "loginInfo",
        label: "Login help",
        type: "info",
        required: false,
        helpText: "Two-factor logins may need a freshly captured cookie.",
      },
    ])
  })

  it("adds a Cardigann captcha auth field when login captcha is declared", () => {
    const definition = parseCardigannDefinitionYaml(`
id: captcha-auth-cardigann
name: Captcha Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
login:
  method: form
  path: /login
  captcha:
    type: image
    selector: img.captcha
    input: captcha
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
`)

    expect(definition.authFields).toEqual([
      {
        name: "username",
        label: "Username",
        type: "text",
        required: false,
      },
      {
        name: "cardigannCaptcha",
        label: "CAPTCHA",
        type: "text",
        required: false,
        helpText: "Manual response for Cardigann login CAPTCHA prompts.",
      },
    ])
  })

  it("preserves explicit Cardigann captcha auth fields without adding duplicates", () => {
    const definition = parseCardigannDefinitionYaml(`
id: explicit-captcha-auth-cardigann
name: Explicit Captcha Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: cardigannCaptcha
    label: CAPTCHA answer
    type: cardigannCaptcha
    help: Enter the current answer.
login:
  method: form
  path: /login
  captcha:
    type: image
    selector: img.captcha
    input: captcha
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
`)

    expect(definition.authFields).toEqual([
      {
        name: "cardigannCaptcha",
        label: "CAPTCHA answer",
        type: "text",
        required: false,
        helpText: "Enter the current answer.",
      },
    ])
  })

  it("parses Cardigann caps category dictionaries with standard category names", () => {
    const definition = parseCardigannDefinitionYaml(`
id: caps-category-dictionary
name: Caps Category Dictionary
links:
  - https://tracker.example
caps:
  categories:
    1: Movies/BluRay
    tv-hd: TV/HD
    anime: TV/Anime
  modes:
    search: [q]
`)

    expect(definition.categories).toEqual([
      { trackerCategory: "1", trackerCategoryDesc: "Movies/BluRay", newznabCategory: 2050 },
      { trackerCategory: "tv-hd", trackerCategoryDesc: "TV/HD", newznabCategory: 5040 },
      { trackerCategory: "anime", trackerCategoryDesc: "TV/Anime", newznabCategory: 5070 },
    ])
    expect(definition.capabilities.categories).toEqual([
      { id: 2050, name: "Movies/BluRay" },
      { id: 5040, name: "TV/HD" },
      { id: 5070, name: "TV/Anime" },
    ])
  })

  it("parses default Cardigann category mappings", () => {
    const definition = parseCardigannDefinitionYaml(`
id: default-category-cardigann
name: Default Category Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      default: true
    - id: tv
      cat: TV
      desc: TV
`)

    expect(definition.categories).toEqual([
      {
        trackerCategory: "movies",
        trackerCategoryDesc: "Movies",
        newznabCategory: 2000,
        defaultCategory: true,
      },
      { trackerCategory: "tv", trackerCategoryDesc: "TV", newznabCategory: 5000 },
    ])
  })

  it("expands Cardigann category mappings with multiple Newznab categories", () => {
    const definition = parseCardigannDefinitionYaml(`
id: multi-category-cardigann
name: Multi Category Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: media
      cat:
        - Movies
        - TV
      desc: Mixed Media
      default: true
    - id: books
      newznab:
        - 7000
        - 7020
      desc: Books
  modes:
    search: [q]
`)

    expect(definition.categories).toEqual([
      {
        trackerCategory: "media",
        trackerCategoryDesc: "Mixed Media",
        newznabCategory: 2000,
        defaultCategory: true,
      },
      {
        trackerCategory: "media",
        trackerCategoryDesc: "Mixed Media",
        newznabCategory: 5000,
        defaultCategory: true,
      },
      { trackerCategory: "books", trackerCategoryDesc: "Books", newznabCategory: 7000 },
      { trackerCategory: "books", trackerCategoryDesc: "Books", newznabCategory: 7020 },
    ])
    expect(definition.capabilities.categories).toEqual([
      { id: 2000, name: "Mixed Media" },
      { id: 5000, name: "Mixed Media" },
      { id: 7000, name: "Books" },
      { id: 7020, name: "Books" },
    ])
  })

  it("parses first-pass Cardigann search runtime metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: runtime-cardigann
name: Runtime Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
search:
  keywordsfilters:
    - name: trim
    - name: re_replace
      args: ["\\\\s+", "+"]
  preprocessingfilters:
    - name: regexp
      args: '<rss[\\s\\S]*</rss>'
  inputs:
    apikey: "{{ .Config.APIKey }}"
  paths:
    - path: /api
      categories: [movies]
      inheritinputs: false
      response:
        type: torznab
        noresultsmessage: No results found
      inputs:
        t: search
        q: "{{ .Keywords }}"
`)

    expect(runtime.search).toEqual({
      allowEmptyInputs: false,
      keywordFilters: [
        { name: "trim", args: [] },
        { name: "re_replace", args: ["\\s+", "+"] },
      ],
      preprocessingFilters: [{ name: "regexp", args: ["<rss[\\s\\S]*</rss>"] }],
      inputs: { apikey: "{{ .Config.APIKey }}" },
      headers: {},
      rows: null,
      fields: {},
      paths: [
        {
          path: "/api",
          method: "get",
          inheritInputs: false,
          inputs: { t: "search", q: "{{ .Keywords }}" },
          headers: {},
          categories: ["movies"],
          responseType: "torznab",
          noResultsMessage: "No results found",
        },
      ],
    })
  })

  it("normalizes scalar Cardigann search inputs and single path objects", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: scalar-cardigann
name: Scalar Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: 1
      cat: Movies
      desc: Movies
  modes:
    search: [q]
search:
  inputs:
    page: 1
    freeleech: true
  path:
    path: /api
    categories: [1]
    response:
      type: xml
    inputs:
      t: search
      limit: 100
`)

    expect(runtime.search).toEqual({
      allowEmptyInputs: false,
      keywordFilters: [],
      preprocessingFilters: [],
      inputs: { page: "1", freeleech: "true" },
      headers: {},
      rows: null,
      fields: {},
      paths: [
        {
          path: "/api",
          method: "get",
          inheritInputs: true,
          inputs: { t: "search", limit: "100" },
          headers: {},
          categories: ["1"],
          responseType: "xml",
        },
      ],
    })
  })

  it("parses Cardigann HTML row and field selectors", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: html-cardigann
name: HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: tr.torrent
    after: 1
    filters:
      - name: andmatch
        args: 66
    dateheaders:
      selector: tr.date-header
      optional: true
  fields:
    category:
      selector: a.category
      attribute: href
      filters:
        - name: querystring
          args: cat
    title_default:
      selector: a.short-title
      optional: true
      remove: span.badge
    title:
      selector: a.full-title
      optional: true
      default: "{{ .Result.title_default }}"
    download:
      selector: a.download
      attribute: href
    uploadvolumefactor:
      selector: td.flags
      case:
        span.featured: "2"
        '*': "1"
    seeders:
      text: "0"
`)

    expect(runtime.search.rows).toEqual({
      selector: "tr.torrent",
      after: 1,
      filters: [{ name: "andmatch", args: ["66"] }],
      dateHeaders: {
        selector: "tr.date-header",
        optional: true,
        filters: [],
      },
    })
    expect(runtime.search.fields).toMatchObject({
      category: {
        selector: "a.category",
        attribute: "href",
        optional: false,
        filters: [{ name: "querystring", args: ["cat"] }],
      },
      title: {
        selector: "a.full-title",
        defaultValue: "{{ .Result.title_default }}",
        optional: true,
      },
      title_default: {
        selector: "a.short-title",
        remove: "span.badge",
        optional: true,
      },
      uploadvolumefactor: {
        selector: "td.flags",
        case: {
          "span.featured": "2",
          "*": "1",
        },
      },
      seeders: {
        text: "0",
        optional: false,
      },
    })
    expect(runtime.search.paths[0]?.responseType).toBe("html")
  })

  it("parses Cardigann JSON row selector metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: json-rows-cardigann
name: JSON Rows Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
search:
  paths:
    - path: /api
      response:
        type: json
  rows:
    selector: $.data.results
    attribute: torrents
    multiple: true
    missingattributeequalsnoresults: true
    count:
      selector: $.data.total
  fields:
    title:
      selector: title
`)

    expect(runtime.search.rows).toEqual({
      selector: "$.data.results",
      attribute: "torrents",
      multiple: true,
      missingAttributeEqualsNoResults: true,
      count: {
        selector: "$.data.total",
        optional: false,
        filters: [],
      },
      filters: [],
    })
  })

  it("parses Cardigann request header templates", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: header-cardigann
name: Header Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
search:
  headers:
    Cookie:
      - "{{ .Config.APIKey }}"
  paths:
    - path: /api
      headers:
        X-Requested-With:
          - XMLHttpRequest
          - Ignored
`)

    expect(runtime.search.headers).toEqual({ Cookie: "{{ .Config.APIKey }}" })
    expect(runtime.search.paths[0]?.headers).toEqual({ "X-Requested-With": "XMLHttpRequest" })
  })

  it("parses Cardigann login request runtime metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: login-cardigann
name: Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
login:
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
  headers:
    X-Login: "1"
  error:
    - selector: div.login-error
      message:
        selector: div.login-error
  paths:
    - path: /login
      method: post
      inputs:
        remember: true
      headers:
        X-Requested-With: XMLHttpRequest
search:
  paths:
    - path: /api
`)

    expect(runtime.login).toEqual({
      method: "get",
      inputs: {
        username: "{{ .Config.Username }}",
        password: "{{ .Config.Password }}",
      },
      headers: { "X-Login": "1" },
      cookies: [],
      errors: [
        {
          selector: "div.login-error",
          message: {
            selector: "div.login-error",
            optional: false,
            filters: [],
          },
        },
      ],
      paths: [
        {
          path: "/login",
          method: "post",
          inputs: { remember: "true" },
          headers: { "X-Requested-With": "XMLHttpRequest" },
        },
      ],
    })
  })

  it("parses Cardigann cookie-login runtime metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: cookie-login-cardigann
name: Cookie Login Cardigann
links:
  - https://tracker.example
settings:
  - name: cookie
    label: Cookie
    type: cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
login:
  method: cookie
  cookies:
    - "landing={{ .Config.Cookie }}"
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: /api
`)

    expect(runtime.login).toEqual({
      method: "cookie",
      inputs: { cookie: "{{ .Config.Cookie }}" },
      headers: {},
      cookies: ["landing={{ .Config.Cookie }}"],
      errors: [],
      paths: [],
    })
  })

  it("parses Cardigann oneurl login runtime metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: oneurl-login-cardigann
name: OneUrl Login Cardigann
links:
  - https://tracker.example
settings:
  - name: token
    label: Token
caps:
  categorymappings:
    - id: movies
      cat: Movies
login:
  method: oneurl
  paths:
    - path: /login
      method: post
  inputs:
    oneurl: "?token={{ .Config.Token }}"
    ignored: "{{ .Config.Token }}"
search:
  paths:
    - path: /api
`)

    expect(runtime.login).toEqual({
      method: "oneurl",
      inputs: {
        oneurl: "?token={{ .Config.Token }}",
        ignored: "{{ .Config.Token }}",
      },
      headers: {},
      cookies: [],
      errors: [],
      paths: [
        {
          path: "/login",
          method: "get",
          inputs: {},
          headers: {},
        },
      ],
    })
  })

  it("parses Cardigann form login runtime metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: form-login-cardigann
name: Form Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
login:
  method: form
  path: /login
  form: form#signin
  submitpath: /session
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
`)

    expect(runtime.login).toEqual({
      method: "form",
      inputs: {
        username: "{{ .Config.Username }}",
        password: "{{ .Config.Password }}",
      },
      headers: {},
      cookies: [],
      errors: [],
      paths: [
        {
          path: "/login",
          method: "get",
          inputs: {},
          headers: {},
        },
      ],
      form: "form#signin",
      submitPath: "/session",
    })
  })

  it("parses Cardigann form selector login runtime metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: form-selector-login-cardigann
name: Form Selector Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
caps:
  categorymappings:
    - id: movies
      cat: Movies
login:
  method: form
  path: /login
  selectors: true
  inputs:
    "#username-field": "{{ .Config.Username }}"
    "#password-field": "{{ .Config.Password }}"
  selectorinputs:
    csrf:
      selector: span.csrf
  getselectorinputs:
    ticket:
      selector: input#ticket-field
      attribute: value
search:
  paths:
    - path: /api
`)

    expect(runtime.login).toMatchObject({
      method: "form",
      selectors: true,
      inputs: {
        "#username-field": "{{ .Config.Username }}",
        "#password-field": "{{ .Config.Password }}",
      },
      selectorInputs: {
        csrf: {
          selector: "span.csrf",
          optional: false,
          filters: [],
        },
      },
      getSelectorInputs: {
        ticket: {
          selector: "input#ticket-field",
          attribute: "value",
          optional: false,
          filters: [],
        },
      },
    })
  })

  it("parses Cardigann login test selectors", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: login-test-cardigann
name: Login Test Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
  test:
    path: /account
    selector: a.logout
search:
  paths:
    - path: /browse
`)

    expect(runtime.login).toMatchObject({
      method: "cookie",
      test: {
        path: "/account",
        selector: "a.logout",
      },
    })
  })

  it("parses Cardigann login captcha metadata", () => {
    const runtime = parseCardigannRuntimeDefinitionYaml(`
id: login-captcha-cardigann
name: Login Captcha Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
login:
  method: form
  path: /login
  captcha:
    type: image
    selector: img.captcha
    input: "#captcha-field"
search:
  paths:
    - path: /browse
`)

    expect(runtime.login).toMatchObject({
      method: "form",
      captcha: {
        type: "image",
        selector: "img.captcha",
        input: "#captcha-field",
      },
    })
  })

  it("exposes built-in runtime definitions by key", () => {
    const runtime = getBuiltInCardigannRuntimeDefinition("public-domain-movie-torrents")
    expect(runtime?.search.paths[0]).toMatchObject({
      path: "/api",
      responseType: "torznab",
    })
  })

  it("rejects unsupported protocols", () => {
    expect(() =>
      parseCardigannDefinitionYaml(`
id: bad-protocol
name: Bad Protocol
protocol: ed2k
caps:
  categorymappings:
    - id: movies
      cat: Movies
`),
    ).toThrow("unsupported indexer protocol")
  })

  it("rejects categories without a known newznab mapping", () => {
    expect(() =>
      parseCardigannDefinitionYaml(`
id: bad-category
name: Bad Category
caps:
  categorymappings:
    - id: mystery
      cat: Mystery
`),
    ).toThrow("category must include a known cat or newznab category")
  })
})
