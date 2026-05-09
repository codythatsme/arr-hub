import { Cause, Effect, Exit, Option } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IndexerError } from "../errors"
import { createCardigannYamlAdapter } from "./CardigannAdapter"

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Example Movie 2026 1080p WEB-DL</title>
      <link>https://tracker.example/download/1</link>
      <pubDate>Fri, 01 May 2026 00:00:00 GMT</pubDate>
      <torznab:attr name="size" value="123456" />
      <torznab:attr name="seeders" value="44" />
      <torznab:attr name="category" value="2000" />
    </item>
  </channel>
</rss>`

const JSON_RESULTS = JSON.stringify({
  data: {
    results: [
      {
        title: "JSON Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/json",
          details: "/details/json",
        },
        category: {
          name: "Movies",
        },
        stats: {
          size: "1250 MB",
          seeders: 88,
          leechers: 4,
        },
        published: "2026-05-08T00:00:00.000Z",
        infohash: "0123456789abcdef0123456789abcdef01234567",
      },
    ],
  },
})

const TORRENTS_CSV_JSON_RESULTS = JSON.stringify({
  torrents: [
    {
      infohash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      name: "Ubuntu 24.04 ISO",
      size_bytes: 3_200_000_000,
      created_unix: 1_714_608_000,
      seeders: 12,
      leechers: 4,
      completed: 99,
    },
  ],
})

const SUBSPLEASE_JSON_RESULTS = JSON.stringify({
  "spy-x-family": {
    time: "12:34",
    release_date: "2026-05-08T12:34:56+00:00",
    show: "Spy x Family",
    episode: "01",
    downloads: [
      {
        res: "1080",
        magnet:
          "magnet:?xt=urn:btih:feedfacefeedfacefeedfacefeedfacefeedface&dn=Spy%20x%20Family&xl=1395864371",
      },
    ],
    image_url: "/img/spy-x-family.png",
    page: "spy-x-family",
  },
})

const JSON_SELECTOR_FILTER_RESULTS = JSON.stringify({
  data: {
    results: [
      {
        title: "Keep Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/keep",
          details: "/details/keep",
        },
        category: "Movies",
        stats: {
          size: "2 GB",
          seeders: 51,
        },
        tags: ["freeleech", "featured"],
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Missing Download Movie 2026 1080p WEB-DL",
        links: {
          details: "/details/missing",
        },
        category: "Movies",
        stats: {
          size: "3 GB",
          seeders: 40,
        },
        tags: ["freeleech"],
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Dead Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/dead",
        },
        category: "Movies",
        stats: {
          size: "4 GB",
          seeders: 30,
        },
        status: {
          dead: true,
        },
        tags: ["freeleech"],
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Wrong Tag Movie 2026 1080p WEB-DL",
        links: {
          download: "/download/wrong-tag",
        },
        category: "Movies",
        stats: {
          size: "5 GB",
          seeders: 20,
        },
        tags: ["internal"],
        published: "2026-05-09T00:00:00.000Z",
      },
    ],
  },
})

const JSON_SELECTOR_POSITION_RESULTS = JSON.stringify({
  data: {
    results: [
      {
        title: "Wrong First Position Movie 2026 1080p WEB-DL",
        links: {
          download: ["/download/wrong-first"],
        },
        category: ["Movies"],
        stats: {
          size: "1 GB",
          seeders: 10,
        },
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Position Movie 2026 1080p WEB-DL",
        links: {
          download: ["/download/position-mirror", "/download/position-final"],
        },
        category: ["Other", "Movies"],
        stats: {
          size: "2 GB",
          seeders: 44,
        },
        published: "2026-05-09T00:00:00.000Z",
      },
      {
        title: "Wrong Last Position Movie 2026 1080p WEB-DL",
        links: {
          download: ["/download/wrong-last"],
        },
        category: ["Movies"],
        stats: {
          size: "3 GB",
          seeders: 30,
        },
        published: "2026-05-09T00:00:00.000Z",
      },
    ],
  },
})

const JSON_SELECTOR_LIST_RESULTS = JSON.stringify({
  data: {
    fallback: [
      {
        titles: {
          fallback: "JSON List Movie 2026 1080p WEB-DL",
        },
        links: {
          altDownload: "/download/json-list",
          altDetails: "/details/json-list",
        },
        category: {
          alt: "Movies",
        },
        stats: {
          size: "2.5 GB",
          seeders: 61,
        },
        published: "2026-05-10T00:00:00.000Z",
      },
    ],
  },
})

const HTML_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="category" href="/browse?cat=movies">Movies</a></td>
          <td><a class="short-title">Fallback Movie 2026 1080p WEB-DL</a></td>
          <td>
            <a class="details" href="/details/1">Details</a>
            <a class="download" href="/download/1">Download</a>
          </td>
          <td class="size">1.5 GiB</td>
          <td class="seeders">1,234</td>
          <td class="leechers">56</td>
          <td><time datetime="2026-05-01T00:00:00.000Z">May 1 2026</time></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_MAGNET_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Magnet Movie 2026 1080p WEB-DL</a></td>
          <td><a class="magnet" href="magnet:?xt=urn:btih:0123456789abcdef&dn=Magnet+Movie">Magnet</a></td>
          <td class="category">Movies</td>
          <td class="seeders">23</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const ANIDEX_HTML_RESULTS = `<!doctype html>
<html>
  <body>
    <div id="content">
      <table>
        <tbody>
          <tr>
            <td><a href="/?page=search&id=1"><img title="English" /></a></td>
            <td>Group</td>
            <td>
              <a href="/?page=torrent&id=12345">
                <span title="[ExampleSubs] Spy Family - 01 (1080p)">Spy Family</span>
              </a>
            </td>
            <td>Comments</td>
            <td>
              <a href="/dl/12345">Torrent</a>
              <a href="magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567">Magnet</a>
            </td>
            <td>Uploader</td>
            <td>1.4 GiB</td>
            <td title="2026-05-06 11:22:33 UTC">2026-05-06</td>
            <td>42</td>
            <td>3</td>
            <td>101</td>
          </tr>
        </tbody>
      </table>
    </div>
  </body>
</html>`

const HTML_FIELD_MODIFIER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td class="title-main">Modifier.Movie</td>
          <td class="title-extra">.2026.1080p.WEB-DL</td>
          <td><a class="download" href="/download/modifier">Download</a></td>
          <td class="category">Movies</td>
          <td class="seeders">17</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_RELATIVE_TIME_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Relative Time Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/relative">Download</a></td>
          <td class="size">700 MB</td>
          <td class="date">2 days ago</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_DATEPARSE_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Date Parse Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/dateparse">Download</a></td>
          <td class="size">800 MB</td>
          <td class="date">2026-May-02 13:45:30 +00:00</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_DATE_HEADER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="day">
          <td class="date-header">2026-05-04</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Header Date Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/header-date">Download</a></td>
          <td class="size">850 MB</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Second Header Date Movie 2026 720p WEB-DL</a></td>
          <td><a class="download" href="/download/second-header-date">Download</a></td>
          <td class="size">650 MB</td>
        </tr>
        <tr class="day">
          <td class="date-header">2026-05-05</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Next Header Date Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/next-header-date">Download</a></td>
          <td class="size">950 MB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_FIELD_FILTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Crème Movie: 2026/1080p* WEB-DL</a></td>
          <td><a class="download" href="/download/filtered">Download</a></td>
          <td class="category">Movies HD English</td>
          <td class="date">May 6th 2026 00:00 UTC</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_JSON_JOIN_FIELD_FILTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td class="title-json">{"parts":["JSON","Join","Movie","2026","1080p","WEB-DL"]}</td>
          <td><a class="download" href="/download/json-joined">Download</a></td>
          <td class="category-json">{"categories":["Movies"]}</td>
          <td class="date">2026-05-07T00:00:00.000Z</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_ROW_FILTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Wanted Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/wanted">Download</a></td>
          <td class="size">900 MB</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Unrelated Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/unrelated">Download</a></td>
          <td class="size">950 MB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_SELECTOR_PSEUDO_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Wanted Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/wanted-pseudo">Download</a></td>
          <td class="tag">Freeleech</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Missing Download Movie 2026 1080p WEB-DL</a></td>
          <td class="tag">Freeleech</td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Dead Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/dead-pseudo">Download</a></td>
          <td class="tag">Freeleech</td>
          <td><span class="dead">Dead</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_ATTRIBUTE_OPERATOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent" data-flags="vip freeleech" data-language="en-US" data-status="dead">
          <td><a class="title">Wrong Attribute Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/wrong-attribute">Download</a></td>
          <td><span class="category" data-value="movies">Movies</span></td>
        </tr>
        <tr class="torrent" data-flags="vip freeleech" data-language="EN-gb" data-status="alive">
          <td><a class="title">Attribute Movie 2026 1080p WEB-DL</a></td>
          <td>
            <a
              class="download"
              rel="nofollow external"
              data-protocol="Torrent-Main"
              href="/download/attribute-final"
            >Download</a>
          </td>
          <td><span class="category" data-value="Movies">Movies</span></td>
        </tr>
        <tr class="torrent" data-flags="vip freeleech" data-language="fr" data-status="alive">
          <td><a class="title">Wrong Language Attribute Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/wrong-language-attribute">Download</a></td>
          <td><span class="category" data-value="Movies">Movies</span></td>
        </tr>
        <tr class="torrent" data-flags="internal" data-language="en-AU" data-status="alive">
          <td><a class="title">Wrong Internal Attribute Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/wrong-internal-attribute">Download</a></td>
          <td><span class="category" data-value="movies">Movies</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_ESCAPED_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr id="row:wrong" class="torrent release item" data-token="release-main">
          <td><a class="title link:details" href="/details/wrong-escaped">Wrong Escaped Selector Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download link.download" data-token="release-main" href="/download/wrong-escaped">Download</a></td>
          <td><span class="category" data-value="Movies:HD">Movies</span></td>
        </tr>
        <tr id="row:movie" class="torrent release.item" data-token="release#main">
          <td><a class="title link:details" href="/details/escaped-selector">Escaped Selector Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download link.download" data-token="release#main" href="/download/escaped-selector">Download</a></td>
          <td><span class="category" data-value="Movies:HD">Movies</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_ESCAPED_ATTRIBUTE_NAME_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent" data:token="release-wrong">
          <td><a class="title" data:slug="details-wrong" href="/details/wrong-escaped-attribute">Wrong Escaped Attribute Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" data:token="download-wrong" href="/download/wrong-escaped-attribute">Download</a></td>
          <td><span class="category" data:category="Movies">Movies</span></td>
        </tr>
        <tr class="torrent" data:token="release:main">
          <td><a class="title" data:slug="details:main" href="/details/escaped-attribute">Escaped Attribute Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" data:token="download:main" href="/download/escaped-attribute">Download</a></td>
          <td><span class="category" data:category="Movies:HD">Movies</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_ESCAPED_DELIMITER_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent release" data-token="release-main">
          <td><a class="title title-main" href="/details/wrong-escaped-delimiter">Wrong Escaped Delimiter Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download download-main" data-token="download-main" href="/download/wrong-escaped-delimiter">Download</a></td>
          <td><span class="category" data-value="Movies">Movies</span></td>
        </tr>
        <tr class="torrent release,item" data-token="release,main">
          <td><a class="title title~main" href="/details/escaped-delimiter">Escaped Delimiter Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download download+main" data-token="download,main" href="/download/escaped-delimiter">Download</a></td>
          <td><span class="category" data-value="Movies,HD">Movies</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_QUOTED_ATTRIBUTE_DELIMITER_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent release-item" data-token="release-main">
          <td><a class="title title-main" data-slug="details-main" href="/details/wrong-quoted-attribute">Wrong Quoted Attribute Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download download-main" data-token="download-main" href="/download/wrong-quoted-attribute">Download</a></td>
          <td><span class="category" data-value="Movies">Movies</span></td>
        </tr>
        <tr class="torrent release>item" data-token="release>main">
          <td><a class="title title>main" data-slug="details>main" href="/details/quoted-attribute">Quoted Attribute Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download download>main" data-token="download>main" href="/download/quoted-attribute">Download</a></td>
          <td><span class="category" data-value="Movies>HD">Movies</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_MATCHING_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent secondary" data-status="alive">
          <td><a class="title fallback-title" href="/details/wrong-grouping">Wrong Grouping Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download magnet-link" href="/download/wrong-grouping">Download</a></td>
          <td><span class="category hd">Movies</span></td>
        </tr>
        <tr class="torrent primary" data-status="dead">
          <td><a class="title primary-title" href="/details/dead-grouping">Dead Grouping Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download magnet-link" href="/download/dead-grouping">Download</a></td>
          <td><span class="category hd">Movies</span></td>
        </tr>
        <tr class="torrent primary" data-status="alive">
          <td><a class="title primary-title" href="/details/grouping-pseudo">Grouping Pseudo Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download magnet-link" href="/download/grouping-pseudo">Download</a></td>
          <td><span class="category hd">Movies</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_CONTENT_STATE_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td class="title"><a class="title" href="/details/wrong-content-state">Wrong Content State Movie 2026 1080p WEB-DL</a></td>
          <td class="marker">occupied</td>
          <td class="notes"><span>VIP</span></td>
          <td><a class="download" href="/download/wrong-content-state">Download</a></td>
          <td><span class="category">Movies</span></td>
        </tr>
        <tr class="torrent">
          <td class="title"><a class="title" href="/details/content-state">Content State Movie 2026 1080p WEB-DL</a></td>
          <td class="marker"></td>
          <td class="notes"><span>VIP</span></td>
          <td><a class="download" href="/download/content-state">Download</a></td>
          <td><span class="category">Movies</span></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_SELECTOR_POSITION_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="torrent">
          <td><a class="title">Wrong Position Movie 2026 1080p WEB-DL</a></td>
          <td><a class="download" href="/download/wrong-position">Download</a></td>
          <td><span class="category">Movies</span></td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Position Movie 2026 1080p WEB-DL</a></td>
          <td>
            <a class="download" href="/download/position-mirror">Mirror</a>
            <a class="download" href="/download/position-final">Download</a>
          </td>
          <td>
            <span class="category">Movies</span>
            <span class="category">Other</span>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_SELECTOR_LIST_RESULTS = `<!doctype html>
