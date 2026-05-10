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

const SHIZA_PROJECT_JSON_RESULTS = JSON.stringify({
  data: {
    releases: {
      edges: [
        {
          node: {
            name: "Shiza Show",
            type: "TV",
            originalName: "Shiza Original",
            alternativeNames: ["Shiza Alias"],
            publishedAt: "2026-05-09T08:00:00.000Z",
            slug: "shiza-show",
            torrents: [
              {
                synopsis: "Episode 01",
                downloaded: 13,
                seeders: 22,
                leechers: 5,
                size: 1_700_000_000,
                magnetUri: "magnet:?xt=urn:btih:shizashow01",
                updatedAt: "2026-05-09T09:00:00.000Z",
                file: {
                  url: "/downloads/shiza-show-01.torrent",
                },
                videoQualities: ["RESOLUTION_1080"],
              },
            ],
          },
        },
      ],
    },
  },
})

const SCENEHD_JSON_RESULTS = JSON.stringify([
  {
    id: 7001,
    name: "SceneHD Movie 2026 1080p WEB-DL",
    category: "1",
    added: "2026-05-09 11:22:33",
    size: 6_543_210_000,
    times_completed: 18,
    numfiles: 3,
    seeders: 31,
    leechers: 4,
    imdbid: "tt1234567",
    is_freeleech: 1,
  },
])

const TORRENT_SYNDIKAT_JSON_RESULTS = JSON.stringify({
  rows: [
    {
      id: "8001",
      name: "TorrentSyndikat Movie 2026 1080p WEB-DL",
      category: 9,
      added: 1_778_330_096,
      size: 7_654_321_000,
      numfiles: 6,
      seeders: 42,
      leechers: 5,
      snatched: 23,
      imdbId: 1234567,
    },
  ],
})

const KNABEN_JSON_RESULTS = JSON.stringify({
  hits: [
    {
      title: 'Ubuntu "ISO" 24.04 1080p',
      categoryId: [3001000],
      hash: "1234512345123451234512345123451234512345",
      details: "https://knaben.org/details/ubuntu-iso",
      link: "",
      magnetUrl: "magnet:?xt=urn:btih:1234512345123451234512345123451234512345",
      bytes: 4_200_000_000,
      seeders: 7,
      peers: 2,
      date: "2026-05-09T10:00:00+00:00",
    },
  ],
})

const TORRENT_DAY_JSON_RESULTS = JSON.stringify([
  {
    name: "Example Movie 2026 1080p WEB-DL",
    t: 12345,
    c: 11,
    size: 2_500_000_000,
    files: 4,
    completed: 12,
    seeders: 24,
    leechers: 6,
    "imdb-id": "tt1234567",
    "download-multiplier": 0,
    ctime: 1_778_320_800,
  },
])

const ANIME_TORRENTS_HTML_RESULTS = `
<html><body>
  <table>
    <tbody>
      <tr>
        <th>Category</th><th>Name</th><th>Download</th><th>Info</th>
        <th>Added</th><th>Size</th><th>Uploader</th><th>Peers</th>
      </tr>
      <tr>
        <td><a href="/torrents.php?cat=6">Anime Movie HD</a></td>
        <td>
          <a href="/torrents.php?id=161">AnimeTorrents Movie 2026 1080p WEB-DL</a>
          <a class="tortags" href="tags.php?tag=dual-audio">Dual Audio</a>
          <img alt="Gold Torrent" src="/gold.png">
          <img alt="2x Multiplier Torrent" src="/two-x.png">
        </td>
        <td><a href="/download.php?id=161">Download</a></td>
        <td>Info</td>
        <td>09 May 26</td>
        <td>1.5 GB</td>
        <td>Uploader</td>
        <td>18 / 2 / 5</td>
      </tr>
      <tr>
        <td><a href="/torrents.php?cat=7">Anime Series HD</a></td>
        <td>
          <a href="/torrents.php?id=162">AnimeTorrents Series 2026 1080p</a>
          <img alt="Silver Torrent" src="/silver.png">
        </td>
        <td><a href="/download.php?id=162">Download</a></td>
        <td>Info</td>
        <td>09 May 26</td>
        <td>2.4 GB</td>
        <td>Uploader</td>
        <td>7 / 1 / 3</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const BAKABT_LOGIN_HTML = `
<html><body>
  <form id="loginForm" action="/login.php" method="post">
    <input type="hidden" name="loginKey" value="baka-login-key">
    <input type="text" name="username">
    <input type="password" name="password">
    <input type="hidden" name="returnto" value="/index.php">
  </form>
</body></html>`

const BAKABT_HTML_RESULTS = `
<html><body>
  <table class="torrents">
    <tbody>
      <tr class="torrent">
        <td class="category"><span title="Anime Movie">Movie</span></td>
        <td>
          <a class="title" href="/torrent/501/bakabt-movie">Romaji Movie | BakaBT Movie (2026) [1080p]</a>
          <span class="tags">Dual Audio</span>
          <span class="freeleech">Freeleech</span>
        </td>
        <td class="size">1.2 GB</td>
        <td class="added">09 May '26</td>
        <td class="peers">12 / <a href="/download.php?id=501">8</a> / <a href="/peers.php?id=501">4</a></td>
      </tr>
      <tr class="torrent_alt">
        <td class="category"><span title="Anime Series">Series</span></td>
        <td>
          <a class="title" href="/torrent/502/bakabt-series">BakaBT Series [720p]</a>
        </td>
        <td class="size">700 MB</td>
        <td class="added">09 May '26</td>
        <td class="peers">2 / <a href="/download.php?id=502">1</a> / <a href="/peers.php?id=502">1</a></td>
      </tr>
    </tbody>
  </table>
</body></html>`

const NEBULANCE_JSON_RESULTS = JSON.stringify({
  jsonrpc: "2.0",
  result: {
    items: [
      {
        rls_name: "Nebulance.Show.S01E01.1080p.WEB-DL",
        cat: "episode",
        size: "1500000000",
        seed: "12",
        leech: "3",
        snatch: "9",
        download: "/download.php?id=77",
        file_list: ["Nebulance.Show.S01E01.mkv"],
        group_name: "Nebulance Show",
        group_id: "77",
        series_id: "12345",
        rls_utc: "2026-05-09T10:00:00Z",
        tags: ["scene"],
      },
    ],
  },
  id: 1,
})

const BROADCASTHE_NET_JSON_RESULTS = JSON.stringify({
  jsonrpc: "2.0",
  result: {
    results: 2,
    torrents: {
      "8801": {
        GroupID: 88,
        TorrentID: 8801,
        SeriesID: 123,
        Series: "BroadcasTheNet Show",
        Category: "Episode",
        Snatched: 44,
        Seeders: 62,
        Leechers: 5,
        Source: "WEB",
        Container: "MKV",
        Codec: "H.264",
        Resolution: "1080p",
        Origin: "Internal",
        ReleaseName: "BroadcasTheNet.Show.S01E02.1080p.WEB.H264-BTN",
        Size: 2_345_678_900,
        Time: Date.parse("2026-05-10T10:30:00.000Z") / 1000,
        TvdbID: 12345,
        TvrageID: null,
        ImdbID: "7654321",
        InfoHash: "ABCDEF1234567890",
        DownloadURL: "https://broadcasthe.net/torrents.php?action=download&id=8801",
      },
      "8802": {
        GroupID: 89,
        TorrentID: 8802,
        SeriesID: 123,
        Series: "BroadcasTheNet Show",
        Category: "Season",
        Snatched: 18,
        Seeders: 28,
        Leechers: 2,
        Source: "Blu-ray",
        Container: "MKV",
        Codec: "HEVC",
        Resolution: "2160p",
        Origin: "Scene",
        ReleaseName: "BroadcasTheNet.Show.S01.2160p.BluRay.HEVC-BTN",
        Size: 22_345_678_900,
        Time: Date.parse("2026-05-09T06:15:00.000Z") / 1000,
        TvdbID: 12345,
        TvrageID: null,
        ImdbID: "7654321",
        InfoHash: "1234567890ABCDEF",
        DownloadURL: "https://broadcasthe.net/torrents.php?action=download&id=8802",
      },
    },
  },
  id: 1,
})

const IPTORRENTS_HTML_RESULTS = `
<html><body>
  <table id="torrents">
    <thead><tr>
      <th>Category</th><th>Name</th><th>Comments</th><th>Uploader</th><th>Age</th>
      <th>Sort by size</th><th>Sort by files</th><th>Sort by snatches</th><th>Sort by seeders</th><th>Sort by leechers</th>
    </tr></thead>
    <tbody>
      <tr>
        <td><a href="?48">Movie/HD/Bluray</a></td>
        <td>
          <a class="hv" href="/details.php?id=765">IPT Movie 2026 1080p BluRay</a>
          <a href="/download.php/765/IPT.Movie.2026.torrent">Download</a>
          <div class="sub">Internal | 2 hours ago by uploader</div>
          <span class="free">Free</span>
        </td>
        <td>0</td><td>uploader</td><td>2 hours ago</td><td>1.5 GB</td><td>3</td><td>10</td><td>44</td><td>5</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const BITHDTV_HTML_RESULTS = `
<html><body>
  <table align="center"><tbody><tr><td>Menu</td></tr></tbody></table>
  <br>
  <table>
    <tbody>
      <tr><th></th><th>Category</th><th>Name</th><th>Files</th><th>Comments</th><th>Added</th><th>Size</th><th>Snatched</th><th>Seeders</th><th>Leechers</th></tr>
      <tr bgcolor="#CCFF99">
        <td></td>
        <td><a href="torrents.php?cat=7">Movies</a></td>
        <td>
          <a href="details.php?id=222" title="BitHDTV Movie 2026 1080p BluRay">BitHDTV Movie</a>
          <a href="download.php?id=222">Download</a>
        </td>
        <td>4</td>
        <td>0</td>
        <td>2026-05-1012:34:56</td>
        <td>3.5 GB</td>
        <td>9</td>
        <td>27</td>
        <td>2</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const TORRENT_BYTES_HTML_RESULTS = `
<html><body>
  <table>
    <tbody>
      <tr>
        <td class="colhead">Type</td><td class="colhead">Name</td><td class="colhead">Files</td><td class="colhead">Comments</td><td class="colhead">Added</td><td class="colhead">Uploader</td><td class="colhead">Size</td><td class="colhead">Snatched</td><td class="colhead">Seeders</td><td class="colhead">Leechers</td>
      </tr>
      <tr>
        <td><a href="browse.php?cat=5">Movies/HD</a></td>
        <td>
          <a href="download.php/333/TorrentBytes.Movie.2026.torrent">Download</a>
          <a href="details.php?id=333" title="TorrentBytes Movie 2026 1080p WEB-DL">TorrentBytes Movie</a>
          <font color="green">F L</font>
        </td>
        <td>6</td>
        <td>0</td>
        <td>2026-05-1013:45:56</td>
        <td>uploader</td>
        <td>4.2 GB</td>
        <td>12</td>
        <td>31</td>
        <td>4</td>
      </tr>
      <tr>
        <td><a href="browse.php?cat=46">NonScene/x264</a></td>
        <td>
          <a href="download.php/334/TorrentBytes.Fallback.2026.torrent">Download</a>
          <a href="details.php?id=334">TorrentBytes Fallback 2026 720p</a>
        </td>
        <td>3</td>
        <td>0</td>
        <td>2026-05-1014:00:00</td>
        <td>uploader</td>
        <td>2.1 GB</td>
        <td>5</td>
        <td>14</td>
        <td>1</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const SCENETIME_HTML_RESULTS = `
<html><body>
  <table class="movehere">
    <tbody>
      <tr>
        <td class="cat_Head">Type</td><td class="cat_Head">Name</td><td class="cat_Head">Size</td><td class="cat_Head">Seeders</td><td class="cat_Head">Leechers</td>
      </tr>
      <tr class="browse">
        <td><a href="browse.php?cat=59">Movies HD</a></td>
        <td>
          <a href="details.php?id=555">SceneTime Movie <font color="green">Freeleech</font></a>
          <span class="elapsedDate" title="Sunday, May 10, 2026 at 1:23PM">2 hours ago</span>
          <font><b>Freeleech</b></font>
        </td>
        <td>6.6 GB</td>
        <td>55</td>
        <td>8</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const HD_SPACE_LOGIN_HTML = `