<html>
  <body>
    <table>
      <tbody>
        <tr class="release">
          <td><span class="title">Comma First Movie 2026 1080p WEB-DL</span></td>
          <td><a class="download" href="/download/comma-first">Download</a></td>
        </tr>
        <tr class="torrent">
          <td><a class="title">Comma Second Movie 2026 720p WEB-DL</a></td>
          <td><a class="magnet" href="magnet:?xt=urn:btih:abcdefabcdefabcd&dn=Comma+Second">Magnet</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_DIRECT_CHILD_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tr class="torrent">
        <td class="name">
          <span><a class="title">Wrong Nested Field Movie 2026 1080p WEB-DL</a></span>
          <a class="title" href="/details/direct-child">Direct Child Movie 2026 1080p WEB-DL</a>
        </td>
        <td class="actions">
          <span><a class="download" href="/download/wrong-nested-field">Nested Download</a></span>
          <a class="download" href="/download/direct-child">Download</a>
        </td>
      </tr>
      <tbody>
        <tr class="torrent">
          <td class="name"><a class="title">Wrong Nested Row Movie 2026 1080p WEB-DL</a></td>
          <td class="actions"><a class="download" href="/download/wrong-nested-row">Download</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_VOID_STATE_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="name">
            <img class="category-icon" alt="Movies" src="/icons/movies.png">
            <a class="title" href="/details/void-state">Void State Movie 2026 1080p WEB-DL</a>
          </td>
          <td class="actions">
            <input class="download-control" type="radio" value="/download/unchecked">
            <input class="download-control" type="radio" checked value="/download/void-state">
          </td>
        </tr>
        <tr class="torrent">
          <td class="name">
            <img class="category-icon" alt="Movies" src="/icons/movies.png">
            <a class="title" href="/details/unchecked">Wrong Unchecked Movie 2026 1080p WEB-DL</a>
          </td>
          <td class="actions">
            <input class="download-control" type="radio" value="/download/unchecked-row">
          </td>
        </tr>
        <tr class="torrent">
          <td class="name">
            <img class="category-icon" alt="Movies" src="/icons/movies.png">
            <a class="title" href="/details/disabled">Wrong Disabled Movie 2026 1080p WEB-DL</a>
          </td>
          <td class="actions">
            <input class="download-control" type="radio" checked value="/download/disabled-row">
            <input class="dead" type="checkbox" disabled>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_FORM_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <section class="results">
      <article class="release">
        <input class="title-source" type="text" value="Form Pseudo Movie 2026 1080p WEB-DL">
        <button class="details-button" type="button" data-href="/details/form-pseudo">Details</button>
        <input class="download-target" type="radio" checked value="/download/form-pseudo">
        <select class="category">
          <option>TV</option>
          <option selected>Movies</option>
        </select>
        <textarea class="size-source">2.4 GB</textarea>
      </article>
      <article class="release">
        <input class="title-source" type="password" value="Wrong Password Type Movie 2026 1080p WEB-DL">
        <button class="details-button" type="button" data-href="/details/wrong-password">Details</button>
        <input class="download-target" type="radio" checked value="/download/wrong-password">
        <select class="category"><option selected>Movies</option></select>
        <textarea class="size-source">500 MB</textarea>
      </article>
      <article class="release">
        <input class="title-source" type="text" value="Wrong Checkbox Type Movie 2026 1080p WEB-DL">
        <button class="details-button" type="button" data-href="/details/wrong-checkbox">Details</button>
        <input class="download-target" type="checkbox" checked value="/download/wrong-checkbox">
        <select class="category"><option selected>Movies</option></select>
        <textarea class="size-source">600 MB</textarea>
      </article>
    </section>
  </body>
</html>`

const HTML_VISIBILITY_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <section class="results">
      <article class="release">
        <a class="title" href="/details/visibility">Visibility Pseudo Movie 2026 1080p WEB-DL</a>
        <input class="download" type="hidden" value="/download/visibility">
        <span class="size">2.5 GB</span>
      </article>
      <article class="release">
        <a class="title" href="/details/wrong-hidden-title" style="display: none">Wrong Hidden Title Movie 2026 1080p WEB-DL</a>
        <input class="download" type="hidden" value="/download/wrong-hidden-title">
        <span class="size">500 MB</span>
      </article>
      <article class="release" hidden>
        <a class="title" href="/details/wrong-hidden-row">Wrong Hidden Row Movie 2026 1080p WEB-DL</a>
        <input class="download" type="hidden" value="/download/wrong-hidden-row">
        <span class="size">600 MB</span>
      </article>
      <article class="release">
        <a class="title" href="/details/wrong-visible-input">Wrong Visible Input Movie 2026 1080p WEB-DL</a>
        <input class="download" type="text" value="/download/wrong-visible-input">
        <span class="size">700 MB</span>
      </article>
    </section>
  </body>
</html>`

const HTML_HEADER_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <section class="results">
      <article class="release">
        <h2 class="release-title"><a href="/details/header-pseudo">Header Pseudo Movie 2026 1080p WEB-DL</a></h2>
        <a class="download" href="/download/header-pseudo">Download</a>
        <span class="size">2.6 GB</span>
      </article>
      <article class="release">
        <p class="release-title"><a href="/details/wrong-paragraph">Wrong Paragraph Title Movie 2026 1080p WEB-DL</a></p>
        <a class="download" href="/download/wrong-paragraph">Download</a>
        <span class="size">500 MB</span>
      </article>
      <article class="release">
        <header class="release-title"><a href="/details/wrong-semantic-header">Wrong Semantic Header Movie 2026 1080p WEB-DL</a></header>
        <a class="download" href="/download/wrong-semantic-header">Download</a>
        <span class="size">600 MB</span>
      </article>
    </section>
  </body>
</html>`

const HTML_ROOT_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <article class="release">
      <a class="title" href="/details/root-pseudo">Root Pseudo Movie 2026 1080p WEB-DL</a>
      <a class="download" href="/download/root-pseudo">Download</a>
      <span class="size">2.7 GB</span>
    </article>
    <section class="results">
      <article class="release">
        <a class="title" href="/details/wrong-nested-root">Wrong Nested Root Movie 2026 1080p WEB-DL</a>
        <a class="download" href="/download/wrong-nested-root">Download</a>
        <span class="size">500 MB</span>
      </article>
    </section>
  </body>
</html>`

const HTML_LANG_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html lang="fr">
  <body>
    <section class="results" lang="en-US">
      <article class="release">
        <a class="title" href="/details/lang-inherited">Language Inherited Movie 2026 1080p WEB-DL</a>
        <a class="download" href="/download/lang-inherited">Download</a>
        <span class="size">2.8 GB</span>
      </article>
    </section>
    <section class="results">
      <article class="release" xml:lang="en-GB">
        <a class="title" href="/details/lang-direct">Language Direct Movie 2026 1080p WEB-DL</a>
        <a class="download" href="/download/lang-direct">Download</a>
        <span class="size">1.4 GB</span>
      </article>
    </section>
    <section class="results" lang="fr">
      <article class="release">
        <a class="title" href="/details/wrong-lang">Wrong Language Movie 2026 1080p WEB-DL</a>
        <a class="download" href="/download/wrong-lang">Download</a>
        <span class="size">500 MB</span>
      </article>
    </section>
  </body>
</html>`

const HTML_CHILD_PSEUDO_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/wrong-first">Wrong First Child Movie 2026 1080p WEB-DL</a></td>
          <td class="actions"><a class="download" href="/download/wrong-first">Download</a></td>
        </tr>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/wrong-middle">Wrong Middle Child Movie 2026 1080p WEB-DL</a></td>
          <td class="actions"><a class="download" href="/download/wrong-middle">Download</a></td>
        </tr>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/child-pseudo">Child Pseudo Movie 2026 1080p WEB-DL</a></td>
          <td class="stats"><span class="size">1.2 GB</span></td>
          <td class="actions"><a class="download" href="/download/child-pseudo">Download</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_NTH_CHILD_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/wrong-nth-first">Wrong First Nth Movie 2026 1080p WEB-DL</a></td>
          <td class="size">700 MB</td>
          <td class="actions"><a class="download" href="/download/wrong-nth-first">Download</a></td>
        </tr>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/wrong-nth-second">Wrong Second Nth Movie 2026 1080p WEB-DL</a></td>
          <td class="size">900 MB</td>
          <td class="actions"><a class="download" href="/download/wrong-nth-second">Download</a></td>
        </tr>
        <tr class="torrent">
          <td class="actions">
            <a class="title" href="/details/wrong-nth-field">Wrong Field Nth Movie 2026 1080p WEB-DL</a>
            <a class="download" href="/download/nth-child">Download</a>
          </td>
          <td class="size">1.7 GB</td>
          <td class="name"><a class="title" href="/details/nth-child">Nth Child Movie 2026 1080p WEB-DL</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_NTH_LAST_CHILD_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/wrong-nth-last-first">Wrong First Nth Last Movie 2026 1080p WEB-DL</a></td>
          <td class="size">650 MB</td>
          <td class="actions"><a class="download" href="/download/wrong-nth-last-first">Download</a></td>
        </tr>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/nth-last-child">Nth Last Child Movie 2026 1080p WEB-DL</a></td>
          <td class="size">1.8 GB</td>
          <td class="actions"><a class="download" href="/download/nth-last-child">Download</a></td>
        </tr>
        <tr class="torrent">
          <td class="name"><a class="title" href="/details/wrong-nth-last-final">Wrong Final Nth Last Movie 2026 1080p WEB-DL</a></td>
          <td class="size">850 MB</td>
          <td class="actions"><a class="download" href="/download/wrong-nth-last-final">Download</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_OF_TYPE_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <div class="cards">
      <article class="release">
        <span class="label">Noise</span>
        <a href="/details/wrong-of-type-first">Wrong First Of Type Movie 2026 1080p WEB-DL</a>
        <span class="size">600 MB</span>
        <a href="/download/wrong-of-type-first">Download</a>
      </article>
      <section class="ad">
        <article class="release">
          <a href="/details/wrong-nested-of-type">Wrong Nested Of Type Movie 2026 1080p WEB-DL</a>
        </article>
      </section>
      <article class="release">
        <span class="label">Noise</span>
        <a href="/details/of-type">Of Type Movie 2026 1080p WEB-DL</a>
        <span class="size">1.9 GB</span>
        <a href="/download/of-type">Download</a>
      </article>
      <article class="release">
        <span class="label">Noise</span>
        <a href="/details/wrong-of-type-final">Wrong Final Of Type Movie 2026 1080p WEB-DL</a>
        <span class="size">800 MB</span>
        <a href="/download/wrong-of-type-final">Download</a>
      </article>
    </div>
  </body>
</html>`

const HTML_ONLY_CHILD_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <div class="cards">
      <section class="child-check">
        <article class="release">
          <a class="title" href="/details/only-child">Only Child Movie 2026 1080p WEB-DL</a>
          <span class="size">2.0 GB</span>
          <a class="download" href="/download/only-child">Download</a>
        </article>
      </section>
      <section class="child-check">
        <article class="release">
          <a class="title" href="/details/wrong-child-aside">Wrong Child Aside Movie 2026 1080p WEB-DL</a>
          <span class="size">500 MB</span>
          <a class="download" href="/download/wrong-child-aside">Download</a>
        </article>
        <aside>Advertisement</aside>
      </section>
      <section class="child-check">
        <article class="release">
          <a class="title" href="/details/wrong-child-first">Wrong Child First Movie 2026 1080p WEB-DL</a>
          <span class="size">600 MB</span>
          <a class="download" href="/download/wrong-child-first">Download</a>
        </article>
        <article class="release">
          <a class="title" href="/details/wrong-child-second">Wrong Child Second Movie 2026 1080p WEB-DL</a>
          <span class="size">700 MB</span>
          <a class="download" href="/download/wrong-child-second">Download</a>
        </article>
      </section>
      <section class="type-check">
        <article class="release">
          <a class="title" href="/details/only-of-type">Only Of Type Movie 2026 1080p WEB-DL</a>
          <span class="size">2.1 GB</span>
          <a class="download" href="/download/only-of-type">Download</a>
        </article>
        <aside>Advertisement</aside>
      </section>
      <section class="type-check">
        <article class="release">
          <a class="title" href="/details/wrong-type-first">Wrong Type First Movie 2026 1080p WEB-DL</a>
          <span class="size">800 MB</span>
          <a class="download" href="/download/wrong-type-first">Download</a>
        </article>
        <article class="release">
          <a class="title" href="/details/wrong-type-second">Wrong Type Second Movie 2026 1080p WEB-DL</a>
          <span class="size">900 MB</span>
          <a class="download" href="/download/wrong-type-second">Download</a>
        </article>
      </section>
    </div>
  </body>
</html>`

const HTML_SIBLING_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="group"><td>Adjacent Group</td></tr>
        <tr class="torrent adjacent">
          <td class="name"><a class="title" href="/details/adjacent-sibling">Adjacent Sibling Movie 2026 1080p WEB-DL</a></td>
          <td class="actions"><a class="download" href="/download/adjacent-sibling">Download</a></td>
          <td class="size">2.2 GB</td>
        </tr>
        <tr class="group"><td>Skipped Group</td></tr>
        <tr class="ad"><td>Advertisement</td></tr>
        <tr class="torrent wrong-adjacent">
          <td class="name"><a class="title" href="/details/wrong-adjacent">Wrong Adjacent Movie 2026 1080p WEB-DL</a></td>
          <td class="actions"><a class="download" href="/download/wrong-adjacent">Download</a></td>
          <td class="size">600 MB</td>
        </tr>
        <tr class="marker"><td>General Marker</td></tr>
        <tr class="ad"><td>Advertisement</td></tr>
        <tr class="torrent general">
          <td class="name"><a class="title" href="/details/general-sibling">General Sibling Movie 2026 1080p WEB-DL</a></td>
          <td class="actions"><a class="download" href="/download/general-sibling">Download</a></td>
          <td class="size">2.3 GB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_NESTED_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="noise"><a href="/wrong">Wrong Link</a></td>
          <td class="name"><a href="/details/2">Nested Movie 2026 2160p WEB-DL</a></td>
          <td class="stats"><span class="size">2 GB</span></td>
          <td class="actions"><a class="download" href="/download/2">Download</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_AFTER_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr>
          <td class="name"><a href="/details/3">Split Row Movie 2026 1080p BluRay</a></td>
          <td class="actions"><a class="download" href="/download/3">Download</a></td>
        </tr>
        <tr>
          <td colspan="2">
            <span class="size">3.5 GiB</span>
            <time datetime="2026-05-03T00:00:00.000Z">May 3 2026</time>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_BEFORE_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr>
          <td colspan="2">
            <span class="size">4.5 GiB</span>
            <time datetime="2026-05-04T00:00:00.000Z">May 4 2026</time>
          </td>
        </tr>
        <tr>
          <td class="name"><a href="/details/before">Before Row Movie 2026 1080p BluRay</a></td>
          <td class="actions"><a class="download" href="/download/before">Download</a></td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_REMOVE_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent">
          <td class="name">
            <a href="/details/4">
              <span class="badge">Freeleech</span>
              Clean Movie 2026 1080p WEB-DL
            </a>
          </td>
          <td class="actions"><a class="download" href="/download/4">Download</a></td>
          <td class="size">4 GB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

const HTML_SELF_SELECTOR_RESULTS = `<!doctype html>
<html>
  <body>
    <table class="results">
      <tbody>
        <tr class="torrent" data-title="Self Match Movie 2026 1080p WEB-DL" data-details="/details/5" data-category="movies">
          <td class="actions"><a class="download" href="/download/5">Download</a></td>
          <td class="size">5 GB</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`

describe("CardigannAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("builds Cardigann-style XML search requests from the selected definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 7,
      name: "Cardigann Movies",
      type: "cardigann_yaml",
      definitionKey: "public-domain-movie-torrents",
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Example Movie", type: "movie", categories: [2000], limit: 50 }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://tracker.example")
    expect(url.pathname).toBe("/api")
    expect(url.searchParams.get("apikey")).toBe("api-key")
    expect(url.searchParams.get("t")).toBe("movie")
    expect(url.searchParams.get("q")).toBe("Example Movie")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(url.searchParams.get("limit")).toBe("50")
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      indexerId: 7,
      indexerName: "Cardigann Movies",
      indexerPriority: 15,
      size: 123456,
      seeders: 44,
      category: "2000",
      protocol: "torrent",
    })
  })

  it("parses first-pass Cardigann JSON selector results", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 57,
      name: "JSON Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-cardigann",
      definitionYaml: `
id: json-cardigann
name: JSON Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
      inputs:
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
    details:
      selector: links.details
    download:
      selector: links.download
    category:
      selector: category.name
      case:
        Movies: movies
    size:
      selector: stats.size
    seeders:
      selector: stats.seeders
    leechers:
      selector: stats.leechers
    infohash:
      selector: infohash
    date:
      selector: published
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/api/search")
    expect(url.searchParams.get("q")).toBe("JSON Movie")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/json",
      infoUrl: "https://tracker.example/details/json",
      category: "2000",
      size: 1_250_000_000,
      seeders: 88,
      leechers: 4,
      infohash: "0123456789abcdef0123456789abcdef01234567",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-08T00:00:00.000Z")
  })

  it("filters Cardigann JSON selectors with has, not, and contains pseudo filters", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON_SELECTOR_FILTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 66,
      name: "JSON Selector Filter Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-selector-filter-cardigann",
      definitionYaml: `
id: json-selector-filter-cardigann
name: JSON Selector Filter Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results:has(links.download):has(tags:contains(freeleech)):not(status.dead)
  fields:
    title:
      selector: title:contains(Keep Movie)
    details:
      selector: links.details
    download:
      selector: links.download:contains(/download/)
    category:
      selector: category:contains(Movies)
      case:
        Movies: movies
    size:
      selector: stats.size
    seeders:
      selector: stats.seeders
    date:
      selector: published
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Keep Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Keep Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/keep",
      infoUrl: "https://tracker.example/details/keep",
      category: "2000",
      size: 2_000_000_000,
      seeders: 51,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })

  it("applies Cardigann JSON positional selector filters", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON_SELECTOR_POSITION_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 67,
      name: "JSON Selector Position Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-selector-position-cardigann",
      definitionYaml: `
id: json-selector-position-cardigann
name: JSON Selector Position Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results:eq(1)
  fields:
    title:
      selector: title
    download:
      selector: links.download:last
    category:
      selector: category:last
      case:
        Movies: movies
    size:
      selector: stats.size
    seeders:
      selector: stats.seeders
    date:
      selector: published
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Position Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Position Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/position-final",
      category: "2000",
      size: 2_000_000_000,
      seeders: 44,
    })
  })

  it("resolves Cardigann JSON selector lists for row and field fallbacks", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON_SELECTOR_LIST_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 74,
      name: "JSON Selector List Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-selector-list-cardigann",
      definitionYaml: `
id: json-selector-list-cardigann
name: JSON Selector List Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results, $.data.fallback
  fields:
    title:
      selector: titles.primary, titles.fallback
    details:
      selector: links.details, links.altDetails
    download:
      selector: links.download, links.altDownload
    category:
      selector: category.name, category.alt
      case:
        Movies: movies
    size:
      selector: stats.size
    seeders:
      selector: stats.seeders
    date:
      selector: published
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON List Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON List Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/json-list",
      infoUrl: "https://tracker.example/details/json-list",
      category: "2000",
      size: 2_500_000_000,
      seeders: 61,
    })
  })

  it("normalizes Cardigann field-name modifiers in JSON selector results", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 65,
      name: "JSON Field Modifier Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-field-modifier-cardigann",
      definitionYaml: `
id: json-field-modifier-cardigann
name: JSON Field Modifier Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
    title|append:
      text: .Extended
    download|optional:
      selector: links.download
    category:
      selector: category.name
      case:
        Movies: movies
    seeders:
      selector: stats.seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Movie 2026 1080p WEB-DL.Extended",
      downloadUrl: "https://tracker.example/download/json",
      category: "2000",
      seeders: 88,
      protocol: "torrent",
    })
  })

  it("returns no releases when Cardigann JSON rows count is empty", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { total: 0 } })))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 61,
      name: "JSON Count Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-count-cardigann",
      definitionYaml: `
id: json-count-cardigann
name: JSON Count Cardigann
links:
  - https://tracker.example
caps:
  categorymappings: []
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results
    count:
      selector: $.data.total
  fields:
    title:
      selector: title
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Missing Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toEqual([])
  })

  it("expands Cardigann JSON row attributes with multiple rows", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              results: [
                {
                  category: "Movies",
                  torrents: {
                    hd: {
                      title: "Nested JSON Movie 2026 1080p WEB-DL",
                      download: "/download/nested-hd",
                      size: "1.4 GB",
                      seeders: 32,
                    },
                    remux: {
                      title: "Nested JSON Movie 2026 2160p Remux",
                      download: "/download/nested-remux",
                      size: "55 GB",
                      seeders: 12,
                    },
                  },
                },
                { ignored: true },
              ],
            },
          }),
        ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 62,
      name: "JSON Attribute Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-attribute-cardigann",
      definitionYaml: `