<html><body>
  <form action="index.php?page=login" method="post">
    <input type="hidden" name="returnto" value="index.php">
    <input type="text" name="uid" value="">
    <input type="password" name="pwd" value="">
  </form>
</body></html>`

const HD_SPACE_HTML_RESULTS = `
<html><body>
  <div id="bodyarea">
    <table class="lista">
      <tbody>
        <tr><td class="header" colspan="10">Results</td></tr>
        <tr>
          <td><a href="index.php?page=torrents&amp;category=19">Movie / 1080p</a></td>
          <td>
            <a href="index.php?page=torrent-details&amp;id=777">HD-Space Movie 2026 1080p BluRay</a>
            <span style="color: #000000 ">Genres&nbsp;Action, Drama</span>
            <img title="FreeLeech" src="images/free.png">
          </td>
          <td>Comments</td>
          <td><a href="download.php?id=777&amp;f=HD-Space.Movie.2026.1080p.torrent">Download</a></td>
          <td>May 10, 2026, 13:45:09</td>
          <td>7.7 GB</td>
          <td>Uploader</td>
          <td>77</td>
          <td>9</td>
          <td>15</td>
        </tr>
        <tr>
          <td><a href="index.php?page=torrents&amp;category=18">Movie / 720p</a></td>
          <td>
            <a href="index.php?page=torrent-details&amp;id=778">HD-Space Half Free 2026 720p</a>
            <img title="Half FreeLeech" src="images/half.png">
          </td>
          <td>Comments</td>
          <td><a href="download.php?id=778&amp;f=HD-Space.Half.Free.2026.720p.torrent">Download</a></td>
          <td>May 10, 2026, 14:00:00</td>
          <td>3.3 GB</td>
          <td>Uploader</td>
          <td>22</td>
          <td>4</td>
          <td>3</td>
        </tr>
      </tbody>
    </table>
  </div>
</body></html>`

const SPEEDCD_HTML_RESULTS = `
<html><body>
  <div class="boxContent">
    <table>
      <tbody>
        <tr>
          <td><a href="/browse/43">Movies/HD</a></td>
          <td>
            <div>
              <a href="/t/888/speedcd-movie-2026">[REQ] SpeedCD Movie 2026 1080p WEB-DL</a>
              <span class="elapsedDate" title="Sunday, May 10, 2026 2:45PM">2 hours ago</span>
              <span>[Freeleech]</span>
            </div>
          </td>
          <td>Comments</td>
          <td><a href="/download/888/SpeedCD.Movie.2026.torrent">Download</a></td>
          <td>Uploader</td>
          <td>8.8 GB</td>
          <td>12</td>
          <td>88</td>
          <td>11</td>
        </tr>
      </tbody>
    </table>
  </div>
</body></html>`

const HD_TORRENTS_HTML_RESULTS = `
<html><body>
  <table class="mainblockcontenttt">
    <tbody>
      <tr>
        <td class="mainblockcontent">Type</td>
        <td class="mainblockcontent">Comments</td>
        <td class="mainblockcontent">Name</td>
        <td class="mainblockcontent">Uploader</td>
        <td class="mainblockcontent">Download</td>
        <td class="mainblockcontent">Files</td>
        <td class="mainblockcontent">Added</td>
        <td class="mainblockcontent">Size</td>
        <td class="mainblockcontent">Seeders</td>
        <td class="mainblockcontent">Leechers</td>
        <td class="mainblockcontent">Grabs</td>
      </tr>
      <tr>
        <td class="mainblockcontent"><a href="torrents.php?category=70">Movie/UHD/Blu-Ray</a></td>
        <td class="mainblockcontent">5</td>
        <td class="mainblockcontent">
          <a href="details.php?id=999" onmouseover="return overlib('src=\\'./posters/999.jpg\\'')">HD-Torrents Movie 2026 UHD BluRay</a>
          <span>High bitrate encode</span>
          <img src="/pic/free.png" alt="Free">
          <img src="/pic/internal.png" alt="Internal">
        </td>
        <td class="mainblockcontent">Uploader</td>
        <td class="mainblockcontent"><a href="download.php?id=999">Download</a></td>
        <td class="mainblockcontent">42</td>
        <td class="mainblockcontent"><span title="10 May 2026 15:30:00">2 hours ago</span></td>
        <td class="mainblockcontent">12.5 GB</td>
        <td class="mainblockcontent">99</td>
        <td class="mainblockcontent">12</td>
        <td class="mainblockcontent">34</td>
      </tr>
      <tr>
        <td class="mainblockcontent"><a href="torrents.php?category=64">Movie/2160p</a></td>
        <td class="mainblockcontent">0</td>
        <td class="mainblockcontent"><a href="details.php?id=1000">HD-Torrents Movie 2026 2160p Quarter</a></td>
        <td class="mainblockcontent">Uploader</td>
        <td class="mainblockcontent"><a href="download.php?id=1000">Download</a></td>
        <td class="mainblockcontent">18</td>
        <td class="mainblockcontent"><span title="10 May 2026 16:00:00">1 hour ago</span></td>
        <td class="mainblockcontent">8.4 GB</td>
        <td class="mainblockcontent">44</td>
        <td class="mainblockcontent">3</td>
        <td class="mainblockcontent">9</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const FUNFILE_HTML_RESULTS = `
<html><body>
  <table class="mainframe">
    <tbody>
      <tr>
        <td>
          <table cellpadding="2">
            <tbody>
              <tr>
                <td class="row3"><a href="browse.php?cat=19">Movies</a></td>
                <td class="row3"><a href="details.php?id=111&amp;hit=1" title="FunFile Movie 2026 1080p WEB-DL">FunFile Movie</a></td>
                <td class="row3"><a href="download.php?id=111">Download</a></td>
                <td class="row3">12</td>
                <td class="row3">3</td>
                <td class="row3">2 hours ago</td>
                <td class="row3">Uploader</td>
                <td class="row3">4.2 GB</td>
                <td class="row3">8</td>
                <td class="row3">21</td>
                <td class="row3">2</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</body></html>`

const IMMORTAL_SEED_HTML_RESULTS = `
<html><body>
  <table id="sortabletable">
    <tbody>
      <tr>
        <td><a href="browse.php?category=16">Movies-HD</a></td>
        <td>
          <div>
            <a href="details.php?id=121">ImmortalSeed Movie 2026 1080p WEB-DL</a>
            <a href="download.php?id=121">Download</a>
            <img title="Free Torrent" src="/pic/free.png">
            <img title="x2 Torrent" src="/pic/x2.png">
          </div>
          <div>2026-05-10 17:45:00</div>
        </td>
        <td>Uploader</td>
        <td>Comments</td>
        <td>5.5 GB</td>
        <td>13</td>
        <td>55</td>
        <td>6</td>
      </tr>
      <tr>
        <td><a href="browse.php?category=59">Movies-4k</a></td>
        <td>
          <div>
            <a href="details.php?id=122">ImmortalSeed Movie 2026 2160p Silver</a>
            <a href="download.php?id=122">Download</a>
            <img title="Silver Torrent" src="/pic/silver.png">
          </div>
          <div>2026-05-10 18:15:00</div>
        </td>
        <td>Uploader</td>
        <td>Comments</td>
        <td>12 GB</td>
        <td>4</td>
        <td>20</td>
        <td>2</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const XSPEEDS_HTML_RESULTS = `
<html><body>
  <table id="sortabletable">
    <tbody>
      <tr>
        <td><a href="browse.php?category=10">DVDR</a></td>
        <td>
          <div>
            <a href="details.php?id=131">XSpeeds Movie 2026 DVDR</a>
            <a href="download.php?id=131">Download</a>
            <img title="Free Torrent" src="/pic/free.png">
            <img title="x2 Torrent" src="/pic/x2.png">
          </div>
          <div>10-05-2026 19:05</div>
        </td>
        <td>Uploader</td>
        <td>Comments</td>
        <td>4.7 GB</td>
        <td>15</td>
        <td>64</td>
        <td>8</td>
      </tr>
      <tr>
        <td><a href="browse.php?category=117">Movies 4K</a></td>
        <td>
          <div>
            <a href="details.php?id=132">XSpeeds Movie 2026 2160p Silver</a>
            <a href="download.php?id=132">Download</a>
            <img title="Silver Torrent" src="/pic/silver.png">
          </div>
          <div>10-05-2026 20:30</div>
        </td>
        <td>Uploader</td>
        <td>Comments</td>
        <td>14 GB</td>
        <td>3</td>
        <td>31</td>
        <td>4</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const XTHOR_JSON_RESULTS = JSON.stringify({
  error: { code: 0, descr: "OK" },
  torrents: [
    {
      id: 9001,
      category: 4,
      seeders: 72,
      leechers: 9,
      name: "Xthor Movie 2026 1080p x264",
      times_completed: 31,
      size: 8_123_456_000,
      added: 1_778_330_096,
      freeleech: 1,
      numfiles: 7,
      download_link: "https://api.xthor.tk/download.php?id=9001&passkey=xthor-passkey",
      tmdb_id: 12345,
    },
  ],
})

const HDBITS_JSON_RESULTS = JSON.stringify({
  status: 0,
  data: [
    {
      id: "1001",
      hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      leechers: 6,
      seeders: 52,
      name: "HDBits Movie 2026 1080p WEB-DL",
      times_completed: 42,
      size: 9_123_456_000,
      utadded: 1_778_330_096,
      numfiles: 8,
      freeleech: "yes",
      type_category: 1,
      type_medium: 3,
      type_origin: 1,
      type_exclusive: 0,
      imdb: {
        id: 1234567,
        year: 2026,
      },
    },
    {
      id: "1002",
      hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      leechers: 3,
      seeders: 12,
      name: "HDBits Movie 2026 720p Encode",
      times_completed: 7,
      size: 4_123_456_000,
      utadded: 1_778_333_600,
      numfiles: 5,
      freeleech: "no",
      type_category: 1,
      type_medium: 3,
      type_origin: 0,
      type_exclusive: 0,
    },
  ],
})

const PIXELHD_HTML_RESULTS = `
<html><body>
  <table>
    <tbody>
      <tr class="group_torrent">
        <td><a href="torrents.php?id=321">PiXELHD Movie 2026 1080p MP4</a></td>
        <td>Format</td>
        <td><span class="time" title="May 10 2026, 19:05">10 minutes ago</span></td>
        <td>3.5 GB</td>
        <td>Uploader</td>
        <td>18</td>
        <td>44</td>
        <td>5</td>
        <td><a href="torrents.php?action=download&id=321">Download</a></td>
      </tr>
    </tbody>
  </table>
</body></html>`