id: json-attribute-cardigann
name: JSON Attribute Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/search
      response:
        type: json
  rows:
    selector: $.data.results
    attribute: torrents
    multiple: true
    missingAttributeEqualsNoResults: true
  fields:
    title:
      selector: title
    download:
      selector: download
    category:
      selector: ..category
    size:
      selector: size
    seeders:
      selector: seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Nested JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(2)
    expect(releases.map((release) => release.title)).toEqual([
      "Nested JSON Movie 2026 1080p WEB-DL",
      "Nested JSON Movie 2026 2160p Remux",
    ])
    expect(releases[0]).toMatchObject({
      downloadUrl: "https://tracker.example/download/nested-hd",
      category: "2000",
      size: 1_400_000_000,
      seeders: 32,
    })
    expect(releases[1]).toMatchObject({
      downloadUrl: "https://tracker.example/download/nested-remux",
      category: "2000",
      size: 55_000_000_000,
      seeders: 12,
    })
  })

  it("applies Cardigann preprocessing filters before JSON parsing", async () => {
    const fetchMock = vi.fn(async () => new Response(`callback(${JSON_RESULTS});`, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 58,
      name: "Preprocessed JSON Cardigann",
      type: "cardigann_yaml",
      definitionKey: "preprocessed-json-cardigann",
      definitionYaml: `
id: preprocessed-json-cardigann
name: Preprocessed JSON Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  preprocessingfilters:
    - name: regexp
      args: 'callback\\(([\\s\\S]*)\\);'
  paths:
    - path: /api/jsonp
      response:
        type: json
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
    download:
      selector: links.download
    category:
      selector: category.name
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 30,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/json",
      category: "2000",
    })
  })

  it("applies Cardigann preprocessing filters before XML parsing", async () => {
    const fetchMock = vi.fn(async () => new Response(`noise:${RSS_XML}:noise`, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 59,
      name: "Preprocessed XML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "preprocessed-xml-cardigann",
      definitionYaml: `
id: preprocessed-xml-cardigann
name: Preprocessed XML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  preprocessingfilters:
    - name: regexp
      args: '[\\s\\S]*(<rss[\\s\\S]*</rss>)[\\s\\S]*'
  paths:
    - path: /api/xml
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 25,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Example Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      category: "2000",
      seeders: 44,
    })
  })

  it("parses Cardigann XML selector results", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(`
<response>
  <results>
    <torrent>
      <title>XML Selector Movie 2026 1080p WEB-DL</title>
      <download href="/download/xml-selector">Download</download>
      <details href="/details/xml-selector">Details</details>
      <category>Movies</category>
      <size>700 MB</size>
      <seeders>19</seeders>
      <leechers>2</leechers>
      <date>2026-05-09T00:00:00.000Z</date>
    </torrent>
  </results>
</response>
`),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 63,
      name: "XML Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "xml-selector-cardigann",
      definitionYaml: `
id: xml-selector-cardigann
name: XML Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /api/xml-selector
      response:
        type: xml
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: torrent
  fields:
    title:
      selector: title
    download:
      selector: download
      attribute: href
    details:
      selector: details
      attribute: href
    category:
      selector: category
    size:
      selector: size
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    date:
      selector: date
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 25,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "XML Selector Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "XML Selector Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/xml-selector",
      infoUrl: "https://tracker.example/details/xml-selector",
      category: "2000",
      size: 700_000_000,
      seeders: 19,
      leechers: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })

  it("returns no releases for Cardigann response no-results messages", async () => {
    const fetchMock = vi.fn(async () => new Response("NO JSON RESULTS", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 60,
      name: "No Results JSON Cardigann",
      type: "cardigann_yaml",
      definitionKey: "no-results-json-cardigann",
      definitionYaml: `
id: no-results-json-cardigann
name: No Results JSON Cardigann
links:
  - https://tracker.example
caps:
  categorymappings: []
  modes:
    search: [q]
search:
  paths:
    - path: /api/no-results
      response:
        type: json
        noResultsMessage: NO JSON RESULTS
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: $.data.results
  fields:
    title:
      selector: title
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 20,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Missing Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toEqual([])
  })

  it("returns definition capabilities without a network request when testing connection", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 8,
      name: "Cardigann TV",
      type: "cardigann_yaml",
      definitionKey: "open-tv-torrents",
      baseUrl: "https://tracker.example",
      apiKey: "api-key",
      priority: 50,
      categories: [],
      protocol: "torrent",
    })

    const caps = await Effect.runPromise(adapter.testConnection())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(caps.searchTypes).toEqual(["search", "tvsearch"])
    expect(caps.categories.map((category) => category.id)).toEqual([5000, 5040])
  })

  it("builds Nyaa RSS search requests from the built-in definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 11,
      name: "Nyaa",
      type: "cardigann_yaml",
      definitionKey: "nyaa",
      baseUrl: "https://nyaa.si",
      apiKey: "",
      priority: 20,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Example Anime", type: "tv", categories: [5070] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://nyaa.si")
    expect(url.pathname).toBe("/")
    expect(url.searchParams.get("page")).toBe("rss")
    expect(url.searchParams.get("q")).toBe("Example Anime")
    expect(url.searchParams.get("f")).toBe("0")
    expect(url.searchParams.get("c")).toBe("0_0")
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      indexerId: 11,
      indexerName: "Nyaa",
      indexerPriority: 20,
    })
  })

  it("builds HDAccess Torznab search requests from the built-in definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 86,
      name: "HDAccess",
      type: "cardigann_yaml",
      definitionKey: "hdaccess",
      baseUrl: "https://hdaccess.net",
      apiKey: "hda-key",
      priority: 18,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Better Call Saul", type: "tv", categories: [5040] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://hdaccess.net")
    expect(url.pathname).toBe("/api")
    expect(url.searchParams.get("apikey")).toBe("hda-key")
    expect(url.searchParams.get("t")).toBe("tvsearch")
    expect(url.searchParams.get("q")).toBe("Better Call Saul")
    expect(url.searchParams.get("cat")).toBe("tv-hd")
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      indexerId: 86,
      indexerName: "HDAccess",
      indexerPriority: 18,
    })
  })

  it("builds and parses Anidex HTML searches from the built-in definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(ANIDEX_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 87,
      name: "Anidex",
      type: "cardigann_yaml",
      definitionKey: "anidex",
      baseUrl: "https://anidex.info",
      apiKey: "",
      configValues: {
        authorisedOnly: "true",
        language: "1",
      },
      priority: 22,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Spy Family", type: "tv", categories: [5070] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://anidex.info")
    expect(url.pathname).toBe("/")
    expect(url.searchParams.get("page")).toBe("search")
    expect(url.searchParams.get("s")).toBe("upload_timestamp")
    expect(url.searchParams.get("o")).toBe("desc")
    expect(url.searchParams.get("group_id")).toBe("0")
    expect(url.searchParams.get("q")).toBe("Spy Family")
    expect(url.searchParams.get("id")).toBe("1,2,3,4,5")
    expect(url.searchParams.get("a")).toBe("1")
    expect(url.searchParams.get("lang_id")).toBe("1")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "[ExampleSubs] Spy Family - 01 (1080p)",
      downloadUrl: "https://anidex.info/dl/12345",
      infoUrl: "https://anidex.info/?page=torrent&id=12345",
      category: "5070",
      size: 1_503_238_554,
      seeders: 42,
      leechers: 3,
      indexerId: 87,
      indexerName: "Anidex",
      indexerPriority: 22,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-06T11:22:33.000Z")
  })

  it("builds and parses TorrentsCSV JSON searches from the built-in definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(TORRENTS_CSV_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 88,
      name: "TorrentsCSV",
      type: "cardigann_yaml",
      definitionKey: "torrents-csv",
      baseUrl: "https://torrents-csv.com",
      apiKey: "",
      priority: 24,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Ubuntu ISO", type: "general", categories: [8000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://torrents-csv.com")
    expect(url.pathname).toBe("/service/search")
    expect(url.searchParams.get("size")).toBe("100")
    expect(url.searchParams.get("q")).toBe("Ubuntu ISO")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Ubuntu 24.04 ISO",
      downloadUrl: "magnet:?xt=urn:btih:abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      infoUrl: "https://torrents-csv.com/search?q=Ubuntu%2024.04%20ISO",
      category: "8000",
      size: 3_200_000_000,
      seeders: 12,
      leechers: 4,
      infohash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      indexerId: 88,
      indexerName: "TorrentsCSV",
      indexerPriority: 24,
    })
  })

  it("builds and parses SubsPlease JSON searches from the built-in definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(SUBSPLEASE_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 89,
      name: "SubsPlease",
      type: "cardigann_yaml",
      definitionKey: "subsplease",
      baseUrl: "https://subsplease.org",
      apiKey: "",
      priority: 25,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Spy Family", type: "tv", categories: [5070] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://subsplease.org")
    expect(url.pathname).toBe("/api/")
    expect(url.searchParams.get("tz")).toBe("UTC")
    expect(url.searchParams.get("f")).toBe("search")
    expect(url.searchParams.get("s")).toBe("Spy Family")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "[SubsPlease] Spy x Family - 01 (1080p)",
      downloadUrl:
        "magnet:?xt=urn:btih:feedfacefeedfacefeedfacefeedfacefeedface&dn=Spy%20x%20Family&xl=1395864371",
      infoUrl: "https://subsplease.org/shows/spy-x-family/",
      category: "5070",
      size: 1_395_864_371,
      seeders: 1,
      leechers: 2,
      indexerId: 89,
      indexerName: "SubsPlease",
      indexerPriority: 25,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-08T12:34:56.000Z")
  })

  it("parses first-pass Cardigann HTML selector results", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 13,
      name: "HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-cardigann",
      definitionYaml: `
id: html-cardigann
name: HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
      inputs:
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
  rows:
    selector: tr.torrent
  fields:
    category:
      selector: a.category
      attribute: href
      filters:
        - name: querystring
          args: cat
    title_default:
      selector: a.short-title
    title:
      selector: a.full-title
      optional: true
      default: "{{ .Result.title_default }}"
    details:
      selector: a.details
      attribute: href
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    seeders:
      selector: td.seeders
    leechers:
      selector: td.leechers
    date:
      selector: time
      attribute: datetime
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Fallback Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/browse")
    expect(url.searchParams.get("q")).toBe("Fallback Movie")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Fallback Movie 2026 1080p WEB-DL",
      indexerId: 13,
      indexerName: "HTML Cardigann",
      indexerPriority: 35,
      size: 1_610_612_736,
      seeders: 1234,
      leechers: 56,
      downloadUrl: "https://tracker.example/download/1",
      infoUrl: "https://tracker.example/details/1",
      category: "2000",
      protocol: "torrent",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-01T00:00:00.000Z")
  })

  it("uses Cardigann magnet fields as torrent download URLs", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_MAGNET_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 67,
      name: "Magnet HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "magnet-html-cardigann",
      definitionYaml: `
id: magnet-html-cardigann
name: Magnet HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
    magnet:
      selector: a.magnet
      attribute: href
    category:
      selector: td.category
    seeders:
      selector: td.seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Magnet Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Magnet Movie 2026 1080p WEB-DL",
      downloadUrl: "magnet:?xt=urn:btih:0123456789abcdef&dn=Magnet+Movie",
      category: "2000",
      seeders: 23,
    })
  })

  it("maps Cardigann categorydesc fields through tracker category descriptions", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 68,
      name: "Category Description HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "category-desc-html-cardigann",
      definitionYaml: `
id: category-desc-html-cardigann
name: Category Description HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movie-hd
      cat: movies-hd
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.short-title
    download:
      selector: a.download
      attribute: href
    categorydesc:
      selector: a.category
    seeders:
      selector: td.seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Fallback Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Fallback Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/1",
      category: "2000",
      seeders: 1234,
    })
  })

  it("renders templates in Cardigann HTML row and field selectors", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 70,
      name: "Templated Selector HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "templated-selector-html-cardigann",
      definitionYaml: `
id: templated-selector-html-cardigann
name: Templated Selector HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.{{ .Config.rowClass }}
  fields:
    title:
      selector: a.{{ .Config.titleClass }}
    download:
      selector: a.{{ .Config.downloadClass }}
      attribute: href
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
      configValues: {
        rowClass: "torrent",
        titleClass: "short-title",
        downloadClass: "download",
      },
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Fallback Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Fallback Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/1",
      category: "2000",
    })
  })

  it("normalizes Cardigann field-name modifiers in HTML selector results", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_FIELD_MODIFIER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 64,
      name: "Field Modifier HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "field-modifier-html-cardigann",
      definitionYaml: `
id: field-modifier-html-cardigann
name: Field Modifier HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: td.title-main
    title|append:
      selector: td.title-extra
    download|optional:
      selector: a.download
      attribute: href
    category:
      selector: td.category
    category|noappend:
      selector: td.category a
      attribute: href
      optional: true
      filters:
        - name: querystring
          args: cat
    seeders:
      selector: td.seeders
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Modifier Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Modifier.Movie.2026.1080p.WEB-DL",
      downloadUrl: "https://tracker.example/download/modifier",
      category: "2000",
      seeders: 17,
      protocol: "torrent",
    })
  })

  it("applies Cardigann relative-time field filters to HTML dates", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_RELATIVE_TIME_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 50,
      name: "Relative Time HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "relative-time-html-cardigann",
      definitionYaml: `
id: relative-time-html-cardigann
name: Relative Time HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    date:
      selector: td.date
      filters:
        - name: timeago
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Relative Time Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Relative Time Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/relative",
      age: 2,
    })
  })

  it.each(["dateparse", "timeparse"] as const)(
    "applies Cardigann %s field filters to HTML dates",
    async (filterName) => {
      const fetchMock = vi.fn(async () => new Response(HTML_DATEPARSE_RESULTS, { status: 200 }))
      vi.stubGlobal("fetch", fetchMock)

      const adapter = createCardigannYamlAdapter({
        id: filterName === "dateparse" ? 51 : 52,
        name: "Date Parse HTML Cardigann",
        type: "cardigann_yaml",
        definitionKey: `${filterName}-html-cardigann`,
        definitionYaml: `
id: ${filterName}-html-cardigann
name: Date Parse HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    date:
      selector: td.date
      filters:
        - name: ${filterName}
          args: "yyyy-MMM-dd HH:mm:ss zzz"
`,
        baseUrl: "https://tracker.example",
        apiKey: "",
        priority: 35,
        categories: [],
        protocol: "torrent",
      })

      const releases = await Effect.runPromise(
        adapter.search({ term: "Date Parse Movie", type: "general", categories: [2000] }),
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(releases).toHaveLength(1)
      expect(releases[0]).toMatchObject({
        title: "Date Parse Movie 2026 1080p WEB-DL",
        downloadUrl: "https://tracker.example/download/dateparse",
      })
      expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-02T13:45:30.000Z")
    },
  )

  it("applies Cardigann HTML date headers when release rows omit dates", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_DATE_HEADER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 54,
      name: "Date Header HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "date-header-html-cardigann",
      definitionYaml: `
id: date-header-html-cardigann
name: Date Header HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
    dateheaders:
      selector: td.date-header
      filters:
        - name: dateparse
          args: "yyyy-MM-dd"
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Header Date Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(3)
    expect(releases[0]).toMatchObject({
      title: "Header Date Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/header-date",
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-04T00:00:00.000Z")
    expect(releases[1]?.publishedAt.toISOString()).toBe("2026-05-04T00:00:00.000Z")
    expect(releases[2]?.publishedAt.toISOString()).toBe("2026-05-05T00:00:00.000Z")
  })

  it("applies additional Cardigann field filters to HTML fields", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_FIELD_FILTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 55,
      name: "Field Filter HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "field-filter-html-cardigann",
      definitionYaml: `
id: field-filter-html-cardigann
name: Field Filter HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: Movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
      filters:
        - name: diacritics
          args: replace
        - name: validfilename
    download:
      selector: a.download
      attribute: href
    category:
      selector: td.category
      filters:
        - name: validate
          args: "Movies, TV"
    date:
      selector: td.date
      filters:
        - name: fuzzytime
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Creme Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Creme Movie_ 2026_1080p_ WEB-DL",
      downloadUrl: "https://tracker.example/download/filtered",
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-06T00:00:00.000Z")
  })

  it("applies Cardigann jsonjoinarray field filters to HTML fields", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_JSON_JOIN_FIELD_FILTER_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 56,
      name: "JSON Join Field Filter HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "json-join-field-filter-html-cardigann",
      definitionYaml: `
id: json-join-field-filter-html-cardigann
name: JSON Join Field Filter HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: Movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: td.title-json
      filters:
        - name: jsonjoinarray
          args:
            - $.parts
            - " "
    download:
      selector: a.download
      attribute: href
    category:
      selector: td.category-json
      filters:
        - name: jsonjoinarray
          args:
            - $.categories
            - ", "
    date:
      selector: td.date
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "JSON Join Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "JSON Join Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/json-joined",
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-07T00:00:00.000Z")
  })

  it("applies Cardigann andmatch row filters to HTML results", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_ROW_FILTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 53,
      name: "Row Filter HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "row-filter-html-cardigann",
      definitionYaml: `
id: row-filter-html-cardigann
name: Row Filter HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
    filters:
      - name: andmatch
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
    size:
      selector: td.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Wanted Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Wanted Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/wanted",
      category: "2000",
    })
  })

  it("filters Cardigann HTML selectors with contains, has, and not pseudo filters", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_SELECTOR_PSEUDO_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 69,
      name: "HTML Selector Pseudo Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-selector-pseudo-cardigann",
      definitionYaml: `
id: html-selector-pseudo-cardigann
name: HTML Selector Pseudo Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent:contains(Freeleech):has(a.download):not(span.dead)
  fields:
    title:
      selector: a.title:contains(Wanted Movie)
    download:
      selector: a.download:contains(Download)
      attribute: href
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Wanted Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Wanted Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/wanted-pseudo",
      category: "2000",
    })
  })

  it("matches Cardigann HTML selectors with expanded attribute operators", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_ATTRIBUTE_OPERATOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 72,
      name: "HTML Attribute Operator Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-attribute-operator-cardigann",
      definitionYaml: `
id: html-attribute-operator-cardigann
name: HTML Attribute Operator Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent[data-flags~=freeleech][data-language|=en i][data-status!=dead]
  fields:
    title:
      selector: a.title
    download:
      selector: a.download[rel~=nofollow][data-protocol|=torrent i][data-disabled!=true]
      attribute: href
    category:
      selector: span.category[data-value=movies i]
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Attribute Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Attribute Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/attribute-final",
      category: "2000",
    })
  })

  it("matches Cardigann HTML selectors with escaped CSS identifiers", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_ESCAPED_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 88,
      name: "HTML Escaped Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-escaped-selector-cardigann",
      definitionYaml: `
id: html-escaped-selector-cardigann
name: HTML Escaped Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies-hd
      cat: Movies
      desc: "Movies:HD"
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: 'tr#row\\:movie.torrent.release\\.item[data-token="release\\#main"]'
  fields:
    title:
      selector: 'a.title.link\\:details'
    details:
      selector: 'a.title.link\\:details'
      attribute: href
    download:
      selector: 'a.download.link\\.download[data-token="release\\#main"]'
      attribute: href
    category:
      selector: 'span.category[data-value="Movies\\:HD"]'
      attribute: data-value
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Escaped Selector Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Escaped Selector Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/escaped-selector",
      downloadUrl: "https://tracker.example/download/escaped-selector",
      category: "2000",
    })
  })

  it("matches Cardigann HTML selectors with escaped attribute names", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_ESCAPED_ATTRIBUTE_NAME_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 93,
      name: "HTML Escaped Attribute Name Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-escaped-attribute-name-selector-cardigann",
      definitionYaml: `
id: html-escaped-attribute-name-selector-cardigann
name: HTML Escaped Attribute Name Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies-hd
      cat: Movies
      desc: "Movies:HD"
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: 'tr.torrent[data\\:token="release:main"]'
  fields:
    title:
      selector: 'a.title[data\\:slug="details:main"]'
    details:
      selector: 'a.title[data\\:slug="details:main"]'
      attribute: href
    download:
      selector: 'a.download[data\\:token="download:main"]'
      attribute: href
    category:
      selector: 'span.category[data\\:category="Movies:HD"]'
      attribute: data:category
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Escaped Attribute Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Escaped Attribute Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/escaped-attribute",
      downloadUrl: "https://tracker.example/download/escaped-attribute",
      category: "2000",
    })
  })

  it("matches Cardigann HTML selectors with escaped delimiter characters", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_ESCAPED_DELIMITER_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 90,
      name: "HTML Escaped Delimiter Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-escaped-delimiter-selector-cardigann",
      definitionYaml: `
id: html-escaped-delimiter-selector-cardigann
name: HTML Escaped Delimiter Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies-hd
      cat: Movies
      desc: "Movies,HD"
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: 'tr.torrent.release\\,item[data-token="release\\,main"]:is(.release\\,item, .fallback)'
  fields:
    title:
      selector: 'a.title.title\\~main'
    details:
      selector: 'a.title.title\\~main'
      attribute: href
    download:
      selector: 'a.download.download\\+main[data-token="download\\,main"]'
      attribute: href
    category:
      selector: 'span.category[data-value="Movies\\,HD"]'
      attribute: data-value
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 36,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Escaped Delimiter Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Escaped Delimiter Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/escaped-delimiter",
      downloadUrl: "https://tracker.example/download/escaped-delimiter",
      category: "2000",
    })
  })

  it("matches Cardigann HTML selectors with quoted attribute delimiter characters", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_QUOTED_ATTRIBUTE_DELIMITER_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 92,
      name: "HTML Quoted Attribute Delimiter Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-quoted-attribute-delimiter-selector-cardigann",
      definitionYaml: `
id: html-quoted-attribute-delimiter-selector-cardigann
name: HTML Quoted Attribute Delimiter Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies-hd
      cat: Movies
      desc: "Movies>HD"
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: 'tr.torrent.release\\>item[data-token="release\\>main"]'
  fields:
    title:
      selector: 'a.title.title\\>main[data-slug="details\\>main"]'
    details:
      selector: 'a.title.title\\>main[data-slug="details\\>main"]'
      attribute: href
    download:
      selector: 'a.download.download\\>main[data-token="download\\>main"]'
      attribute: href
    category:
      selector: 'span.category[data-value="Movies\\>HD"]'
      attribute: data-value
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 36,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Quoted Attribute Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Quoted Attribute Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/quoted-attribute",
      downloadUrl: "https://tracker.example/download/quoted-attribute",
      category: "2000",
    })
  })

  it("matches Cardigann HTML selectors with matching pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_MATCHING_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 89,
      name: "HTML Matching Pseudo Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-matching-pseudo-cardigann",
      definitionYaml: `
id: html-matching-pseudo-cardigann
name: HTML Matching Pseudo Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent:is(.primary, .featured):where([data-status="alive"], .backup)
  fields:
    title:
      selector: a:is(.primary-title, .fallback-title)
    details:
      selector: a:is(.primary-title, .fallback-title)
      attribute: href
    download:
      selector: a:matches(.download, .magnet-link)
      attribute: href
    category:
      selector: span.category:where(.hd, .uhd)
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Grouping Pseudo Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Grouping Pseudo Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/grouping-pseudo",
      downloadUrl: "https://tracker.example/download/grouping-pseudo",
      category: "2000",
    })
  })

  it("matches Cardigann HTML selectors with simple parts after pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_MATCHING_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 91,
      name: "HTML Pseudo Tail Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-pseudo-tail-cardigann",
      definitionYaml: `
id: html-pseudo-tail-cardigann
name: HTML Pseudo Tail Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr:is(.primary, .featured)[data-status="alive"].torrent
  fields:
    title:
      selector: a:is(.primary-title, .fallback-title).title
    details:
      selector: a:is(.primary-title, .fallback-title).title
      attribute: href
    download:
      selector: a:matches(.magnet-link).download
      attribute: href
    category:
      selector: span:where(.hd, .uhd).category
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 37,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Grouping Pseudo Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Grouping Pseudo Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/grouping-pseudo",
      downloadUrl: "https://tracker.example/download/grouping-pseudo",
      category: "2000",
    })
  })

  it("matches Cardigann HTML empty and parent pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_CONTENT_STATE_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 94,
      name: "HTML Content State Pseudo Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-content-state-pseudo-selector-cardigann",
      definitionYaml: `
id: html-content-state-pseudo-selector-cardigann
name: HTML Content State Pseudo Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent:has(td.marker:empty):has(td.notes:parent)
  fields:
    title:
      selector: a.title:parent
    details:
      selector: a.title:parent
      attribute: href
    download:
      selector: a.download:parent
      attribute: href
    category:
      selector: span.category:parent
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 37,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Content State Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Content State Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/content-state",
      downloadUrl: "https://tracker.example/download/content-state",
      category: "2000",
    })
  })

  it("applies Cardigann HTML positional selector filters", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_SELECTOR_POSITION_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 70,
      name: "HTML Selector Position Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-selector-position-cardigann",
      definitionYaml: `
id: html-selector-position-cardigann
name: HTML Selector Position Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent:eq(1)
  fields:
    title:
      selector: a.title
    download:
      selector: a.download:last
      attribute: href
    category:
      selector: span.category:first
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Position Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Position Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/position-final",
      category: "2000",
    })
  })

  it("resolves Cardigann HTML selector lists in document order", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_SELECTOR_LIST_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 71,
      name: "HTML Selector List Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-selector-list-cardigann",
      definitionYaml: `
id: html-selector-list-cardigann
name: HTML Selector List Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent, tr.release
  fields:
    title:
      selector: a.title, span.title
    download:
      selector: a.magnet, a.download
      attribute: href
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Comma", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(2)
    expect(releases.map((release) => release.title)).toEqual([
      "Comma First Movie 2026 1080p WEB-DL",
      "Comma Second Movie 2026 720p WEB-DL",
    ])
    expect(releases.map((release) => release.downloadUrl)).toEqual([
      "https://tracker.example/download/comma-first",
      "magnet:?xt=urn:btih:abcdefabcdefabcd&dn=Comma+Second",
    ])
  })

  it("matches Cardigann HTML direct-child selectors", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_DIRECT_CHILD_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 72,
      name: "HTML Direct Child Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-direct-child-selector-cardigann",
      definitionYaml: `
id: html-direct-child-selector-cardigann
name: HTML Direct Child Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: table.results > tr.torrent
  fields:
    title:
      selector: td.name > a.title
    details:
      selector: td.name > a.title
      attribute: href
    download:
      selector: td.actions > a.download
      attribute: href
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Direct Child", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Direct Child Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/direct-child",
      downloadUrl: "https://tracker.example/download/direct-child",
      category: "2000",
    })
  })

  it("matches Cardigann HTML void elements and state pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_VOID_STATE_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 73,
      name: "HTML Void State Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-void-state-selector-cardigann",
      definitionYaml: `
id: html-void-state-selector-cardigann
name: HTML Void State Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent:has(input.download-control:checked):not(input.dead:disabled)
  fields:
    title:
      selector: a.title
    details:
      selector: a.title
      attribute: href
    download:
      selector: input.download-control:checked
      attribute: value
    category:
      selector: img.category-icon
      attribute: alt
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Void State", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Void State Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/void-state",
      downloadUrl: "https://tracker.example/download/void-state",
      category: "2000",
    })
  })

  it("matches Cardigann HTML form pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_FORM_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 80,
      name: "HTML Form Pseudo Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-form-pseudo-selector-cardigann",
      definitionYaml: `
id: html-form-pseudo-selector-cardigann
name: HTML Form Pseudo Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: article.release:has(.title-source:input:text):has(.download-target:input:radio:checked):has(select.category:input option:selected)
  fields:
    title:
      selector: .title-source:input:text
      attribute: value
    details:
      selector: button.details-button:button
      attribute: data-href
    download:
      selector: .download-target:input:radio:checked
      attribute: value
    size:
      selector: textarea.size-source:input
    category:
      selector: select.category:input option:selected
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Form Pseudo", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Form Pseudo Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/form-pseudo",
      downloadUrl: "https://tracker.example/download/form-pseudo",
      size: 2_400_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML visibility pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_VISIBILITY_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 83,
      name: "HTML Visibility Pseudo Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-visibility-pseudo-selector-cardigann",
      definitionYaml: `
id: html-visibility-pseudo-selector-cardigann
name: HTML Visibility Pseudo Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: article.release:visible:has(a.title:visible):has(input.download:hidden)
  fields:
    title:
      selector: a.title:visible
    details:
      selector: a.title:visible
      attribute: href
    download:
      selector: input.download:hidden
      attribute: value
    size:
      selector: span.size:visible
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Visibility Pseudo", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Visibility Pseudo Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/visibility",
      downloadUrl: "https://tracker.example/download/visibility",
      size: 2_500_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML header pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_HEADER_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 84,
      name: "HTML Header Pseudo Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-header-pseudo-selector-cardigann",
      definitionYaml: `
id: html-header-pseudo-selector-cardigann
name: HTML Header Pseudo Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: article.release:has(.release-title:header):has(a.download)
  fields:
    title:
      selector: .release-title:header
    details:
      selector: .release-title:header a
      attribute: href
    download:
      selector: a.download
      attribute: href
    size:
      selector: span.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Header Pseudo", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Header Pseudo Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/header-pseudo",
      downloadUrl: "https://tracker.example/download/header-pseudo",
      size: 2_600_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML root pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_ROOT_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 88,
      name: "HTML Root Pseudo Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-root-pseudo-selector-cardigann",
      definitionYaml: `
id: html-root-pseudo-selector-cardigann
name: HTML Root Pseudo Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: section:root article.release, html:root body > article.release
  fields:
    title:
      selector: a.title
    details:
      selector: a.title
      attribute: href
    download:
      selector: a.download
      attribute: href
    size:
      selector: span.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Root Pseudo", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Root Pseudo Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/root-pseudo",
      downloadUrl: "https://tracker.example/download/root-pseudo",
      size: 2_700_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML language pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_LANG_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 89,
      name: "HTML Lang Pseudo Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-lang-pseudo-selector-cardigann",
      definitionYaml: `
id: html-lang-pseudo-selector-cardigann
name: HTML Lang Pseudo Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: article.release:lang(en)
  fields:
    title:
      selector: a.title
    details:
      selector: a.title
      attribute: href
    download:
      selector: a.download
      attribute: href
    size:
      selector: span.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Lang Pseudo", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(2)
    expect(releases.map((release) => release.title)).toEqual([
      "Language Inherited Movie 2026 1080p WEB-DL",
      "Language Direct Movie 2026 1080p WEB-DL",
    ])
    expect(releases.map((release) => release.downloadUrl)).toEqual([
      "https://tracker.example/download/lang-inherited",
      "https://tracker.example/download/lang-direct",
    ])
    expect(releases.map((release) => release.size)).toEqual([2_800_000_000, 1_400_000_000])
  })

  it("matches Cardigann HTML child-position pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_CHILD_PSEUDO_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 74,
      name: "HTML Child Pseudo Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-child-pseudo-selector-cardigann",
      definitionYaml: `
id: html-child-pseudo-selector-cardigann
name: HTML Child Pseudo Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tbody > tr.torrent:last-child
  fields:
    title:
      selector: td.name:first-child a.title
    details:
      selector: td.name:first-child a.title
      attribute: href
    download:
      selector: td.actions:last-child a.download
      attribute: href
    size:
      selector: td.stats span.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Child Pseudo", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Child Pseudo Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/child-pseudo",
      downloadUrl: "https://tracker.example/download/child-pseudo",
      size: 1_200_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML nth-child pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_NTH_CHILD_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 75,
      name: "HTML Nth Child Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-nth-child-selector-cardigann",
      definitionYaml: `
id: html-nth-child-selector-cardigann
name: HTML Nth Child Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tbody > tr.torrent:nth-child(3)
  fields:
    title:
      selector: td:nth-child(2n+3) a.title
    details:
      selector: td:nth-child(2n+3) a.title
      attribute: href
    download:
      selector: td:nth-child(1) a.download
      attribute: href
    size:
      selector: td:nth-child(even)
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Nth Child", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Nth Child Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/nth-child",
      downloadUrl: "https://tracker.example/download/nth-child",
      size: 1_700_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML nth-last-child pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_NTH_LAST_CHILD_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 76,
      name: "HTML Nth Last Child Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-nth-last-child-selector-cardigann",
      definitionYaml: `
id: html-nth-last-child-selector-cardigann
name: HTML Nth Last Child Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tbody > tr.torrent:nth-last-child(2)
  fields:
    title:
      selector: td:nth-last-child(3) a.title
    details:
      selector: td:nth-last-child(3) a.title
      attribute: href
    download:
      selector: td:nth-last-child(1) a.download
      attribute: href
    size:
      selector: td:nth-last-child(2)
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Nth Last Child", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Nth Last Child Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/nth-last-child",
      downloadUrl: "https://tracker.example/download/nth-last-child",
      size: 1_800_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML of-type pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_OF_TYPE_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 77,
      name: "HTML Of Type Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-of-type-selector-cardigann",
      definitionYaml: `
id: html-of-type-selector-cardigann
name: HTML Of Type Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: div.cards > article.release:nth-of-type(2)
  fields:
    title:
      selector: a:nth-last-of-type(2)
    details:
      selector: a:nth-last-of-type(2)
      attribute: href
    download:
      selector: a:nth-of-type(2)
      attribute: href
    size:
      selector: span:nth-of-type(2)
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Of Type", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Of Type Movie 2026 1080p WEB-DL",
      infoUrl: "https://tracker.example/details/of-type",
      downloadUrl: "https://tracker.example/download/of-type",
      size: 1_900_000_000,
      category: "2000",
    })
  })

  it("matches Cardigann HTML only-child and only-of-type pseudo classes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_ONLY_CHILD_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 78,
      name: "HTML Only Child Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-only-child-selector-cardigann",
      definitionYaml: `
id: html-only-child-selector-cardigann
name: HTML Only Child Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: section.child-check > article.release:only-child, section.type-check > article.release:only-of-type
  fields:
    title:
      selector: a.title
    details:
      selector: a.title
      attribute: href
    download:
      selector: a.download
      attribute: href
    size:
      selector: span.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Only Child", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(2)
    expect(releases.map((release) => release.title)).toEqual([
      "Only Child Movie 2026 1080p WEB-DL",
      "Only Of Type Movie 2026 1080p WEB-DL",
    ])
    expect(releases.map((release) => release.downloadUrl)).toEqual([
      "https://tracker.example/download/only-child",
      "https://tracker.example/download/only-of-type",
    ])
    expect(releases.map((release) => release.size)).toEqual([2_000_000_000, 2_100_000_000])
  })

  it("matches Cardigann HTML sibling combinators", async () => {
    const fetchMock = vi.fn(
      async () => new Response(HTML_SIBLING_SELECTOR_RESULTS, { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 79,
      name: "HTML Sibling Selector Cardigann",
      type: "cardigann_yaml",
      definitionKey: "html-sibling-selector-cardigann",
      definitionYaml: `
id: html-sibling-selector-cardigann
name: HTML Sibling Selector Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.group + tr.torrent.adjacent, tr.marker ~ tr.torrent.general
  fields:
    title:
      selector: td.name a.title
    details:
      selector: td.name a.title
      attribute: href
    download:
      selector: td.name + td.actions a.download
      attribute: href
    size:
      selector: td.name ~ td.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Sibling", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(2)
    expect(releases.map((release) => release.title)).toEqual([
      "Adjacent Sibling Movie 2026 1080p WEB-DL",
      "General Sibling Movie 2026 1080p WEB-DL",
    ])
    expect(releases.map((release) => release.downloadUrl)).toEqual([
      "https://tracker.example/download/adjacent-sibling",
      "https://tracker.example/download/general-sibling",
    ])
    expect(releases.map((release) => release.size)).toEqual([2_200_000_000, 2_300_000_000])
  })

  it("resolves nested Cardigann HTML descendant selectors within their parent matches", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_NESTED_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 26,
      name: "Nested HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "nested-html-cardigann",
      definitionYaml: `
id: nested-html-cardigann
name: Nested HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: table.results tr.torrent
  fields:
    title:
      selector: td.name a
    details:
      selector: td.name a
      attribute: href
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: td.stats span.size
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Nested Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Nested Movie 2026 2160p WEB-DL",
      downloadUrl: "https://tracker.example/download/2",
      infoUrl: "https://tracker.example/details/2",
      size: 2_000_000_000,
      category: "2000",
    })
  })

  it("merges Cardigann HTML rows using rows.after before extracting fields", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_AFTER_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 27,
      name: "After Rows HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "after-rows-html-cardigann",
      definitionYaml: `
id: after-rows-html-cardigann
name: After Rows HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: table.results tr
    after: 1
  fields:
    title:
      selector: td.name a
    details:
      selector: td.name a
      attribute: href
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: span.size
    date:
      selector: time
      attribute: datetime
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Split Row Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Split Row Movie 2026 1080p BluRay",
      downloadUrl: "https://tracker.example/download/3",
      infoUrl: "https://tracker.example/details/3",
      size: 3_758_096_384,
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-03T00:00:00.000Z")
  })

  it("merges Cardigann HTML rows using rows.before before extracting fields", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_BEFORE_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 73,
      name: "Before Rows HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "before-rows-html-cardigann",
      definitionYaml: `
id: before-rows-html-cardigann
name: Before Rows HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: table.results tr
    before: 1
  fields:
    title:
      selector: td.name a
    details:
      selector: td.name a
      attribute: href
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: span.size
    date:
      selector: time
      attribute: datetime
    category:
      text: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Before Row Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Before Row Movie 2026 1080p BluRay",
      downloadUrl: "https://tracker.example/download/before",
      infoUrl: "https://tracker.example/details/before",
      size: 4_831_838_208,
      category: "2000",
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-04T00:00:00.000Z")
  })

  it("removes Cardigann HTML field descendants before extracting text", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_REMOVE_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 28,
      name: "Remove Selector HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "remove-selector-html-cardigann",
      definitionYaml: `
id: remove-selector-html-cardigann
name: Remove Selector HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: td.name a
      remove: span.badge
    details:
      selector: td.name a
      attribute: href
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: td.size
    downloadvolumefactor:
      text: "0"
    uploadvolumefactor:
      selector: td.name
      case:
        span.badge: "2"
    category:
      case:
        tr.torrent: Movies
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Clean Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Clean Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/4",
      infoUrl: "https://tracker.example/details/4",
      size: 4_000_000_000,
      category: "2000",
      downloadFactor: 0,
      uploadFactor: 2,
    })
  })

  it("matches Cardigann HTML field selectors against the current row", async () => {
    const fetchMock = vi.fn(async () => new Response(HTML_SELF_SELECTOR_RESULTS, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 29,
      name: "Self Selector HTML Cardigann",
      type: "cardigann_yaml",
      definitionKey: "self-selector-html-cardigann",
      definitionYaml: `
id: self-selector-html-cardigann
name: Self Selector HTML Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
  modes:
    search: [q]
search:
  paths:
    - path: /browse
      response:
        type: html
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: tr.torrent
      attribute: data-title
    details:
      selector: tr.torrent
      attribute: data-details
    download:
      selector: td.actions a.download
      attribute: href
    size:
      selector: td.size
    category:
      selector: tr.torrent
      attribute: data-category
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Self Match Movie", type: "general", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Self Match Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tracker.example/download/5",
      infoUrl: "https://tracker.example/details/5",
      size: 5_000_000_000,
      category: "2000",
    })
  })

  it("builds Cardigann-style POST search requests from definition paths", async () => {
    let requestUrl: string | undefined
    let requestInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestInit = init
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 10,
      name: "Cardigann POST",
      type: "cardigann_yaml",
      definitionKey: "post-cardigann",
      definitionYaml: `
id: post-cardigann
name: Post Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q, imdbid]
search:
  headers:
    Cookie: "{{ .Config.APIKey }}"
  paths:
    - path: /search
      method: post
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Post Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search")
    expect(url.search).toBe("")
    expect(requestInit?.method).toBe("POST")

    const headers = new Headers(requestInit?.headers)
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded")
    expect(headers.get("cookie")).toBe("api-key")
    const body = new URLSearchParams(String(requestInit?.body))
    expect(body.get("apikey")).toBe("api-key")
    expect(body.get("t")).toBe("movie")
    expect(body.get("q")).toBe("Post Movie")
    expect(body.get("cat")).toBe("movies")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann login requests and reuses session cookies for search", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (new URL(url).pathname === "/login") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=abc123; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 25,
      name: "Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "login-cardigann",
      definitionYaml: `
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
  - name: landing
    label: Landing cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: post
  cookies:
    - "landing={{ .Config.Landing }}"
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        landing: "preseed",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Session Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const login = requests[0]
    const search = requests[1]
    expect(new URL(login?.url ?? "").pathname).toBe("/login")
    expect(login?.init?.method).toBe("POST")
    const loginHeaders = new Headers(login?.init?.headers)
    expect(loginHeaders.get("cookie")).toBe("landing=preseed")
    const loginBody = new URLSearchParams(String(login?.init?.body))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")

    expect(new URL(search?.url ?? "").pathname).toBe("/api")
    const searchHeaders = new Headers(search?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=preseed; session=abc123")
    expect(new URL(search?.url ?? "").searchParams.get("q")).toBe("Session Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("renders Cardigann cookie-login values into search requests", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 26,
      name: "Cookie Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "cookie-login-cardigann",
      definitionYaml: `
id: cookie-login-cardigann
name: Cookie Login Cardigann
links:
  - https://tracker.example
settings:
  - name: cookie
    label: Cookie
    type: cookie
  - name: landing
    label: Landing cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  method: cookie
  cookies:
    - "landing={{ .Config.Landing }}"
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        cookie: "session=abc123; user=alice",
        landing: "preseed",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Cookie Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(requests[0]?.url ?? "").pathname).toBe("/api")
    const headers = new Headers(requests[0]?.init?.headers)
    expect(headers.get("cookie")).toBe("landing=preseed; session=abc123; user=alice")
    expect(new URL(requests[0]?.url ?? "").searchParams.get("q")).toBe("Cookie Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann oneurl login requests before search", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (new URL(url).pathname === "/login") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "oneurl=abc123; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 27,
      name: "OneUrl Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "oneurl-login-cardigann",
      definitionYaml: `
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: oneurl
  inputs:
    oneurl: "?token={{ .Config.Token }}"
    ignored: "{{ .Config.Token }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        token: "abc123",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "OneUrl Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginUrl = new URL(requests[0]?.url ?? "")
    expect(loginUrl.pathname).toBe("/login")
    expect(loginUrl.searchParams.get("token")).toBe("abc123")
    expect(loginUrl.searchParams.has("ignored")).toBe(false)
    expect(requests[0]?.init?.method).toBeUndefined()

    const searchHeaders = new Headers(requests[1]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("oneurl=abc123")
    expect(new URL(requests[1]?.url ?? "").searchParams.get("q")).toBe("OneUrl Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann form login requests before search", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/ignored">
              <input type="hidden" name="csrf" value="token123">
              <input type="text" name="username" value="landing-user">
              <input type="checkbox" name="remember" value="1" checked>
              <input type="checkbox" name="skip" value="1">
              <input name="disabled" value="nope" disabled>
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=xyz; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 28,
      name: "Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "form-login-cardigann",
      definitionYaml: `
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  submitpath: /session
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Form Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new URL(requests[0]?.url ?? "").pathname).toBe("/login")

    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(requests[1]?.init?.method).toBe("POST")
    expect(submitBody.get("csrf")).toBe("token123")
    expect(submitBody.get("username")).toBe("alice")
    expect(submitBody.get("password")).toBe("secret")
    expect(submitBody.get("remember")).toBe("1")
    expect(submitBody.has("skip")).toBe(false)
    expect(submitBody.has("disabled")).toBe(false)

    const submitHeaders = new Headers(requests[1]?.init?.headers)
    expect(submitHeaders.get("cookie")).toBe("landing=abc")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; session=xyz")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Form Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann GET method form login requests", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const parsed = new URL(url)
      if (parsed.pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/session?existing=1" method="get">
              <input type="hidden" name="csrf" value="token123">
              <input type="text" name="username" value="landing-user">
              <input type="checkbox" name="remember" value="1" checked>
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (parsed.pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=xyz; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 85,
      name: "GET Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "get-form-login-cardigann",
      definitionYaml: `
id: get-form-login-cardigann
name: GET Form Login Cardigann
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "GET Form Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitUrl = new URL(requests[1]?.url ?? "")
    expect(submitUrl.pathname).toBe("/session")
    expect(submitUrl.searchParams.get("existing")).toBe("1")
    expect(submitUrl.searchParams.get("csrf")).toBe("token123")
    expect(submitUrl.searchParams.get("username")).toBe("alice")
    expect(submitUrl.searchParams.get("password")).toBe("secret")
    expect(submitUrl.searchParams.get("remember")).toBe("1")
    expect(requests[1]?.init?.method).toBe("GET")
    expect(requests[1]?.init?.body).toBeUndefined()

    const submitHeaders = new Headers(requests[1]?.init?.headers)
    expect(submitHeaders.get("content-type")).toBeNull()
    expect(submitHeaders.get("cookie")).toBe("landing=abc")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; session=xyz")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("GET Form Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann POST form login landing requests", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/session">
              <input type="hidden" name="csrf" value="token123">
              <input type="text" name="username" value="landing-user">
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=xyz; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 87,
      name: "POST Landing Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "post-landing-form-login-cardigann",
      definitionYaml: `
id: post-landing-form-login-cardigann
name: POST Landing Form Login Cardigann
links:
  - https://tracker.example
settings:
  - name: username
    label: Username
  - name: password
    label: Password
    type: password
  - name: gate
    label: Gate
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path:
    path: /login
    method: post
    headers:
      X-Landing: "{{ .Config.Gate }}"
    inputs:
      gate: "{{ .Config.Gate }}"
      empty: ""
  method: form
  form: form#signin
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        gate: "invite-123",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "POST Landing Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new URL(requests[0]?.url ?? "").pathname).toBe("/login")
    expect(requests[0]?.init?.method).toBe("POST")
    const landingBody = new URLSearchParams(String(requests[0]?.init?.body ?? ""))
    expect(landingBody.get("gate")).toBe("invite-123")
    expect(landingBody.has("empty")).toBe(false)
    const landingHeaders = new Headers(requests[0]?.init?.headers)
    expect(landingHeaders.get("content-type")).toBe("application/x-www-form-urlencoded")
    expect(landingHeaders.get("x-landing")).toBe("invite-123")

    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(requests[1]?.init?.method).toBe("POST")
    expect(submitBody.get("csrf")).toBe("token123")
    expect(submitBody.get("username")).toBe("alice")
    expect(submitBody.get("password")).toBe("secret")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; session=xyz")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("POST Landing Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("submits Cardigann form login select and textarea defaults", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/session">
              <input type="hidden" name="csrf" value="token123">
              <select name="layout">
                <option value="compact">Compact</option>
                <option value="full" selected>Full</option>
              </select>
              <select name="fallback">
                <option value="first">First</option>
                <option value="second">Second</option>
              </select>
              <select name="ignored" disabled>
                <option value="nope" selected>Nope</option>
              </select>
              <textarea name="note">from landing page</textarea>
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "session=xyz; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 81,
      name: "Form Control Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "form-control-login-cardigann",
      definitionYaml: `
id: form-control-login-cardigann
name: Form Control Login Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  submitpath: /session
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Form Control Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(submitBody.get("csrf")).toBe("token123")
    expect(submitBody.get("layout")).toBe("full")
    expect(submitBody.get("fallback")).toBe("first")
    expect(submitBody.get("note")).toBe("from landing page")
    expect(submitBody.has("ignored")).toBe(false)
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann multipart form login requests", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/session" enctype="multipart/form-data">
              <input type="hidden" name="csrf" value="token123">
              <input type="text" name="username" value="landing-user">
              <input type="checkbox" name="remember" value="1" checked>
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "multipart=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 31,
      name: "Multipart Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "multipart-form-login-cardigann",
      definitionYaml: `
id: multipart-form-login-cardigann
name: Multipart Form Login Cardigann
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Multipart Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitHeaders = new Headers(requests[1]?.init?.headers)
    const contentType = submitHeaders.get("content-type") ?? ""
    const boundary = contentType.match(/^multipart\/form-data; boundary=(.+)$/)?.[1]
    const submitBody = String(requests[1]?.init?.body ?? "")

    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(requests[1]?.init?.method).toBe("POST")
    expect(boundary).toBeTruthy()
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="csrf"\r\n\r\ntoken123`,
    )
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="username"\r\n\r\nalice`,
    )
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="password"\r\n\r\nsecret`,
    )
    expect(submitBody).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="remember"\r\n\r\n1`,
    )
    expect(submitHeaders.get("cookie")).toBe("landing=abc")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; multipart=session")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Multipart Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("executes Cardigann form login selector inputs", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <span class="csrf">csrf-token</span>
            <input id="ticket-field" value="ticket-123">
            <form id="signin" action="/session?existing=1">
              <input id="username-field" type="text" name="user" value="landing-user">
              <input id="password-field" type="password" name="pass" value="">
            </form>
          </body></html>`,
          { status: 200 },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "selector=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 29,
      name: "Form Selector Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "form-selector-login-cardigann",
      definitionYaml: `
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
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
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Selector Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitUrl = new URL(requests[1]?.url ?? "")
    expect(submitUrl.pathname).toBe("/session")
    expect(submitUrl.searchParams.get("existing")).toBe("1")
    expect(submitUrl.searchParams.get("ticket")).toBe("ticket-123")

    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(submitBody.get("user")).toBe("alice")
    expect(submitBody.get("pass")).toBe("secret")
    expect(submitBody.get("csrf")).toBe("csrf-token")
    expect(submitBody.has("#username-field")).toBe(false)

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("selector=session")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Selector Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("resolves Cardigann form login selector controls beyond inputs", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <form id="signin" action="/session">
              <select id="mode-field" name="mode">
                <option value="compact" selected>Compact</option>
                <option value="full">Full</option>
              </select>
              <textarea id="note-field" name="note">landing note</textarea>
            </form>
          </body></html>`,
          { status: 200 },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "selector-controls=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 82,
      name: "Form Selector Control Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "form-selector-control-login-cardigann",
      definitionYaml: `
id: form-selector-control-login-cardigann
name: Form Selector Control Login Cardigann
links:
  - https://tracker.example
settings:
  - name: mode
    label: Mode
  - name: note
    label: Note
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  selectors: true
  inputs:
    "select#mode-field": "{{ .Config.Mode }}"
    "textarea#note-field": "{{ .Config.Note }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        mode: "full",
        note: "configured note",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Selector Control Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(submitBody.get("mode")).toBe("full")
    expect(submitBody.get("note")).toBe("configured note")
    expect(submitBody.has("select#mode-field")).toBe(false)
    expect(submitBody.has("textarea#note-field")).toBe(false)

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("selector-controls=session")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("submits configured Cardigann form login captcha responses", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <img class="captcha" src="/captcha.png">
            <form id="signin" action="/session">
              <input id="username-field" type="text" name="user" value="">
              <input id="password-field" type="password" name="pass" value="">
              <input id="captcha-field" type="text" name="captcha_code" value="">
            </form>
          </body></html>`,
          { status: 200 },
        )
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "captcha=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 32,
      name: "Captcha Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "captcha-form-login-cardigann",
      definitionYaml: `
id: captcha-form-login-cardigann
name: Captcha Form Login Cardigann
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  selectors: true
  inputs:
    "#username-field": "{{ .Config.Username }}"
    "#password-field": "{{ .Config.Password }}"
  captcha:
    type: image
    selector: img.captcha
    input: "#captcha-field"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        cardigannCaptcha: "human-answer",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Captcha Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const submitBody = new URLSearchParams(String(requests[1]?.init?.body ?? ""))
    expect(new URL(requests[1]?.url ?? "").pathname).toBe("/session")
    expect(submitBody.get("user")).toBe("alice")
    expect(submitBody.get("pass")).toBe("secret")
    expect(submitBody.get("captcha_code")).toBe("human-answer")

    const searchHeaders = new Headers(requests[2]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("captcha=session")
    expect(new URL(requests[2]?.url ?? "").searchParams.get("q")).toBe("Captcha Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("solves Cardigann simpleCaptcha form logins", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      const pathname = new URL(url).pathname
      if (pathname === "/login") {
        return new Response(
          `<html><body>
            <script src="/js/simpleCaptcha.js"></script>
            <form id="signin" action="/session">
              <input type="text" name="username" value="">
              <input type="password" name="password" value="">
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "landing=abc; Path=/; HttpOnly" },
          },
        )
      }
      if (pathname === "/simpleCaptcha.php") {
        return new Response(JSON.stringify({ images: [{ hash: "captcha-hash" }] }), {
          status: 200,
          headers: { "set-cookie": "captcha=seen; Path=/; HttpOnly" },
        })
      }
      if (pathname === "/session") {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "simple=session; Path=/; HttpOnly" },
        })
      }
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 33,
      name: "SimpleCaptcha Form Login Cardigann",
      type: "cardigann_yaml",
      definitionKey: "simple-captcha-form-login-cardigann",
      definitionYaml: `
id: simple-captcha-form-login-cardigann
name: SimpleCaptcha Form Login Cardigann
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: form
  form: form#signin
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Simple Captcha Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(4)
    const captchaUrl = new URL(requests[1]?.url ?? "")
    expect(captchaUrl.pathname).toBe("/simpleCaptcha.php")
    expect(captchaUrl.searchParams.get("numImages")).toBe("1")
    const captchaHeaders = new Headers(requests[1]?.init?.headers)
    expect(captchaHeaders.get("cookie")).toBe("landing=abc")
    expect(captchaHeaders.get("referer")).toBe("https://tracker.example/login")

    const submitBody = new URLSearchParams(String(requests[2]?.init?.body ?? ""))
    expect(new URL(requests[2]?.url ?? "").pathname).toBe("/session")
    expect(submitBody.get("username")).toBe("alice")
    expect(submitBody.get("password")).toBe("secret")
    expect(submitBody.get("captchaSelection")).toBe("captcha-hash")
    expect(submitBody.get("submitme")).toBe("X")
    const submitHeaders = new Headers(requests[2]?.init?.headers)
    expect(submitHeaders.get("cookie")).toBe("landing=abc; captcha=seen")

    const searchHeaders = new Headers(requests[3]?.init?.headers)
    expect(searchHeaders.get("cookie")).toBe("landing=abc; captcha=seen; simple=session")
    expect(new URL(requests[3]?.url ?? "").searchParams.get("q")).toBe("Simple Captcha Movie")
    expect(releases[0]?.title).toBe("Example Movie 2026 1080p WEB-DL")
  })

  it("fails Cardigann login when a configured error selector matches", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<html><body><div class="login-error">Bad credentials</div></body></html>', {
          status: 200,
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 30,
      name: "Login Error Cardigann",
      type: "cardigann_yaml",
      definitionKey: "login-error-cardigann",
      definitionYaml: `
id: login-error-cardigann
name: Login Error Cardigann
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
      desc: Movies
  modes:
    movie-search: [q]
login:
  path: /login
  method: post
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
  error:
    - selector: div.login-error
      message:
        selector: div.login-error
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "wrong",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const exit = await Effect.runPromiseExit(
      adapter.search({ term: "Denied Movie", type: "movie", categories: [2000] }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("expected login failure")
    const error = Option.getOrUndefined(Cause.failureOption(exit.cause))
    expect(error).toMatchObject({
      _tag: "IndexerError",
      reason: "auth_failed",
      message: "Bad credentials",
      retryable: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("fails Cardigann HTML search when login test selector is missing", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('<html><body><form id="login">Please sign in</form></body></html>', {
          status: 200,
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 32,
      name: "Login Test Cardigann",
      type: "cardigann_yaml",
      definitionKey: "login-test-cardigann",
      definitionYaml: `
id: login-test-cardigann
name: Login Test Cardigann
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
      desc: Movies
  modes:
    search: [q]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
  test:
    selector: a.logout
search:
  paths:
    - path: /browse
      response:
        type: html
      inputs:
        q: "{{ .Keywords }}"
  rows:
    selector: tr.torrent
  fields:
    title:
      selector: a.title
    download:
      selector: a.download
      attribute: href
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        cookie: "session=expired",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    const exit = await Effect.runPromiseExit(
      adapter.search({ term: "Logged Out Movie", type: "general", categories: [2000] }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("expected login test failure")
    const error = Option.getOrUndefined(Cause.failureOption(exit.cause))
    expect(error).toMatchObject({
      _tag: "IndexerError",
      reason: "auth_failed",
      message: "Cardigann login test failed: selector not found: a.logout",
      retryable: false,
    })
    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(requestInit?.headers).get("cookie")).toBe("session=expired")
  })

  it("applies Cardigann template filters to paths, raw params, and headers", async () => {
    let requestUrl: string | undefined
    let requestInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestInit = init
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 12,
      name: "Filtered Cardigann",
      type: "cardigann_yaml",
      definitionKey: "filtered-cardigann",
      definitionYaml: `
id: filtered-cardigann
name: Filtered Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q, imdbid]
search:
  paths:
    - path: /search/{{ .Keywords | trim | urlencode }}
      response:
        type: torznab
      headers:
        X-Auth: '{{ .Config.Username }}:{{ .Config.Cookie }}:{{ .Config.APIKey }}'
        X-Header-List:
          - '{{ .Keywords | trim | lowercase }}'
        X-Query-Slug: '{{ .Keywords | trim | lowercase | replace " " "-" }}'
        X-Link-Token: '{{ .Config.Link | querystring "token" }}'
        X-Html-Decoded: '{{ .Config.EncodedTitle | htmldecode }}'
        X-Html-Encoded: '{{ .Config.RawHtml | htmlencode }}'
        X-Url-Decoded: '{{ .Config.EncodedPath | urldecode }}'
        X-Url-Tail: '{{ .Config.EncodedPath | urldecode | split " " -1 }}'
      inputs:
        $raw: 'q={{ .Keywords | trim | urlencode }}&imdb={{ .Query.IMDBIDShort | prepend "tt" }}&cat={{ .Categories | join "," }}&source={{ .Config.Link | querystring "source" }}'
        decoded: '{{ .Config.EncodedTitle | htmldecode }}'
        encoded: '{{ .Config.RawHtml | htmlencode }}'
        urlDecoded: '{{ .Config.EncodedPath | urldecodecomponent }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      configValues: {
        username: "alice",
        cookie: "session=secret",
        link: "browse.php?source=web&token=abc%20123#row",
        encodedTitle: "Anne Rice&#039;s &amp; Co",
        encodedPath: "Encoded%20Name%2BPlus",
        rawHtml: `A & B <C> "D" 'E'`,
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: " Example Movie ",
        type: "movie",
        categories: [2000],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search/Example%20Movie")
    expect(url.searchParams.get("q")).toBe("Example Movie")
    expect(url.searchParams.get("imdb")).toBe("tt1234567")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(url.searchParams.get("source")).toBe("web")
    expect(url.searchParams.get("decoded")).toBe("Anne Rice's & Co")
    expect(url.searchParams.get("encoded")).toBe("A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;")
    expect(url.searchParams.get("urlDecoded")).toBe("Encoded Name+Plus")

    const headers = new Headers(requestInit?.headers)
    expect(headers.get("x-auth")).toBe("alice:session=secret:api-key")
    expect(headers.get("x-header-list")).toBe("example movie")
    expect(headers.get("x-query-slug")).toBe("example-movie")
    expect(headers.get("x-link-token")).toBe("abc 123")
    expect(headers.get("x-html-decoded")).toBe("Anne Rice's & Co")
    expect(headers.get("x-html-encoded")).toBe("A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;")
    expect(headers.get("x-url-decoded")).toBe("Encoded Name+Plus")
    expect(headers.get("x-url-tail")).toBe("Name+Plus")
  })

  it("expands Cardigann range templates for repeated category params", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 17,
      name: "Range Cardigann",
      type: "cardigann_yaml",
      definitionKey: "range-cardigann",
      definitionYaml: `
id: range-cardigann
name: Range Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
    - id: tv
      cat: TV
      desc: TV
  modes:
    search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        $raw: '{{ range .Categories }}cat={{ . }}&{{ end }}q={{ .Keywords }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Range Search", type: "general", categories: [2000, 5000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.getAll("cat")).toEqual(["movies", "tv"])
    expect(url.searchParams.get("q")).toBe("Range Search")
  })

  it("renders Cardigann base template variables", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 19,
      name: "Base Variables Cardigann",
      type: "cardigann_yaml",
      definitionKey: "base-variables-cardigann",
      definitionYaml: `
id: base-variables-cardigann
name: Base Variables Cardigann
links:
  - https://tracker.example/from-definition
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
search:
  paths:
    - path: /search/{{ .Today.Year }}
      response:
        type: torznab
      inputs:
        site: "{{ .Config.sitelink }}"
        truthy: "{{ .True }}"
        falseFallback: '{{ .False | default "fallback" }}'
        offset: "{{ .Query.Offset }}"
        extended: "{{ .Query.Extended }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Base Vars", type: "general", offset: 25, extended: "1" }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe(`/search/${new Date().getFullYear()}`)
    expect(url.searchParams.get("site")).toBe("https://tracker.example/root")
    expect(url.searchParams.get("truthy")).toBe("True")
    expect(url.searchParams.get("falseFallback")).toBe("fallback")
    expect(url.searchParams.get("offset")).toBe("25")
    expect(url.searchParams.get("extended")).toBe("1")
  })

  it("renders Cardigann conditional and function templates", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 20,
      name: "Logic Template Cardigann",
      type: "cardigann_yaml",
      definitionKey: "logic-template-cardigann",
      definitionYaml: `
id: logic-template-cardigann
name: Logic Template Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q, imdbid]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        q: '{{ if .Keywords }}{{ .Keywords }}{{ else }}empty{{ end }}'
        short: '{{ if .Query.IMDBID }}{{ .Query.IMDBIDShort }}{{ end }}'
        season: '{{ if .Query.Season }}{{ .Query.Season }}{{ end }}'
        kind: '{{ if eq .Query.Type "movie" }}film{{ else }}other{{ end }}'
        auth: '{{ if and .Config.APIKey .Query.IMDBID }}yes{{ else }}no{{ end }}'
        fallback: '{{ if or .Config.Missing .Query.TMDBID }}has-id{{ else }}none{{ end }}'
        notTv: '{{ if ne .Query.Type "tvsearch" }}yes{{ else }}no{{ end }}'
        replace: '{{ re_replace .Keywords "\\s+" "+" }}'
        cats: '{{ join .Categories "," }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: "Logic Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search")
    expect(url.searchParams.get("q")).toBe("Logic Movie")
    expect(url.searchParams.get("short")).toBe("1234567")
    expect(url.searchParams.has("season")).toBe(false)
    expect(url.searchParams.get("kind")).toBe("film")
    expect(url.searchParams.get("auth")).toBe("yes")
    expect(url.searchParams.get("fallback")).toBe("none")
    expect(url.searchParams.get("notTv")).toBe("yes")
    expect(url.searchParams.get("replace")).toBe("Logic+Movie")
    expect(url.searchParams.get("cats")).toBe("movies")
  })

  it("renders Cardigann checkbox config values as template booleans", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 21,
      name: "Checkbox Config Cardigann",
      type: "cardigann_yaml",
      definitionKey: "checkbox-config-cardigann",
      definitionYaml: `
id: checkbox-config-cardigann
name: Checkbox Config Cardigann
links:
  - https://tracker.example
settings:
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
  - name: includeDead
    label: Include dead
    type: checkbox
  - name: cookieInfo
    label: Cookie help
    type: info_cookie
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        freeleech: '{{ if .Config.freeleechOnly }}1{{ else }}0{{ end }}'
        dead: '{{ if .Config.includeDead }}1{{ else }}0{{ end }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        freeleechOnly: "true",
        includeDead: "false",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(adapter.search({ term: "Checkbox Movie", type: "movie" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("freeleech")).toBe("1")
    expect(url.searchParams.get("dead")).toBe("0")
  })

  it("uses Cardigann auth defaults when config values are omitted", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 23,
      name: "Default Auth Cardigann",
      type: "cardigann_yaml",
      definitionKey: "default-auth-cardigann",
      definitionYaml: `
id: default-auth-cardigann
name: Default Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: mode
    label: Search mode
    type: select
    default: safe
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: true
  - name: includeDead
    label: Include dead
    type: checkbox
    default: false
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        mode: "{{ .Config.Mode }}"
        freeleech: '{{ if .Config.freeleechOnly }}1{{ else }}0{{ end }}'
        dead: '{{ if .Config.includeDead }}1{{ else }}0{{ end }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(adapter.search({ term: "Default Auth Movie", type: "movie" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("mode")).toBe("safe")
    expect(url.searchParams.get("freeleech")).toBe("1")
    expect(url.searchParams.get("dead")).toBe("0")
  })

  it("lets saved Cardigann config values override auth defaults", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 24,
      name: "Saved Auth Cardigann",
      type: "cardigann_yaml",
      definitionKey: "saved-auth-cardigann",
      definitionYaml: `
id: saved-auth-cardigann
name: Saved Auth Cardigann
links:
  - https://tracker.example
settings:
  - name: mode
    label: Search mode
    type: select
    default: safe
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: true
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        mode: "{{ .Config.mode }}"
        freeleech: '{{ if .Config.FreeleechOnly }}1{{ else }}0{{ end }}'
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: {
        mode: "raw",
        freeleechOnly: "false",
      },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(adapter.search({ term: "Saved Auth Movie", type: "movie" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("mode")).toBe("raw")
    expect(url.searchParams.get("freeleech")).toBe("0")
  })

  it("narrows Cardigann Categories for each matching path", async () => {
    const requestUrls: Array<string> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrls.push(String(input))
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 16,
      name: "Path Category Cardigann",
      type: "cardigann_yaml",
      definitionKey: "path-category-cardigann",
      definitionYaml: `
id: path-category-cardigann
name: Path Category Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
    - id: tv
      cat: TV
      desc: TV
  modes:
    search: [q]
search:
  paths:
    - path: /movies
      categories: [movies]
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
    - path: /tv
      categories: [tv]
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Mixed Category Search", type: "general", categories: [2000, 5000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const requests = requestUrls
      .map((item) => new URL(item))
      .toSorted((left, right) => left.pathname.localeCompare(right.pathname))
    expect(requests.map((url) => `${url.pathname}:${url.searchParams.get("cat")}`)).toEqual([
      "/movies:movies",
      "/tv:tv",
    ])
  })

  it("uses default Cardigann categories when no request categories match", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 18,
      name: "Default Category Cardigann",
      type: "cardigann_yaml",
      definitionKey: "default-category-cardigann",
      definitionYaml: `
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
  modes:
    search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Default Category Search", type: "general", categories: [7000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("cat")).toBe("movies")
    expect(url.searchParams.get("q")).toBe("Default Category Search")
  })

  it("deduplicates multi-mapped Cardigann tracker categories in rendered requests", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 19,
      name: "Multi Category Cardigann",
      type: "cardigann_yaml",
      definitionKey: "multi-category-cardigann",
      definitionYaml: `
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
  modes:
    search: [q]
search:
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        cat: "{{ .Categories | join ',' }}"
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: "Mixed Category Search",
        type: "general",
        categories: [2000, 5000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("cat")).toBe("media")
    expect(url.searchParams.get("q")).toBe("Mixed Category Search")
  })

  it("applies Cardigann keyword filters before rendering Keywords", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 15,
      name: "Keyword Filtered Cardigann",
      type: "cardigann_yaml",
      definitionKey: "keyword-filtered-cardigann",
      definitionYaml: `
id: keyword-filtered-cardigann
name: Keyword Filtered Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  keywordsfilters:
    - name: trim
    - name: urldecodecomponent
    - name: re_replace
      args: ["\\\\s+", "+"]
    - name: split
      args: ["+", "-1"]
    - name: append
      args: "-{{ .Config.Region }}"
    - name: urlencodecomponent
  paths:
    - path: /search/{{ .Keywords }}
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
        raw: "{{ .Query.Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      configValues: { region: "AU" },
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "  Keyword%20Filter%20Movie  ", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search/Movie-AU")
    expect(url.searchParams.get("q")).toBe("Movie-AU")
    expect(url.searchParams.get("raw")).toBe("Keyword Filter Movie")
  })

  it("applies Cardigann querystring and HTML keyword filters before rendering Keywords", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 22,
      name: "Querystring Keyword Cardigann",
      type: "cardigann_yaml",
      definitionKey: "querystring-keyword-cardigann",
      definitionYaml: `
id: querystring-keyword-cardigann
name: Querystring Keyword Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  keywordsfilters:
    - name: querystring
      args: q
    - name: htmldecode
    - name: htmlencode
  paths:
    - path: /search
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
        decoded: "{{ .Keywords | htmldecode }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({
        term: "browse.php?cat=movies&q=Anne+Rice%26%23039%3Bs+Movie%202026#results",
        type: "movie",
        categories: [2000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.searchParams.get("q")).toBe("Anne Rice&#39;s Movie 2026")
    expect(url.searchParams.get("decoded")).toBe("Anne Rice's Movie 2026")
  })

  it("executes single-object Cardigann paths with scalar request inputs", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 13,
      name: "Scalar Cardigann",
      type: "cardigann_yaml",
      definitionKey: "scalar-cardigann",
      definitionYaml: `
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
    movie-search: [q]
search:
  path:
    path: /single
    categories: [1]
    response:
      type: xml
    inputs:
      t: "{{ .Query.Type }}"
      page: 1
      freeleech: true
      q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "Scalar Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/single")
    expect(url.searchParams.get("t")).toBe("movie")
    expect(url.searchParams.get("page")).toBe("1")
    expect(url.searchParams.get("freeleech")).toBe("true")
    expect(url.searchParams.get("q")).toBe("Scalar Movie")
  })

  it("skips global Cardigann inputs when a path disables inherited inputs", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(RSS_XML, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 14,
      name: "No Inherited Inputs Cardigann",
      type: "cardigann_yaml",
      definitionKey: "no-inherited-inputs-cardigann",
      definitionYaml: `
id: no-inherited-inputs-cardigann
name: No Inherited Inputs Cardigann
links:
  - https://tracker.example
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    movie-search: [q]
search:
  inputs:
    apikey: "{{ .Config.APIKey }}"
    t: "{{ .Query.Type }}"
  paths:
    - path: /search
      inheritinputs: false
      response:
        type: torznab
      inputs:
        q: "{{ .Keywords }}"
`,
      baseUrl: "https://tracker.example/root",
      apiKey: "api-key",
      priority: 15,
      categories: [],
      protocol: "torrent",
    })

    await Effect.runPromise(
      adapter.search({ term: "No Inherited Inputs Movie", type: "movie", categories: [2000] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.pathname).toBe("/search")
    expect(url.searchParams.get("q")).toBe("No Inherited Inputs Movie")
    expect(url.searchParams.has("apikey")).toBe(false)
    expect(url.searchParams.has("t")).toBe(false)
  })

  it("fails when the configured definition key is unknown", async () => {
    const adapter = createCardigannYamlAdapter({
      id: 9,
      name: "Missing Definition",
      type: "cardigann_yaml",
      definitionKey: "missing-definition",
      baseUrl: "https://tracker.example",
      apiKey: "api-key",
      priority: 50,
      categories: [],
      protocol: "torrent",
    })

    const error = await Effect.runPromise(Effect.flip(adapter.search({ term: "x", type: "movie" })))

    expect(error).toBeInstanceOf(IndexerError)
    expect(error.reason).toBe("invalid_response")
    expect(error.message).toContain("unknown Cardigann definition")
  })
})