const SECRET_CINEMA_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        groupId: "555",
        groupName: "Secret Cinema Movie",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 777,
            media: "WEB-DL",
            remasterTitle: "Director's Cut",
            time: "2026-05-10T08:20:00.000Z",
            size: "6123456000",
            fileCount: 4,
            snatches: 13,
            seeders: "38",
            leechers: "2",
            category: "Movies",
            isFreeLeech: true,
            isNeutralLeech: false,
            isPersonalFreeLeech: false,
          },
        ],
      },
      {
        groupId: "556",
        groupName: "Secret Cinema Album",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 778,
            media: "FLAC",
            time: "2026-05-09T06:45:00.000Z",
            size: "712345600",
            fileCount: 11,
            snatches: 5,
            seeders: "9",
            leechers: "1",
            category: "Music",
            isFreeLeech: false,
            isNeutralLeech: true,
            isPersonalFreeLeech: false,
          },
        ],
      },
    ],
  },
})

const FILELIST_JSON_RESULTS = JSON.stringify([
  {
    id: 444,
    name: "FileList Movie 2026 1080p BluRay",
    size: 7_123_456_000,
    leechers: 4,
    seeders: 61,
    times_completed: 20,
    files: 9,
    imdb: "tt7654321",
    internal: true,
    freeleech: true,
    doubleup: true,
    upload_date: "2026-05-10 17:30:00",
    category: "Filme HD",
    small_description: "Action, Thriller",
  },
  {
    id: 445,
    name: "FileList TV 2026 S01E01 720p",
    size: 1_123_456_000,
    leechers: 2,
    seeders: 14,
    times_completed: 5,
    files: 1,
    imdb: "tt7654322",
    internal: false,
    freeleech: false,
    doubleup: false,
    upload_date: "2026-05-09 11:15:00",
    category: "Seriale HD",
    small_description: "Drama",
  },
])

const ALPHA_RATIO_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        artist: "Alpha",
        groupId: "901",
        groupName: "AlphaRatio Movie",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9011,
            format: "H.264",
            encoding: "1080p",
            media: "WEB",
            hasCue: false,
            time: "2026-05-10T09:10:00.000Z",
            size: "8123456000",
            fileCount: 6,
            snatches: 22,
            seeders: "71",
            leechers: "3",
            category: "MovieHD",
            isFreeLeech: false,
            isNeutralLeech: false,
            isPersonalFreeLeech: false,
            canUseToken: true,
          },
        ],
      },
      {
        groupId: "902",
        groupName: "AlphaRatio Series",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9012,
            format: "H.265",
            encoding: "2160p",
            media: "WEB",
            hasCue: true,
            time: "2026-05-09T11:30:00.000Z",
            size: "2123456000",
            fileCount: 2,
            snatches: 9,
            seeders: "24",
            leechers: "1",
            category: "TvUHD",
            isFreeLeech: true,
            isNeutralLeech: true,
            isPersonalFreeLeech: false,
            canUseToken: false,
          },
        ],
      },
    ],
  },
})

const BROKENSTONES_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        groupId: "991",
        groupName: "BrokenStones Audio Pack",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9911,
            format: "FLAC",
            encoding: "Lossless",
            media: "WEB",
            hasCue: true,
            time: "2026-05-10T10:40:00.000Z",
            size: "912345600",
            fileCount: 14,
            snatches: 8,
            seeders: "19",
            leechers: "1",
            category: "Audio",
            isFreeLeech: true,
            isNeutralLeech: false,
            isPersonalFreeLeech: false,
          },
        ],
      },
      {
        groupId: "992",
        groupName: "BrokenStones Mac App",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9912,
            format: "DMG",
            encoding: "Universal",
            media: "WEB",
            hasCue: false,
            time: "2026-05-09T12:05:00.000Z",
            size: "1512345600",
            fileCount: 1,
            snatches: 6,
            seeders: "11",
            leechers: "2",
            category: "MacOS Apps",
            isFreeLeech: false,
            isNeutralLeech: true,
            isPersonalFreeLeech: false,
          },
        ],
      },
    ],
  },
})

const CGPEERS_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        groupId: "981",
        groupName: "CGPeers Full App",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9811,
            format: "ISO",
            encoding: "x64",
            media: "WEB",
            hasCue: false,
            time: "2026-05-10T11:20:00.000Z",
            size: "4312345600",
            fileCount: 9,
            snatches: 18,
            seeders: "33",
            leechers: "4",
            category: "Full Applications",
            isFreeLeech: false,
            isNeutralLeech: false,
            isPersonalFreeLeech: false,
          },
        ],
      },
      {
        groupId: "982",
        groupName: "CGPeers Tutorial Pack",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9812,
            format: "MP4",
            encoding: "1080p",
            media: "WEB",
            hasCue: false,
            time: "2026-05-09T13:15:00.000Z",
            size: "2312345600",
            fileCount: 24,
            snatches: 11,
            seeders: "21",
            leechers: "2",
            category: "Tutorials",
            isFreeLeech: true,
            isNeutralLeech: true,
            isPersonalFreeLeech: false,
          },
        ],
      },
    ],
  },
})

const DICMUSIC_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        artist: "DIC Artist",
        groupId: "971",
        groupName: "DICMusic Album",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9711,
            format: "FLAC",
            encoding: "Lossless",
            media: "WEB",
            hasCue: true,
            time: "2026-05-10T12:30:00.000Z",
            size: "712345600",
            fileCount: 12,
            snatches: 28,
            seeders: "43",
            leechers: "5",
            category: "Music",
            isFreeLeech: true,
            isNeutralLeech: false,
            isPersonalFreeLeech: false,
          },
        ],
      },
      {
        groupId: "972",
        groupName: "DICMusic Audio App",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9712,
            format: "DMG",
            encoding: "Universal",
            media: "WEB",
            hasCue: false,
            time: "2026-05-09T15:20:00.000Z",
            size: "612345600",
            fileCount: 1,
            snatches: 7,
            seeders: "14",
            leechers: "1",
            category: "Applications",
            isFreeLeech: false,
            isNeutralLeech: true,
            isPersonalFreeLeech: false,
          },
        ],
      },
    ],
  },
})

const GREAT_POSTER_WALL_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        groupId: "961",
        groupName: "GreatPosterWall Movie",
        groupYear: "2026",
        cover: "https://greatposterwall.com/posters/961.jpg",
        imdbId: "tt1234567",
        torrents: [
          {
            torrentId: 9611,
            fileName: "GreatPosterWall Movie 2026 1080p BluRay FLAC x264-GPW",
            time: "2026-05-10T20:30:00",
            size: 9_123_456_000,
            fileCount: 4,
            snatches: 32,
            seeders: 55,
            leechers: 6,
            resolution: "1080p",
            isFreeleech: false,
            isNeutralLeech: false,
            isPersonalFreeleech: false,
            freeType: "12",
            canUseToken: true,
          },
        ],
      },
      {
        groupId: "962",
        groupName: "GreatPosterWall UHD Movie",
        groupYear: "2026",
        cover: "https://greatposterwall.com/posters/962.jpg",
        imdbId: "tt7654321",
        torrents: [
          {
            torrentId: 9612,
            fileName: "GreatPosterWall UHD Movie 2026 2160p WEB-DL HEVC-GPW",
            time: "2026-05-09T18:15:00",
            size: 18_123_456_000,
            fileCount: 8,
            snatches: 12,
            seeders: 24,
            leechers: 2,
            resolution: "2160p",
            isFreeleech: true,
            isNeutralLeech: true,
            isPersonalFreeleech: false,
            freeType: "2",
            canUseToken: false,
          },
        ],
      },
    ],
  },
})

const ORPHEUS_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        artist: "OPS Artist",
        groupId: "941",
        groupName: "Orpheus Album",
        groupYear: "2026",
        releaseType: "Album",
        torrents: [
          {
            torrentId: 9411,
            format: "FLAC",
            encoding: "Lossless",
            media: "WEB",
            hasLog: true,
            logScore: 95,
            hasCue: false,
            time: "2026-05-10T10:15:00.000Z",
            size: "912345600",
            fileCount: 11,
            snatches: 31,
            seeders: "49",
            leechers: "4",
            category: "Music",
            isFreeLeech: false,
            isNeutralLeech: false,
            isPersonalFreeLeech: false,
            canUseToken: true,
          },
        ],
      },
      {
        groupId: "942",
        groupName: "Orpheus Audiobook",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9412,
            format: "MP3",
            encoding: "V0",
            media: "WEB",
            hasLog: false,
            hasCue: false,
            time: "2026-05-09T06:30:00.000Z",
            size: "223456000",
            fileCount: 6,
            snatches: 14,
            seeders: "18",
            leechers: "2",
            category: "Audiobooks",
            isFreeLeech: true,
            isNeutralLeech: true,
            isPersonalFreeLeech: false,
            canUseToken: false,
          },
        ],
      },
    ],
  },
})

const PASS_THE_POPCORN_JSON_RESULTS = JSON.stringify({
  TotalResults: "2",
  Page: "1",
  Movies: [
    {
      GroupId: "3001",
      CategoryId: "1",
      Title: "PassThePopcorn Feature",
      Year: "2026",
      Cover: "https://passthepopcorn.me/posters/3001.jpg",
      Tags: ["drama", "thriller"],
      ImdbId: "1234567",
      Torrents: [
        {
          Id: 30011,
          Quality: "High Definition",
          Source: "Blu-ray",
          Container: "MKV",
          Codec: "H.264",
          Resolution: "1080p",
          Scene: false,
          Size: "12345678900",
          UploadTime: "2026-05-10 11:25:00",
          RemasterTitle: "",
          Snatched: "77",
          Seeders: "88",
          Leechers: "7",
          ReleaseName: "PassThePopcorn.Feature.2026.1080p.BluRay.x264-PTP",
          Checked: true,
          GoldenPopcorn: true,
          FreeleechType: "Neutral Leech",
        },
      ],
    },
    {
      GroupId: "3002",
      CategoryId: "6",
      Title: "PassThePopcorn Collection",
      Year: "2026",
      Cover: "https://passthepopcorn.me/posters/3002.jpg",
      Tags: ["collection"],
      ImdbId: "",
      Torrents: [
        {
          Id: 30012,
          Quality: "Ultra High Definition",
          Source: "WEB",
          Container: "MKV",
          Codec: "H.265",
          Resolution: "2160p",
          Scene: true,
          Size: "22345678900",
          UploadTime: "2026-05-09 08:10:00",
          RemasterTitle: "",
          Snatched: "29",
          Seeders: "45",
          Leechers: "4",
          ReleaseName: "PassThePopcorn.Collection.2026.2160p.WEB-DL.HEVC-PTP",
          Checked: false,
          GoldenPopcorn: false,
          FreeleechType: "Half Leech",
        },
      ],
    },
  ],
})

const REDACTED_JSON_RESULTS = JSON.stringify({
  status: "success",
  response: {
    results: [
      {
        artist: "Red Artist",
        groupId: "951",
        groupName: "Redacted Album",
        groupYear: "2026",
        releaseType: "Album",
        torrents: [
          {
            torrentId: 9511,
            remasterTitle: "Deluxe Edition",
            remasterYear: "2026",
            format: "FLAC",
            encoding: "Lossless",
            media: "WEB",
            hasLog: true,
            logScore: 100,
            hasCue: true,
            time: "2026-05-10T09:45:00.000Z",
            size: "812345600",
            fileCount: 10,
            snatches: 24,
            seeders: "52",
            leechers: "3",
            category: "Music",
            isFreeLeech: false,
            isNeutralLeech: false,
            isFreeload: true,
            isPersonalFreeLeech: false,
            canUseToken: true,
          },
        ],
      },
      {
        groupId: "952",
        groupName: "Redacted EBook",
        groupYear: "2026",
        torrents: [
          {
            torrentId: 9512,
            format: "PDF",
            encoding: "Retail",
            media: "WEB",
            hasLog: false,
            hasCue: false,
            time: "2026-05-09T08:10:00.000Z",
            size: "12345600",
            fileCount: 1,
            snatches: 9,
            seeders: "15",
            leechers: "1",
            category: "E-Books",
            isFreeLeech: true,
            isNeutralLeech: true,
            isFreeload: false,
            isPersonalFreeLeech: false,
            canUseToken: false,
          },
        ],
      },
    ],
  },
})

const REVOLUTIONTT_HTML_RESULTS = `
<html><body>
  <table id="torrents-table">
    <tbody>
      <tr>
        <th>Type</th>
        <th>Name</th>
        <th>Comments</th>
        <th>Download</th>
        <th>Uploader</th>
        <th>Added</th>
        <th>Size</th>
        <th>Snatched</th>
        <th>Seeders</th>
        <th>Leechers</th>
      </tr>
      <tr>
        <td class="br_type"><a href="browse.php?cat=12">Movies HD</a></td>
        <td class="br_right">
          <a href="details.php?id=141"><b>RevolutionTT Movie 2026 1080p BluRay</b></a>
        </td>
        <td>4</td>
        <td><a href="download.php?id=141">Download</a></td>
        <td>Uploader</td>
        <td><nobr>2026-05-1021:15:00</nobr></td>
        <td>7.2 GB <a href="filelist.php?id=141">18 files</a></td>
        <td>33</td>
        <td>70</td>
        <td>5</td>
      </tr>
    </tbody>
  </table>
</body></html>`

const PRETOME_HTML_RESULTS = `
<html><body>
  <table>
    <tbody>
      <tr class="browse">
        <td><a href="browse.php?cat[]=19&amp;tags=720p">Movies/720p</a></td>
        <td>Type</td>
        <td><a href="details.php?id=151" title="PreToMe Movie 2026 720p WEB-DL">PreToMe Movie</a></td>
        <td>12</td>
        <td>Comments</td>
        <td>2 hours ago</td>
        <td>Uploader</td>
        <td>6.4 GB</td>
        <td>22</td>
        <td>41</td>
        <td>3</td>
        <td><a href="download.php?id=151">Download</a></td>
      </tr>
    </tbody>
  </table>
</body></html>`

const RETROFLIX_JSON_RESULTS = JSON.stringify([
  {
    download_volume_factor: 0,
    upload_volume_factor: 1,
    url: "https://retroflix.club/torrent/321",
    id: 321,
    name: "Retro Movie 1976 1080p BluRay",
    description: "Classic feature",
    category: {
      id: 401,
      name: "Movies",
    },
    size: 1_234_000_000,
    created_at: "2026-05-09T08:30:00+00:00",
    times_completed: 14,
    leechers: 3,
    seeders: 19,
    imdb_id: "tt7654321",
  },
])

const SPEEDAPP_JSON_RESULTS = JSON.stringify([
  {
    download_volume_factor: 1,
    upload_volume_factor: 2,
    url: "https://speedapp.io/torrent/812",
    id: 812,
    name: "SpeedApp Movie 2026 1080p WEB-DL",
    description: "Romanian HD release",
    category: {
      id: 8,
      name: "Movies: HD",
    },
    size: 4_321_000_000,
    created_at: "2026-05-10T06:15:00+00:00",
    times_completed: 21,
    leechers: 7,
    seeders: 35,
    imdb_id: "tt2468135",
  },
])

const BEYONDHD_JSON_RESULTS = JSON.stringify({
  status_code: 1,
  status_message: "OK",
  results: [
    {
      name: "BeyondHD Movie 2026 1080p WEB-DL",
      info_hash: "abcdef1234567890",
      category: "Movies",
      type: "1080p",
      size: 5_678_000_000,
      times_completed: 12,
      seeders: 42,
      leechers: 4,
      created_at: "2026-05-10T07:45:00+00:00",
      download_url: "https://beyond-hd.me/download/9001",
      url: "https://beyond-hd.me/torrents/9001",
      imdb_id: "tt1357911",
      tmdb_id: "movie/9876",
      freeleech: true,
      limited: false,
      exclusive: true,
      internal: true,
    },
  ],
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

  it("builds and parses ShizaProject GraphQL JSON searches from the built-in definition", async () => {
    let requestUrl: string | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input)
      return new Response(SHIZA_PROJECT_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 110,
      name: "ShizaProject",
      type: "cardigann_yaml",
      definitionKey: "shizaproject",
      baseUrl: "https://shiza-project.com/",
      apiKey: "",
      priority: 46,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: "Shiza Show S01E01", type: "tv", categories: [5070] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(requestUrl ?? "")
    expect(url.origin).toBe("https://shiza-project.com")
    expect(url.pathname).toBe("/graphql")
    expect(url.searchParams.get("query")).toContain("query fetchReleases")
    expect(JSON.parse(url.searchParams.get("variables") ?? "")).toEqual({
      first: 50,
      query: "Shiza Show",
    })
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Shiza Show Episode 01 [1080]",
      downloadUrl: "https://shiza-project.com/downloads/shiza-show-01.torrent",
      infoUrl: "https://shiza-project.com/releases/shiza-show/",
      category: "5070",
      size: 1_700_000_000,
      seeders: 22,
      leechers: 5,
      indexerId: 110,
      indexerName: "ShizaProject",
      indexerPriority: 46,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T09:00:00.000Z")
  })

  it("parses SceneHD passkey JSON searches from the built-in definition", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(SCENEHD_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 111,
      name: "SceneHD",
      type: "cardigann_yaml",
      definitionKey: "scenehd",
      baseUrl: "https://scenehd.org/",
      apiKey: "",
      configValues: {
        passkey: "scenehd-passkey",
      },
      priority: 47,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "SceneHD Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    const url = new URL(request?.url ?? "")
    expect(url.origin).toBe("https://scenehd.org")
    expect(url.pathname).toBe("/browse.php")
    expect(url.searchParams.get("api")).toBe("")
    expect(url.searchParams.get("passkey")).toBe("scenehd-passkey")
    expect(url.searchParams.get("search")).toBe("tt1234567 SceneHD Movie")
    expect(url.searchParams.get("cat")).toBe("1,4")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "SceneHD Movie 2026 1080p WEB-DL",
      downloadUrl: "https://scenehd.org/download.php?id=7001&passkey=scenehd-passkey",
      infoUrl: "https://scenehd.org/details.php?id=7001",
      category: "2040",
      size: 6_543_210_000,
      seeders: 31,
      leechers: 4,
      indexerId: 111,
      indexerName: "SceneHD",
      indexerPriority: 47,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T11:22:33.000Z")
  })

  it("parses TorrentSyndikat API-key JSON searches from the built-in definition", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(TORRENT_SYNDIKAT_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 112,
      name: "TorrentSyndikat",
      type: "cardigann_yaml",
      definitionKey: "torrentsyndikat",
      baseUrl: "https://torrent-syndikat.org/",
      apiKey: "ts-api-key",
      configValues: {
        productsOnly: "true",
      },
      priority: 48,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "TorrentSyndikat Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    const url = new URL(request?.url ?? "")
    expect(url.origin).toBe("https://torrent-syndikat.org")
    expect(url.pathname).toBe("/api_9djWe8Tb2NE3p6opyqnh/v1/browse.php")
    expect(url.searchParams.get("apikey")).toBe("ts-api-key")
    expect(url.searchParams.get("limit")).toBe("50")
    expect(url.searchParams.get("ponly")).toBe("true")
    expect(url.searchParams.get("imdbId")).toBe("tt1234567")
    expect(url.searchParams.has("searchstring")).toBe(false)
    expect(url.searchParams.get("cats")).toBe("9,20")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "TorrentSyndikat Movie 2026 1080p WEB-DL",
      downloadUrl: "https://torrent-syndikat.org/download.php?id=8001&apikey=ts-api-key",
      infoUrl: "https://torrent-syndikat.org/details.php?id=8001",
      category: "2040",
      size: 7_654_321_000,
      seeders: 42,
      leechers: 5,
      indexerId: 112,
      indexerName: "TorrentSyndikat",
      indexerPriority: 48,
      downloadFactor: 1,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T12:34:56.000Z")
  })

  it("renders Cardigann raw JSON POST bodies for Knaben searches", async () => {
    let requestUrl: string | undefined
    let requestInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestInit = init
      return new Response(KNABEN_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 90,
      name: "Knaben",
      type: "cardigann_yaml",
      definitionKey: "knaben",
      baseUrl: "https://knaben.org",
      apiKey: "",
      priority: 26,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({ term: 'Ubuntu "ISO"', type: "movie", categories: [2040] }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestUrl).toBe("https://api.knaben.org/v1")
    expect(requestInit?.method).toBe("POST")
    expect(new Headers(requestInit?.headers).get("content-type")).toBe("application/json")
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      order_by: "date",
      order_direction: "desc",
      from: 0,
      size: 100,
      hide_unsafe: true,
      search_type: "100%",
      search_field: "title",
      query: 'Ubuntu "ISO"',
      categories: [3001000],
    })
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: 'Ubuntu "ISO" 24.04 1080p',
      downloadUrl: "magnet:?xt=urn:btih:1234512345123451234512345123451234512345",
      infoUrl: "https://knaben.org/details/ubuntu-iso",
      category: "2040",
      size: 4_200_000_000,
      seeders: 7,
      leechers: 2,
      infohash: "1234512345123451234512345123451234512345",
      indexerId: 90,
      indexerName: "Knaben",
      indexerPriority: 26,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T10:00:00.000Z")
  })

  it("parses TorrentDay JSON results with cookie auth and Unix timestamps", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(TORRENT_DAY_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 91,
      name: "TorrentDay",
      type: "cardigann_yaml",
      definitionKey: "torrentday",
      baseUrl: "https://tday.love/",
      apiKey: "",
      configValues: {
        cookie: "uid=alice; pass=secret",
        freeleechOnly: "true",
      },
      priority: 27,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "Example Movie",
        type: "movie",
        categories: [2050],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe("https://tday.love/t.json?11;5;free;q=tt1234567%20Example%20Movie")
    expect(new Headers(request?.init?.headers).get("cookie")).toBe("uid=alice; pass=secret")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Example Movie 2026 1080p WEB-DL",
      downloadUrl: "https://tday.love/download.php/12345/12345.torrent",
      infoUrl: "https://tday.love/details.php?id=12345",
      category: "2050",
      size: 2_500_000_000,
      seeders: 24,
      leechers: 6,
      indexerId: 91,
      indexerName: "TorrentDay",
      indexerPriority: 27,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T10:00:00.000Z")
  })

  it("parses AnimeTorrents AJAX HTML results with cookie auth and freeleech filtering", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(ANIME_TORRENTS_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 107,
      name: "AnimeTorrents",
      type: "cardigann_yaml",
      definitionKey: "animetorrents",
      baseUrl: "https://animetorrents.me/",
      apiKey: "",
      configValues: {
        cookie: "at_session=abc",
        freeleechOnly: "true",
      },
      priority: 43,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "AnimeTorrents Movie",
        type: "movie",
        categories: [2040],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe(
      "https://animetorrents.me/ajax/torrents_data.php?total=100&cat=6&searchin=filename&search=AnimeTorrents%25Movie&page=1",
    )
    const requestHeaders = new Headers(request?.init?.headers)
    expect(requestHeaders.get("cookie")).toBe("at_session=abc")
    expect(requestHeaders.get("x-requested-with")).toBe("XMLHttpRequest")
    expect(requestHeaders.get("referer")).toBe("https://animetorrents.me/torrents.php?cat=6")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "AnimeTorrents Movie 2026 1080p WEB-DL",
      downloadUrl: "https://animetorrents.me/download.php?id=161",
      infoUrl: "https://animetorrents.me/torrents.php?id=161",
      category: "2040",
      size: 1_500_000_000,
      seeders: 18,
      leechers: 2,
      indexerId: 107,
      indexerName: "AnimeTorrents",
      indexerPriority: 43,
      downloadFactor: 0,
      uploadFactor: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })

  it("parses BakaBT HTML results after form login with freeleech filtering", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      const url = new URL(String(input))
      if (url.pathname === "/login.php" && init?.method !== "POST") {
        return new Response(BAKABT_LOGIN_HTML, {
          status: 200,
          headers: { "Set-Cookie": "baka_landing=abc; Path=/" },
        })
      }
      if (url.pathname === "/login.php" && init?.method === "POST") {
        return new Response("<html><body>logged in</body></html>", {
          status: 200,
          headers: { "Set-Cookie": "baka_auth=ok; Path=/" },
        })
      }
      return new Response(BAKABT_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 108,
      name: "BakaBT",
      type: "cardigann_yaml",
      definitionKey: "bakabt",
      baseUrl: "https://bakabt.me/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        freeleechOnly: "true",
      },
      priority: 44,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "BakaBT Movie E12",
        type: "tv",
        categories: [5070],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const landingRequest = requests[0]
    expect(landingRequest?.url).toBe("https://bakabt.me/login.php")

    const loginRequest = requests[1]
    expect(loginRequest?.url).toBe("https://bakabt.me/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    expect(new Headers(loginRequest?.init?.headers).get("cookie")).toBe("baka_landing=abc")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("loginKey")).toBe("baka-login-key")
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("returnto")).toBe("/index.php")

    const searchRequest = requests[2]
    expect(searchRequest?.url).toBe(
      "https://bakabt.me/browse.php?only=0&incomplete=1&lossless=1&hd=1&multiaudio=1&bonus=1&reorder=1&q=BakaBT%20Movie",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe(
      "baka_landing=abc; baka_auth=ok",
    )
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "BakaBT Movie (2026) [1080p]",
      downloadUrl: "https://bakabt.me/download.php?id=501",
      infoUrl: "https://bakabt.me/torrent/501/bakabt-movie",
      category: "2000",
      size: 1_200_000_000,
      seeders: 8,
      leechers: 4,
      indexerId: 108,
      indexerName: "BakaBT",
      indexerPriority: 44,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })

  it("parses Nebulance JSON-RPC API results with API key auth", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(NEBULANCE_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 109,
      name: "Nebulance",
      type: "cardigann_yaml",
      definitionKey: "nebulance",
      baseUrl: "https://nebulance.io/",
      apiKey: "nbl-api-key",
      priority: 45,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "Nebulance Show S01E01",
        type: "tv",
        categories: [5040],
        imdbId: "tt7654321",
        season: 1,
        episode: 1,
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe("https://nebulance.io/api.php")
    expect(request?.init?.method).toBe("POST")
    expect(new Headers(request?.init?.headers).get("content-type")).toBe("application/json")
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      jsonrpc: "2.0",
      method: "getTorrents",
      params: [
        "nbl-api-key",
        {
          age: ">0",
          release: "Nebulance Show S01E01",
          imdb: "tt7654321",
          season: 1,
          episode: 1,
        },
        100,
        0,
      ],
      id: 1,
    })
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Nebulance.Show.S01E01.1080p.WEB-DL",
      downloadUrl: "https://nebulance.io/download.php?id=77",
      infoUrl: "https://nebulance.io/torrents.php?id=77",
      category: "5000",
      size: 1_500_000_000,
      seeders: 12,
      leechers: 3,
      indexerId: 109,
      indexerName: "Nebulance",
      indexerPriority: 45,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T10:00:00.000Z")
  })

  it("parses BroadcasTheNet JSON-RPC API results with API key auth", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(BROADCASTHE_NET_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 119,
      name: "BroadcasTheNet",
      type: "cardigann_yaml",
      definitionKey: "broadcasthe-net",
      baseUrl: "https://api.broadcasthe.net/",
      apiKey: "btn-api-key",
      priority: 55,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "BroadcasTheNet Show S01E02",
        type: "tv",
        categories: [5040],
        tvdbId: 12345,
        season: 1,
        episode: 2,
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe("https://api.broadcasthe.net/")
    expect(request?.init?.method).toBe("POST")
    expect(new Headers(request?.init?.headers).get("content-type")).toBe("application/json")
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      jsonrpc: "2.0",
      method: "getTorrents",
      params: [
        "btn-api-key",
        {
          age: ">0",
          search: "BroadcasTheNet%Show%S01E02",
          tvdb: "12345",
          category: "Episode",
          name: "S1E2%",
        },
        100,
        0,
      ],
      id: 1,
    })
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "BroadcasTheNet.Show.S01E02.1080p.WEB.H264-BTN",
      downloadUrl: "https://broadcasthe.net/torrents.php?action=download&id=8801",
      infoUrl: "https://broadcasthe.net/torrents.php?id=88&torrentid=8801",
      category: "5040",
      size: 2_345_678_900,
      seeders: 62,
      leechers: 5,
      indexerId: 119,
      indexerName: "BroadcasTheNet",
      indexerPriority: 55,
      infohash: "ABCDEF1234567890",
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T10:30:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "BroadcasTheNet.Show.S01.2160p.BluRay.HEVC-BTN",
      category: "5045",
      downloadFactor: 0,
      uploadFactor: 1,
    })
  })

  it("parses IPTorrents HTML results with cookie auth and user-agent headers", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(IPTORRENTS_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 92,
      name: "IPTorrents",
      type: "cardigann_yaml",
      definitionKey: "iptorrents",
      baseUrl: "https://iptorrents.com/",
      apiKey: "",
      configValues: {
        cookie: "uid=alice; pass=secret",
        userAgent: "Mozilla/5.0 IPT",
        freeleechOnly: "true",
      },
      priority: 28,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "IPT Movie",
        type: "movie",
        categories: [2050],
        imdbId: "tt7654321",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe(
      "https://iptorrents.com/t?48=&free=on&q=%2B%28tt7654321%29&qf=all&q=%2B%28IPT%20Movie%29",
    )
    const headers = new Headers(request?.init?.headers)
    expect(headers.get("cookie")).toBe("uid=alice; pass=secret")
    expect(headers.get("user-agent")).toBe("Mozilla/5.0 IPT")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "IPT Movie 2026 1080p BluRay",
      downloadUrl: "https://iptorrents.com/download.php/765/IPT.Movie.2026.torrent",
      infoUrl: "https://iptorrents.com/details.php?id=765",
      category: "2050",
      size: 1_500_000_000,
      seeders: 44,
      leechers: 5,
      indexerId: 92,
      indexerName: "IPTorrents",
      indexerPriority: 28,
      downloadFactor: 0,
      uploadFactor: 1,
    })
  })

  it("parses BitHDTV HTML results with cookie auth and volume-factor row colors", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(BITHDTV_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 96,
      name: "BitHDTV",
      type: "cardigann_yaml",
      definitionKey: "bit-hdtv",
      baseUrl: "https://www.bit-hdtv.com/",
      apiKey: "",
      configValues: {
        cookie: "uid=alice; pass=secret",
      },
      priority: 32,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "BitHDTV Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt2223334",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe(
      "https://www.bit-hdtv.com/torrents.php?cat=7&search=tt2223334&options=4",
    )
    expect(new Headers(request?.init?.headers).get("cookie")).toBe("uid=alice; pass=secret")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "BitHDTV Movie 2026 1080p BluRay",
      downloadUrl: "https://www.bit-hdtv.com/download.php?id=222",
      infoUrl: "https://www.bit-hdtv.com/details.php?id=222",
      category: "2000",
      size: 3_500_000_000,
      seeders: 27,
      leechers: 2,
      indexerId: 96,
      indexerName: "BitHDTV",
      indexerPriority: 32,
      downloadFactor: 0,
      uploadFactor: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T12:34:56.000Z")
  })

  it("parses TorrentBytes HTML results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/takelogin.php") {
        return new Response('<html><body><a href="my.php">Profile</a></body></html>', {
          status: 200,
          headers: { "set-cookie": "tb_session=abc; Path=/" },
        })
      }
      return new Response(TORRENT_BYTES_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 97,
      name: "TorrentBytes",
      type: "cardigann_yaml",
      definitionKey: "torrentbytes",
      baseUrl: "https://www.torrentbytes.net/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 33,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "TorrentBytes Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt3334445",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://www.torrentbytes.net/takelogin.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("returnto")).toBe("/")
    expect(loginBody.get("login")).toBe("Log in!")

    const searchRequest = requests[1]
    expect(searchRequest?.url).toBe(
      "https://www.torrentbytes.net/browse.php?incldead=1&search=tt3334445&sc=2&c5=1&c46=1",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("tb_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "TorrentBytes Movie 2026 1080p WEB-DL",
      downloadUrl: "https://www.torrentbytes.net/download.php/333/TorrentBytes.Movie.2026.torrent",
      infoUrl: "https://www.torrentbytes.net/details.php?id=333",
      category: "2040",
      size: 4_200_000_000,
      seeders: 31,
      leechers: 4,
      indexerId: 97,
      indexerName: "TorrentBytes",
      indexerPriority: 33,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T13:45:56.000Z")
    expect(releases[1]).toMatchObject({
      title: "TorrentBytes Fallback 2026 720p",
      category: "2040",
      downloadFactor: 1,
      uploadFactor: 1,
    })
  })

  it("parses SceneTime HTML results with cookie auth and freeleech filtering", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(SCENETIME_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 98,
      name: "SceneTime",
      type: "cardigann_yaml",
      definitionKey: "scenetime",
      baseUrl: "https://www.scenetime.com/",
      apiKey: "",
      configValues: {
        cookie: "uid=alice; pass=secret",
        freeLeechOnly: "true",
      },
      priority: 34,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "SceneTime Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt5556667",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe(
      "https://www.scenetime.com/browse.php?cata=yes&c59=1&imdb=tt5556667&search=SceneTime%20Movie&freeleech=on",
    )
    expect(new Headers(request?.init?.headers).get("cookie")).toBe("uid=alice; pass=secret")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "SceneTime Movie",
      downloadUrl: "https://www.scenetime.com/download.php/555/download.torrent",
      infoUrl: "https://www.scenetime.com/details.php?id=555",
      category: "2040",
      size: 6_600_000_000,
      seeders: 55,
      leechers: 8,
      indexerId: 98,
      indexerName: "SceneTime",
      indexerPriority: 34,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T13:23:00.000Z")
  })

  it("parses HD-Space HTML results after form login and freeleech filtering", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/index.php" && url.searchParams.get("page") === "login") {
        if (init?.method === "POST") {
          return new Response('<html><body><a href="logout.php">Logout</a></body></html>', {
            status: 200,
            headers: { "set-cookie": "hds_session=abc; Path=/" },
          })
        }
        return new Response(HD_SPACE_LOGIN_HTML, {
          status: 200,
          headers: { "set-cookie": "landing=hds; Path=/" },
        })
      }
      return new Response(HD_SPACE_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 99,
      name: "HD-Space",
      type: "cardigann_yaml",
      definitionKey: "hd-space",
      baseUrl: "https://hd-space.org/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        freeleechOnly: "true",
      },
      priority: 35,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "HD Space Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt7778889",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const landingRequest = requests[0]
    expect(landingRequest?.url).toBe("https://hd-space.org/index.php?page=login")

    const loginRequest = requests[1]
    expect(loginRequest?.url).toBe("https://hd-space.org/index.php?page=login")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("returnto")).toBe("index.php")
    expect(loginBody.get("uid")).toBe("alice")
    expect(loginBody.get("pwd")).toBe("secret")
    expect(new Headers(loginRequest?.init?.headers).get("cookie")).toBe("landing=hds")

    const searchRequest = requests[2]
    expect(searchRequest?.url).toBe(
      "https://hd-space.org/index.php?page=torrents&active=0&category=19%3B18%3B40%3B16&options=2&search=tt7778889",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe(
      "landing=hds; hds_session=abc",
    )
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "HD-Space Movie 2026 1080p BluRay",
      downloadUrl: "https://hd-space.org/download.php?id=777&f=HD-Space.Movie.2026.1080p.torrent",
      infoUrl: "https://hd-space.org/index.php?page=torrent-details&id=777",
      category: "2040",
      size: 7_700_000_000,
      seeders: 77,
      leechers: 9,
      indexerId: 99,
      indexerName: "HD-Space",
      indexerPriority: 35,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T13:45:09.000Z")
  })

  it("parses SpeedCD HTML results with cookie auth and search path flags", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(SPEEDCD_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 100,
      name: "SpeedCD",
      type: "cardigann_yaml",
      definitionKey: "speedcd",
      baseUrl: "https://speed.cd/",
      apiKey: "",
      configValues: {
        cookie: "speed_session=abc",
        freeleechOnly: "true",
        excludeArchives: "true",
      },
      priority: 36,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "SpeedCD Movie",
        type: "movie",
        categories: [2040],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe("https://speed.cd/browse/43/freeleech/norar/q/SpeedCD%20Movie")
    expect(new Headers(request?.init?.headers).get("cookie")).toBe("speed_session=abc")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "SpeedCD Movie 2026 1080p WEB-DL",
      downloadUrl: "https://speed.cd/download/888/SpeedCD.Movie.2026.torrent",
      infoUrl: "https://speed.cd/t/888/speedcd-movie-2026",
      category: "2040",
      size: 8_800_000_000,
      seeders: 88,
      leechers: 11,
      indexerId: 100,
      indexerName: "SpeedCD",
      indexerPriority: 36,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T14:45:00.000Z")
  })

  it("parses HD-Torrents HTML results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(
          "<html><body>If your browser doesn't have javascript enabled</body></html>",
          {
            status: 200,
            headers: { "set-cookie": "hdt_session=abc; Path=/" },
          },
        )
      }
      return new Response(HD_TORRENTS_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 101,
      name: "HD-Torrents",
      type: "cardigann_yaml",
      definitionKey: "hd-torrents",
      baseUrl: "https://hdts.ru/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 37,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "HD.Torrents Movie",
        type: "movie",
        categories: [2050],
        imdbId: "tt9990001",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://hdts.ru/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("uid")).toBe("alice")
    expect(loginBody.get("pwd")).toBe("secret")

    const searchRequest = requests[1]
    expect(searchRequest?.url).toBe(
      "https://hdts.ru/torrents.php?category[]=70&category[]=1&search=tt9990001%20HD%20Torrents%20Movie&active=0&options=0",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("hdt_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "HD-Torrents Movie 2026 UHD BluRay",
      downloadUrl: "https://hdts.ru/download.php?id=999",
      infoUrl: "https://hdts.ru/details.php?id=999",
      category: "2050",
      size: 12_500_000_000,
      seeders: 99,
      leechers: 12,
      indexerId: 101,
      indexerName: "HD-Torrents",
      indexerPriority: 37,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T15:30:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "HD-Torrents Movie 2026 2160p Quarter",
      category: "2045",
      downloadFactor: 1,
      uploadFactor: 1,
    })
  })

  it("parses FunFile HTML results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/takelogin.php") {
        return new Response('<html><body><a href="logout.php">Logout</a></body></html>', {
          status: 200,
          headers: { "set-cookie": "funfile_session=abc; Path=/" },
        })
      }
      return new Response(FUNFILE_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 102,
      name: "FunFile",
      type: "cardigann_yaml",
      definitionKey: "funfile",
      baseUrl: "https://www.funfile.org/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 38,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "FunFile Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt1122334",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://www.funfile.org/takelogin.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("returnto")).toBe("/")
    expect(loginBody.get("login")).toBe("Login")

    const searchRequest = requests[1]
    expect(searchRequest?.url).toBe(
      "https://www.funfile.org/browse.php?cat=0&incldead=1&showspam=1&s_title=1&search=tt1122334&s_desc=1&c19=1",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("funfile_session=abc")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "FunFile Movie 2026 1080p WEB-DL",
      downloadUrl: "https://www.funfile.org/download.php?id=111",
      infoUrl: "https://www.funfile.org/details.php?id=111&hit=1",
      category: "2000",
      size: 4_200_000_000,
      seeders: 21,
      leechers: 2,
      indexerId: 102,
      indexerName: "FunFile",
      indexerPriority: 38,
      downloadFactor: 1,
      uploadFactor: 1,
    })
  })

  it("parses ImmortalSeed HTML results after POST login with freeleech filtering", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/takelogin.php") {
        return new Response('<html><body><a href="logout.php">Logout</a></body></html>', {
          status: 200,
          headers: { "set-cookie": "is_session=abc; Path=/" },
        })
      }
      return new Response(IMMORTAL_SEED_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 103,
      name: "ImmortalSeed",
      type: "cardigann_yaml",
      definitionKey: "immortalseed",
      baseUrl: "https://immortalseed.me/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        freeleechOnly: "true",
      },
      priority: 39,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "ImmortalSeed.Movie",
        type: "movie",
        categories: [2040],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://immortalseed.me/takelogin.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")

    const searchRequest = requests[1]
    expect(searchRequest?.url).toBe(
      "https://immortalseed.me/browse.php?category=0&include_dead_torrents=yes&sort=added&order=desc&do=search&keywords=ImmortalSeed%20Movie&search_type=t_name&selectedcats2=16",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("is_session=abc")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "ImmortalSeed Movie 2026 1080p WEB-DL",
      downloadUrl: "https://immortalseed.me/download.php?id=121",
      infoUrl: "https://immortalseed.me/details.php?id=121",
      category: "2040",
      size: 5_500_000_000,
      seeders: 55,
      leechers: 6,
      indexerId: 103,
      indexerName: "ImmortalSeed",
      indexerPriority: 39,
      downloadFactor: 0,
      uploadFactor: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T17:45:00.000Z")
  })

  it("parses XSpeeds HTML results after POST login with freeleech filtering", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/takelogin.php") {
        return new Response('<html><body><a href="logout.php">Logout</a></body></html>', {
          status: 200,
          headers: { "set-cookie": "xs_session=abc; Path=/" },
        })
      }
      return new Response(XSPEEDS_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 104,
      name: "XSpeeds",
      type: "cardigann_yaml",
      definitionKey: "xspeeds",
      baseUrl: "https://www.xspeeds.eu/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        freeleechOnly: "true",
      },
      priority: 40,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "XSpeeds.Movie",
        type: "movie",
        categories: [2070],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://www.xspeeds.eu/takelogin.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")

    const searchRequest = requests[1]
    expect(searchRequest?.url).toBe(
      "https://www.xspeeds.eu/browse.php?category=10&include_dead_torrents=yes&sort=added&order=desc&do=search&keywords=XSpeeds%20Movie&search_type=t_name",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("xs_session=abc")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "XSpeeds Movie 2026 DVDR",
      downloadUrl: "https://www.xspeeds.eu/download.php?id=131",
      infoUrl: "https://www.xspeeds.eu/details.php?id=131",
      category: "2070",
      size: 4_700_000_000,
      seeders: 64,
      leechers: 8,
      indexerId: 104,
      indexerName: "XSpeeds",
      indexerPriority: 40,
      downloadFactor: 0,
      uploadFactor: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T19:05:00.000Z")
  })

  it("parses Xthor passkey JSON API results from the built-in definition", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(XTHOR_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 105,
      name: "Xthor",
      type: "cardigann_yaml",
      definitionKey: "xthor",
      baseUrl: "https://api.xthor.tk/",
      apiKey: "",
      configValues: {
        passkey: "xthor-passkey",
        freeleechOnly: "true",
      },
      priority: 41,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "Xthor Movie",
        type: "movie",
        categories: [2040],
        tmdbId: 12345,
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    const url = new URL(request?.url ?? "")
    expect(url.origin).toBe("https://api.xthor.tk")
    expect(url.pathname).toBe("/")
    expect(url.searchParams.get("passkey")).toBe("xthor-passkey")
    expect(url.searchParams.get("tmdbid")).toBe("12345")
    expect(url.searchParams.has("search")).toBe(false)
    expect(url.searchParams.get("freeleech")).toBe("1")
    expect(url.searchParams.get("category")).toBe("100+4+5+122")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Xthor Movie 2026 1080p x264",
      downloadUrl: "https://api.xthor.tk/download.php?id=9001&passkey=xthor-passkey",
      infoUrl: "https://xthor.tk/details.php?id=9001",
      category: "2040",
      size: 8_123_456_000,
      seeders: 72,
      leechers: 9,
      indexerId: 105,
      indexerName: "Xthor",
      indexerPriority: 41,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T12:34:56.000Z")
  })

  it("parses HDBits JSON POST API results from the built-in definition", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(HDBITS_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 106,
      name: "HDBits",
      type: "cardigann_yaml",
      definitionKey: "hdbits",
      baseUrl: "https://hdbits.org/",
      apiKey: "hdbits-passkey",
      configValues: {
        username: "alice",
        freeleechOnly: "true",
      },
      priority: 42,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "HDBits Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe("https://hdbits.org/api/torrents")
    expect(request?.init?.method).toBe("POST")
    expect(new Headers(request?.init?.headers).get("content-type")).toBe("application/json")
    expect(new Headers(request?.init?.headers).get("accept")).toBe("application/json")
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      username: "alice",
      passkey: "hdbits-passkey",
      limit: 100,
      category: [1],
      imdb: {
        id: 1234567,
      },
    })
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "HDBits Movie 2026 1080p WEB-DL",
      downloadUrl: "https://hdbits.org/download.php?id=1001&passkey=hdbits-passkey",
      infoUrl: "https://hdbits.org/details.php?id=1001",
      category: "2000",
      size: 9_123_456_000,
      seeders: 52,
      leechers: 6,
      infohash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      indexerId: 106,
      indexerName: "HDBits",
      indexerPriority: 42,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T12:34:56.000Z")
  })

  it("parses PiXELHD HTML results with cookie auth and user-agent headers", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(PIXELHD_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 107,
      name: "PiXELHD",
      type: "cardigann_yaml",
      definitionKey: "pixelhd",
      baseUrl: "https://pixelhd.me/",
      apiKey: "",
      configValues: {
        cookie: "pixelhd_session=abc",
        userAgent: "Mozilla/5.0 PixelHD",
      },
      priority: 43,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "PiXELHD Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt2223334",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe(
      "https://pixelhd.me/torrents.php?order_by=time&order_way=desc&imdbid=tt2223334",
    )
    const headers = new Headers(request?.init?.headers)
    expect(headers.get("cookie")).toBe("pixelhd_session=abc")
    expect(headers.get("user-agent")).toBe("Mozilla/5.0 PixelHD")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "PiXELHD Movie 2026 1080p MP4",
      downloadUrl: "https://pixelhd.me/torrents.php?action=download&id=321",
      infoUrl: "https://pixelhd.me/torrents.php?id=321",
      category: "2040",
      size: 3_500_000_000,
      seeders: 44,
      leechers: 5,
      indexerId: 107,
      indexerName: "PiXELHD",
      indexerPriority: 43,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T19:05:00.000Z")
  })

  it("parses Secret Cinema Gazelle JSON results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "set-cookie": "sc_session=abc; Path=/" },
        })
      }
      return new Response(SECRET_CINEMA_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 108,
      name: "Secret Cinema",
      type: "cardigann_yaml",
      definitionKey: "secret-cinema",
      baseUrl: "https://secret-cinema.pw/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        useFreeleechToken: "1",
      },
      priority: 44,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "Secret Cinema Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt7654321",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://secret-cinema.pw/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("keeplogged")).toBe("1")

    const searchRequest = requests[1]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://secret-cinema.pw")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("Secret Cinema Movie")
    expect(searchUrl.searchParams.get("cataloguenumber")).toBe("tt7654321")
    expect(searchUrl.searchParams.get("filter_cat[1]")).toBe("1")
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("sc_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "Secret Cinema Movie (2026) WEB-DL [Director's Cut]",
      downloadUrl: "https://secret-cinema.pw/torrents.php?action=download&id=777&useToken=1",
      infoUrl: "https://secret-cinema.pw/torrents.php?id=555&torrentid=777",
      category: "2000",
      size: 6_123_456_000,
      seeders: 38,
      leechers: 2,
      indexerId: 108,
      indexerName: "Secret Cinema",
      indexerPriority: 44,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T08:20:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "Secret Cinema Album (2026) FLAC",
      category: "3000",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses FileList JSON API results with HTTP Basic auth", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(FILELIST_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 109,
      name: "FileList.io",
      type: "cardigann_yaml",
      definitionKey: "filelist",
      baseUrl: "https://filelist.io/",
      apiKey: "",
      configValues: {
        username: "alice",
        passkey: "filelist-passkey",
        freeleechOnly: "true",
      },
      priority: 45,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "FileList Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt7654321",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    const url = new URL(request?.url ?? "")
    expect(url.origin).toBe("https://filelist.io")
    expect(url.pathname).toBe("/api.php")
    expect(url.searchParams.get("action")).toBe("search-torrents")
    expect(url.searchParams.get("type")).toBe("imdb")
    expect(url.searchParams.get("query")).toBe("tt7654321")
    expect(url.searchParams.get("category")).toBe("4")
    expect(url.searchParams.get("freeleech")).toBe("1")
    expect(new Headers(request?.init?.headers).get("authorization")).toBe(
      "Basic YWxpY2U6ZmlsZWxpc3QtcGFzc2tleQ==",
    )
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "FileList Movie 2026 1080p BluRay",
      downloadUrl: "https://filelist.io/download.php?id=444&passkey=filelist-passkey",
      infoUrl: "https://filelist.io/details.php?id=444",
      category: "2040",
      size: 7_123_456_000,
      seeders: 61,
      leechers: 4,
      indexerId: 109,
      indexerName: "FileList.io",
      indexerPriority: 45,
      downloadFactor: 0,
      uploadFactor: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T14:30:00.000Z")
  })

  it("parses AlphaRatio Gazelle JSON results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "set-cookie": "ar_session=abc; Path=/" },
        })
      }
      return new Response(ALPHA_RATIO_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 110,
      name: "AlphaRatio",
      type: "cardigann_yaml",
      definitionKey: "alpharatio",
      baseUrl: "https://alpharatio.cc/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        useFreeleechToken: "1",
        freeleechOnly: "true",
        excludeScene: "true",
      },
      priority: 46,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "AlphaRatio Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt7654321",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://alpharatio.cc/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("keeplogged")).toBe("1")

    const searchRequest = requests[1]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://alpharatio.cc")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("AlphaRatio Movie")
    expect(searchUrl.searchParams.get("taglist")).toBe("tt7654321")
    expect(searchUrl.searchParams.get("filter_cat[9]")).toBe("1")
    expect(searchUrl.searchParams.get("freetorrent")).toBe("1")
    expect(searchUrl.searchParams.get("scene")).toBe("0")
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("ar_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "AlphaRatio Movie (2026) [H.264 1080p] [WEB]",
      downloadUrl: "https://alpharatio.cc/torrents.php?action=download&id=9011&usetoken=1",
      infoUrl: "https://alpharatio.cc/torrents.php?id=901&torrentid=9011",
      category: "2040",
      size: 8_123_456_000,
      seeders: 71,
      leechers: 3,
      indexerId: 110,
      indexerName: "AlphaRatio",
      indexerPriority: 46,
      downloadFactor: 1,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T09:10:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "AlphaRatio Series (2026) [H.265 2160p] [WEB] [Cue]",
      category: "5045",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses BrokenStones Gazelle JSON results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "set-cookie": "bs_session=abc; Path=/" },
        })
      }
      return new Response(BROKENSTONES_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 111,
      name: "BrokenStones",
      type: "cardigann_yaml",
      definitionKey: "brokenstones",
      baseUrl: "https://brokenstones.is/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        useFreeleechToken: "1",
      },
      priority: 47,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "BrokenStones Audio",
        type: "general",
        categories: [3000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://brokenstones.is/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("keeplogged")).toBe("1")

    const searchRequest = requests[1]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://brokenstones.is")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("BrokenStones Audio")
    expect(searchUrl.searchParams.get("filter_cat[6]")).toBe("1")
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("bs_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "BrokenStones Audio Pack (2026) [FLAC Lossless] [WEB] [Cue]",
      downloadUrl: "https://brokenstones.is/torrents.php?action=download&id=9911&usetoken=1",
      infoUrl: "https://brokenstones.is/torrents.php?id=991&torrentid=9911",
      category: "3000",
      size: 912_345_600,
      seeders: 19,
      leechers: 1,
      indexerId: 111,
      indexerName: "BrokenStones",
      indexerPriority: 47,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T10:40:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "BrokenStones Mac App (2026) [DMG Universal] [WEB]",
      category: "4020",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses CGPeers Gazelle JSON results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "set-cookie": "cg_session=abc; Path=/" },
        })
      }
      return new Response(CGPEERS_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 112,
      name: "CGPeers",
      type: "cardigann_yaml",
      definitionKey: "cgpeers",
      baseUrl: "https://cgpeers.to/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        useFreeleechToken: "1",
      },
      priority: 48,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "CGPeers App",
        type: "general",
        categories: [4020],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://cgpeers.to/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("keeplogged")).toBe("1")

    const searchRequest = requests[1]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://cgpeers.to")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("CGPeers App")
    expect(searchUrl.searchParams.get("filter_cat[1]")).toBe("1")
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("cg_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "CGPeers Full App (2026) [ISO x64] [WEB]",
      downloadUrl: "https://cgpeers.to/torrents.php?action=download&id=9811&usetoken=1",
      infoUrl: "https://cgpeers.to/torrents.php?id=981&torrentid=9811",
      category: "4020",
      size: 4_312_345_600,
      seeders: 33,
      leechers: 4,
      indexerId: 112,
      indexerName: "CGPeers",
      indexerPriority: 48,
      downloadFactor: 1,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T11:20:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "CGPeers Tutorial Pack (2026) [MP4 1080p] [WEB]",
      category: "8000",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses DICMusic Gazelle JSON results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "set-cookie": "dic_session=abc; Path=/" },
        })
      }
      return new Response(DICMUSIC_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 113,
      name: "DICMusic",
      type: "cardigann_yaml",
      definitionKey: "dicmusic",
      baseUrl: "https://dicmusic.com/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        useFreeleechToken: "1",
      },
      priority: 49,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "DICMusic Album",
        type: "general",
        categories: [3000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://dicmusic.com/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("keeplogged")).toBe("1")

    const searchRequest = requests[1]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://dicmusic.com")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("DICMusic Album")
    expect(searchUrl.searchParams.get("filter_cat[1]")).toBe("1")
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("dic_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "DICMusic Album (2026) [FLAC Lossless] [WEB] [Cue]",
      downloadUrl: "https://dicmusic.com/torrents.php?action=download&id=9711&usetoken=1",
      infoUrl: "https://dicmusic.com/torrents.php?id=971&torrentid=9711",
      category: "3000",
      size: 712_345_600,
      seeders: 43,
      leechers: 5,
      indexerId: 113,
      indexerName: "DICMusic",
      indexerPriority: 49,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T12:30:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "DICMusic Audio App (2026) [DMG Universal] [WEB]",
      category: "4000",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses GreatPosterWall Gazelle JSON results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(JSON.stringify({ status: "success" }), {
          status: 200,
          headers: { "set-cookie": "gpw_session=abc; Path=/" },
        })
      }
      return new Response(GREAT_POSTER_WALL_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 114,
      name: "GreatPosterWall",
      type: "cardigann_yaml",
      definitionKey: "greatposterwall",
      baseUrl: "https://greatposterwall.com/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        useFreeleechToken: "1",
        freeleechOnly: "true",
      },
      priority: 50,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "GreatPosterWall Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://greatposterwall.com/login.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("keeplogged")).toBe("1")

    const searchRequest = requests[1]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://greatposterwall.com")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("tt1234567")
    expect(searchUrl.searchParams.get("filter_cat[1]")).toBe("1")
    expect(searchUrl.searchParams.get("freetorrent")).toBe("1")
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("gpw_session=abc")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "GreatPosterWall Movie 2026 1080p BluRay FLAC x264-GPW",
      downloadUrl: "https://greatposterwall.com/torrents.php?action=download&id=9611&usetoken=1",
      infoUrl: "https://greatposterwall.com/torrents.php?id=961&torrentid=9611",
      category: "2000",
      size: 9_123_456_000,
      seeders: 55,
      leechers: 6,
      indexerId: 114,
      indexerName: "GreatPosterWall",
      indexerPriority: 50,
      downloadFactor: 0.5,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T12:30:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "GreatPosterWall UHD Movie 2026 2160p WEB-DL HEVC-GPW",
      category: "2000",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses Orpheus token-auth Gazelle JSON results", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(ORPHEUS_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 116,
      name: "Orpheus",
      type: "cardigann_yaml",
      definitionKey: "orpheus",
      baseUrl: "https://orpheus.network/",
      apiKey: "ops-api-key",
      configValues: {
        useFreeleechToken: "1",
      },
      priority: 52,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "Orpheus Album",
        type: "general",
        categories: [3000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const searchRequest = requests[0]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://orpheus.network")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("Orpheus Album")
    expect(searchUrl.searchParams.get("filter_cat[1]")).toBe("1")
    expect(searchUrl.searchParams.has("freetorrent")).toBe(false)
    expect(new Headers(searchRequest?.init?.headers).get("authorization")).toBe("token ops-api-key")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "OPS Artist - Orpheus Album (2026) [Album] [FLAC Lossless] [WEB] [Log (95%)]",
      downloadUrl: "https://orpheus.network/ajax.php?action=download&id=9411&usetoken=1",
      infoUrl: "https://orpheus.network/torrents.php?id=941&torrentid=9411",
      category: "3000",
      size: 912_345_600,
      seeders: 49,
      leechers: 4,
      indexerId: 116,
      indexerName: "Orpheus",
      indexerPriority: 52,
      downloadFactor: 1,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T10:15:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "Orpheus Audiobook (2026) [MP3 V0] [WEB]",
      category: "3030",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses PassThePopcorn API-header JSON results", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(PASS_THE_POPCORN_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 117,
      name: "PassThePopcorn",
      type: "cardigann_yaml",
      definitionKey: "passthepopcorn",
      baseUrl: "https://passthepopcorn.me/",
      apiKey: "ptp-api-key",
      configValues: {
        apiUser: "ptp-user",
        freeleechOnly: "true",
        goldenPopcornOnly: "true",
      },
      priority: 53,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "PassThePopcorn Feature",
        type: "movie",
        categories: [2000],
        imdbId: "tt1234567",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const searchRequest = requests[0]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://passthepopcorn.me")
    expect(searchUrl.pathname).toBe("/torrents.php")
    expect(searchUrl.searchParams.get("action")).toBe("advanced")
    expect(searchUrl.searchParams.get("json")).toBe("noredirect")
    expect(searchUrl.searchParams.get("grouping")).toBe("0")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("tt1234567")
    expect(searchUrl.searchParams.get("freetorrent")).toBe("1")
    expect(searchUrl.searchParams.get("scene")).toBe("2")
    expect(searchUrl.searchParams.get("filter_cat[1]")).toBe("1")
    expect(searchUrl.searchParams.get("filter_cat[6]")).toBe("1")
    const headers = new Headers(searchRequest?.init?.headers)
    expect(headers.get("apiuser")).toBe("ptp-user")
    expect(headers.get("apikey")).toBe("ptp-api-key")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title: "PassThePopcorn.Feature.2026.1080p.BluRay.x264-PTP",
      downloadUrl: "https://passthepopcorn.me/torrents.php?action=download&id=30011",
      infoUrl: "https://passthepopcorn.me/torrents.php?id=3001&torrentid=30011",
      category: "2000",
      size: 12_345_678_900,
      seeders: 88,
      leechers: 7,
      indexerId: 117,
      indexerName: "PassThePopcorn",
      indexerPriority: 53,
      downloadFactor: 0,
      uploadFactor: 0,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T11:25:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "PassThePopcorn.Collection.2026.2160p.WEB-DL.HEVC-PTP",
      category: "2000",
      downloadFactor: 0.5,
      uploadFactor: 1,
    })
  })

  it("parses Redacted API-key Gazelle JSON results", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(REDACTED_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 115,
      name: "Redacted",
      type: "cardigann_yaml",
      definitionKey: "redacted",
      baseUrl: "https://redacted.sh/",
      apiKey: "red-api-key",
      configValues: {
        useFreeleechToken: "1",
        freeloadOnly: "true",
      },
      priority: 51,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "Redacted Album",
        type: "general",
        categories: [3000],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const searchRequest = requests[0]
    const searchUrl = new URL(searchRequest?.url ?? "")
    expect(searchUrl.origin).toBe("https://redacted.sh")
    expect(searchUrl.pathname).toBe("/ajax.php")
    expect(searchUrl.searchParams.get("action")).toBe("browse")
    expect(searchUrl.searchParams.get("order_by")).toBe("time")
    expect(searchUrl.searchParams.get("order_way")).toBe("desc")
    expect(searchUrl.searchParams.get("searchstr")).toBe("Redacted Album")
    expect(searchUrl.searchParams.get("filter_cat[1]")).toBe("1")
    expect(searchUrl.searchParams.get("freetorrent")).toBe("4")
    expect(new Headers(searchRequest?.init?.headers).get("authorization")).toBe("red-api-key")
    expect(releases).toHaveLength(2)
    expect(releases[0]).toMatchObject({
      title:
        "Red Artist - Redacted Album (2026) [Album] [Deluxe Edition 2026] [FLAC Lossless] [WEB] [Log (100%)] [Cue]",
      downloadUrl: "https://redacted.sh/ajax.php?action=download&id=9511&usetoken=1",
      infoUrl: "https://redacted.sh/torrents.php?id=951&torrentid=9511",
      category: "3000",
      size: 812_345_600,
      seeders: 52,
      leechers: 3,
      indexerId: 115,
      indexerName: "Redacted",
      indexerPriority: 51,
      downloadFactor: 0,
      uploadFactor: 0,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T09:45:00.000Z")
    expect(releases[1]).toMatchObject({
      title: "Redacted EBook (2026) [PDF Retail] [WEB]",
      category: "7020",
      downloadFactor: 0,
      uploadFactor: 0,
    })
  })

  it("parses RevolutionTT HTML results after POST login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/takelogin.php") {
        return new Response('<html><body><a href="/logout.php">Logout</a></body></html>', {
          status: 200,
          headers: { "set-cookie": "rev_session=abc; Path=/" },
        })
      }
      return new Response(REVOLUTIONTT_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 105,
      name: "RevolutionTT",
      type: "cardigann_yaml",
      definitionKey: "revolutiontt",
      baseUrl: "https://revott.me/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
      },
      priority: 41,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "RevolutionTT.Movie",
        type: "movie",
        categories: [2040],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const loginRequest = requests[0]
    expect(loginRequest?.url).toBe("https://revott.me/takelogin.php")
    expect(loginRequest?.init?.method).toBe("POST")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")

    const searchRequest = requests[1]
    expect(searchRequest?.url).toBe(
      "https://revott.me/browse.php?incldead=1&titleonly=1&search=RevolutionTT.Movie&c12=1",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe("rev_session=abc")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "RevolutionTT Movie 2026 1080p BluRay",
      downloadUrl: "https://revott.me/download.php?id=141",
      infoUrl: "https://revott.me/details.php?id=141",
      category: "2040",
      size: 7_200_000_000,
      seeders: 70,
      leechers: 5,
      indexerId: 105,
      indexerName: "RevolutionTT",
      indexerPriority: 41,
      downloadFactor: 1,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T21:15:00.000Z")
  })

  it("parses PreToMe HTML results after form login", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: String(input), init })
      if (url.pathname === "/login.php") {
        return new Response(
          `<html><body>
            <form action="takelogin.php" method="post">
              <input type="hidden" name="returnto" value="/">
              <input type="text" name="username">
              <input type="password" name="password">
              <input type="password" name="login_pin">
            </form>
          </body></html>`,
          {
            status: 200,
            headers: { "set-cookie": "pretome_landing=abc; Path=/" },
          },
        )
      }
      if (url.pathname === "/takelogin.php") {
        return new Response('<html><body><a href="logout.php">Logout</a></body></html>', {
          status: 200,
          headers: { "set-cookie": "pretome_session=xyz; Path=/" },
        })
      }
      return new Response(PRETOME_HTML_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 106,
      name: "PreToMe",
      type: "cardigann_yaml",
      definitionKey: "pretome",
      baseUrl: "https://pretome.info/",
      apiKey: "",
      configValues: {
        username: "alice",
        password: "secret",
        pin: "1234",
      },
      priority: 42,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "PreToMe Movie",
        type: "movie",
        categories: [2040],
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const landingRequest = requests[0]
    expect(landingRequest?.url).toBe("https://pretome.info/login.php")
    expect(landingRequest?.init?.method).toBeUndefined()

    const loginRequest = requests[1]
    expect(loginRequest?.url).toBe("https://pretome.info/takelogin.php")
    expect(loginRequest?.init?.method).toBe("POST")
    expect(new Headers(loginRequest?.init?.headers).get("cookie")).toBe("pretome_landing=abc")
    const loginBody = new URLSearchParams(String(loginRequest?.init?.body ?? ""))
    expect(loginBody.get("username")).toBe("alice")
    expect(loginBody.get("password")).toBe("secret")
    expect(loginBody.get("login_pin")).toBe("1234")
    expect(loginBody.get("returnto")).toBe("/")
    expect(loginBody.get("login")).toBe("Login")

    const searchRequest = requests[2]
    expect(searchRequest?.url).toBe(
      "https://pretome.info/browse.php?st=1&search=PreToMe%20Movie&cat[]=19&tags=&tf=all",
    )
    expect(new Headers(searchRequest?.init?.headers).get("cookie")).toBe(
      "pretome_landing=abc; pretome_session=xyz",
    )
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "PreToMe Movie 2026 720p WEB-DL",
      downloadUrl: "https://pretome.info/download.php?id=151",
      infoUrl: "https://pretome.info/details.php?id=151",
      category: "2040",
      size: 6_400_000_000,
      seeders: 41,
      leechers: 3,
      indexerId: 106,
      indexerName: "PreToMe",
      indexerPriority: 42,
      downloadFactor: 0,
      uploadFactor: 1,
    })
  })

  it("parses RetroFlix SpeedApp JSON results with bearer auth", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(RETROFLIX_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 93,
      name: "RetroFlix",
      type: "cardigann_yaml",
      definitionKey: "retroflix",
      baseUrl: "https://retroflix.club/",
      apiKey: "retro-token",
      priority: 29,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "Retro Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt7654321",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe(
      "https://retroflix.club/api/torrent?itemsPerPage=100&sort=torrent.createdAt&direction=desc&imdbId=tt7654321&categories[]=401",
    )
    expect(new Headers(request?.init?.headers).get("authorization")).toBe("Bearer retro-token")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "Retro Movie 1976 1080p BluRay",
      downloadUrl: "https://retroflix.club/api/torrent/321/download",
      infoUrl: "https://retroflix.club/torrent/321",
      category: "2000",
      size: 1_234_000_000,
      seeders: 19,
      leechers: 3,
      indexerId: 93,
      indexerName: "RetroFlix",
      indexerPriority: 29,
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-09T08:30:00.000Z")
  })

  it("parses SpeedApp JSON results with bearer auth and category fan-out", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(SPEEDAPP_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 94,
      name: "SpeedApp.io",
      type: "cardigann_yaml",
      definitionKey: "speedapp",
      baseUrl: "https://speedapp.io/",
      apiKey: "speed-token",
      priority: 30,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "SpeedApp Movie",
        type: "movie",
        categories: [2040],
        imdbId: "tt2468135",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe(
      "https://speedapp.io/api/torrent?itemsPerPage=100&sort=torrent.createdAt&direction=desc&imdbId=tt2468135&categories[]=8&categories[]=29",
    )
    expect(new Headers(request?.init?.headers).get("authorization")).toBe("Bearer speed-token")
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "SpeedApp Movie 2026 1080p WEB-DL",
      downloadUrl: "https://speedapp.io/api/torrent/812/download",
      infoUrl: "https://speedapp.io/torrent/812",
      category: "2040",
      size: 4_321_000_000,
      seeders: 35,
      leechers: 7,
      indexerId: 94,
      indexerName: "SpeedApp.io",
      indexerPriority: 30,
      downloadFactor: 1,
      uploadFactor: 2,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T06:15:00.000Z")
  })

  it("parses BeyondHD JSON POST results with API and RSS keys", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      return new Response(BEYONDHD_JSON_RESULTS, { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const adapter = createCardigannYamlAdapter({
      id: 95,
      name: "BeyondHD",
      type: "cardigann_yaml",
      definitionKey: "beyond-hd",
      baseUrl: "https://beyond-hd.me/",
      apiKey: "bhd-api-key",
      configValues: {
        rssKey: "bhd-rss-key",
        freeleechOnly: "true",
        limitedOnly: "false",
        refundOnly: "false",
        rewindOnly: "false",
      },
      priority: 31,
      categories: [],
      protocol: "torrent",
    })

    const releases = await Effect.runPromise(
      adapter.search({
        term: "BeyondHD Movie",
        type: "movie",
        categories: [2000],
        imdbId: "tt1357911",
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = requests[0]
    expect(request?.url).toBe("https://beyond-hd.me/api/torrents/bhd-api-key")
    expect(request?.init?.method).toBe("POST")
    expect(new Headers(request?.init?.headers).get("content-type")).toBe("application/json")
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      action: "search",
      rsskey: "bhd-rss-key",
      freeleech: 1,
      imdb_id: "tt1357911",
      search: "BeyondHD Movie",
      categories: [1],
    })
    expect(releases).toHaveLength(1)
    expect(releases[0]).toMatchObject({
      title: "BeyondHD Movie 2026 1080p WEB-DL",
      downloadUrl: "https://beyond-hd.me/download/9001",
      infoUrl: "https://beyond-hd.me/torrents/9001",
      category: "2000",
      size: 5_678_000_000,
      seeders: 42,
      leechers: 4,
      indexerId: 95,
      indexerName: "BeyondHD",
      indexerPriority: 31,
      infohash: "abcdef1234567890",
      downloadFactor: 0,
      uploadFactor: 1,
    })
    expect(releases[0]?.publishedAt.toISOString()).toBe("2026-05-10T07:45:00.000Z")
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
