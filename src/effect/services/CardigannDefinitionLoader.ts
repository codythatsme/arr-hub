import { load } from "js-yaml"

import { CATEGORIES } from "../domain/categories"
import type {
  IndexerAuthField,
  IndexerAuthFieldOption,
  IndexerAuthFieldType,
  IndexerCategoryMapping,
  IndexerCapabilities,
  IndexerDefinitionSeed,
  IndexerPrivacy,
  IndexerProtocol,
} from "../domain/indexer"

export type CardigannResponseType = "html" | "json" | "xml" | "torznab" | "newznab" | "rss"

export interface CardigannSearchPath {
  readonly path: string
  readonly method: "get" | "post"
  readonly inheritInputs: boolean
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly body?: string
  readonly categories: ReadonlyArray<string>
  readonly responseType: CardigannResponseType
  readonly noResultsMessage?: string
}

export interface CardigannLoginPath {
  readonly path: string
  readonly method: "get" | "post"
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
}

export interface CardigannLoginError {
  readonly selector?: string
  readonly message?: CardigannFieldSelector
}

export interface CardigannLoginTest {
  readonly path?: string
  readonly selector: string
}

export interface CardigannLoginCaptcha {
  readonly type?: string
  readonly selector?: string
  readonly input?: string
}

export interface CardigannFilter {
  readonly name: string
  readonly args: ReadonlyArray<string>
}

export interface CardigannRowsSelector {
  readonly selector: string
  readonly attribute?: string
  readonly before?: number
  readonly after?: number
  readonly count?: CardigannFieldSelector
  readonly multiple?: boolean
  readonly missingAttributeEqualsNoResults?: boolean
  readonly filters: ReadonlyArray<CardigannFilter>
  readonly dateHeaders?: CardigannFieldSelector
}

export interface CardigannFieldSelector {
  readonly selector?: string
  readonly attribute?: string
  readonly text?: string
  readonly remove?: string
  readonly case?: Readonly<Record<string, string>>
  readonly defaultValue?: string
  readonly optional: boolean
  readonly filters: ReadonlyArray<CardigannFilter>
}

export interface CardigannSearchRuntime {
  readonly allowEmptyInputs: boolean
  readonly keywordFilters: ReadonlyArray<CardigannFilter>
  readonly preprocessingFilters: ReadonlyArray<CardigannFilter>
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly rows: CardigannRowsSelector | null
  readonly fields: Readonly<Record<string, CardigannFieldSelector>>
  readonly paths: ReadonlyArray<CardigannSearchPath>
}

export interface CardigannLoginRuntime {
  readonly method: "get" | "post" | "cookie" | "oneurl" | "form"
  readonly inputs: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
  readonly cookies: ReadonlyArray<string>
  readonly errors: ReadonlyArray<CardigannLoginError>
  readonly paths: ReadonlyArray<CardigannLoginPath>
  readonly selectors?: boolean
  readonly selectorInputs?: Readonly<Record<string, CardigannFieldSelector>>
  readonly getSelectorInputs?: Readonly<Record<string, CardigannFieldSelector>>
  readonly test?: CardigannLoginTest
  readonly captcha?: CardigannLoginCaptcha
  readonly form?: string
  readonly submitPath?: string
}

export interface CardigannRuntimeDefinition {
  readonly definitionKey: string
  readonly displayName: string
  readonly protocol: IndexerProtocol
  readonly baseUrl: string | null
  readonly authFields: ReadonlyArray<IndexerAuthField>
  readonly categories: ReadonlyArray<IndexerCategoryMapping>
  readonly capabilities: IndexerCapabilities
  readonly login: CardigannLoginRuntime | null
  readonly search: CardigannSearchRuntime
}

const PUBLIC_DOMAIN_MOVIE_TORRENTS = `
id: public-domain-movie-torrents
name: Public Domain Movie Torrents
description: Public-domain movie releases exposed through a Cardigann-style definition.
type: public
links:
  - https://publicdomainmovie.example
version: builtin-cardigann-1
tags:
  - public
  - movies
settings:
  - name: apiKey
    label: API key
    type: password
    required: false
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
  modes:
    search: [q]
    movie-search: [q, imdbid]
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tmdbid: "{{ .Query.TMDBID }}"
        limit: "{{ .Query.Limit }}"
`

const OPEN_TV_TORRENTS = `
id: open-tv-torrents
name: Open TV Torrents
description: Public TV releases exposed through a Cardigann-style definition.
type: public
links:
  - https://opentv.example
version: builtin-cardigann-1
tags:
  - public
  - tv
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: false
caps:
  categorymappings:
    - id: tv
      cat: TV
      desc: TV
    - id: tv-hd
      cat: TV/HD
      desc: TV HD
  modes:
    search: [q]
    tv-search: [q, season, ep, imdbid]
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tvdbid: "{{ .Query.TVDBID }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const NYAA = `
id: nyaa
name: Nyaa
description: Public anime BitTorrent releases exposed through the Nyaa RSS feed.
type: public
links:
  - https://nyaa.si/
version: builtin-cardigann-1
tags:
  - public
  - anime
  - rss
caps:
  categorymappings:
    - id: 1_2
      cat: anime
      desc: Anime English-translated
      newznab: 5070
    - id: 1_4
      cat: anime
      desc: Anime Raw
      newznab: 5070
  modes:
    search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: /
      response:
        type: rss
      inputs:
        page: rss
        q: "{{ .Keywords }}"
        f: "0"
        c: "0_0"
`

const ANIME_TOSHO = `
id: animetosho
name: AnimeTosho
description: Public anime Torznab-compatible feed mirrored through a Cardigann-style definition.
type: public
links:
  - https://feed.animetosho.org
version: builtin-cardigann-1
tags:
  - public
  - anime
  - torznab
caps:
  categorymappings:
    - id: anime
      cat: anime
      desc: Anime
      newznab: 5070
    - id: anime-movie
      cat: movies
      desc: Anime Movies
      newznab: 2020
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const ANIME_TORRENTS = `
id: animetorrents
name: AnimeTorrents
description: Private anime and manga tracker exposed through a first-pass cookie-auth AJAX HTML Cardigann definition.
type: private
links:
  - https://animetorrents.me/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - anime
  - movies
  - tv
  - music
  - books
  - html
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: true
    helpText: AnimeTorrents browser session cookie.
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Show gold freeleech torrents only.
  - name: downloadableOnly
    label: Downloadable only
    type: checkbox
    default: false
    helpText: Search downloadable torrents only.
caps:
  categorymappings:
    - id: "1"
      cat: Movies/SD
      desc: Anime Movie
      newznab: 2030
    - id: "6"
      cat: Movies/HD
      desc: Anime Movie HD
      newznab: 2040
    - id: "2"
      cat: TV/Anime
      desc: Anime Series
      newznab: 5070
    - id: "7"
      cat: TV/Anime
      desc: Anime Series HD
      newznab: 5070
    - id: "5"
      cat: XXX/DVD
      desc: Hentai (censored)
      newznab: 6010
    - id: "9"
      cat: XXX/DVD
      desc: Hentai (censored) HD
      newznab: 6010
    - id: "4"
      cat: XXX/DVD
      desc: Hentai (un-censored)
      newznab: 6010
    - id: "8"
      cat: XXX/DVD
      desc: Hentai (un-censored) HD
      newznab: 6010
    - id: "13"
      cat: Books/Foreign
      desc: Light Novel
      newznab: 7060
    - id: "3"
      cat: Books/Comics
      desc: Manga
      newznab: 7030
    - id: "10"
      cat: Books/Comics
      desc: Manga 18+
      newznab: 7030
    - id: "11"
      cat: TV/Anime
      desc: OVA
      newznab: 5070
    - id: "12"
      cat: TV/Anime
      desc: OVA HD
      newznab: 5070
    - id: "14"
      cat: Books/Comics
      desc: Doujin Anime
      newznab: 7030
    - id: "15"
      cat: XXX/DVD
      desc: Doujin Anime 18+
      newznab: 6010
    - id: "16"
      cat: Audio/Foreign
      desc: Doujin Music
      newznab: 3060
    - id: "17"
      cat: Books/Comics
      desc: Doujinshi
      newznab: 7030
    - id: "18"
      cat: Books/Comics
      desc: Doujinshi 18+
      newznab: 7030
    - id: "19"
      cat: Audio
      desc: OST
      newznab: 3000
    - id: "20"
      cat: Audio/Audiobook
      desc: Audiobooks
      newznab: 3030
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
    music-search: [q]
    book-search: [q]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: 'ajax/torrents_data.php?total=100&cat={{ if .Categories }}{{ .Categories | join "," }}{{ else }}0{{ end }}&searchin=filename&search={{ re_replace .Keywords "[\\W]+" "%" | urlencode }}&page=1{{ if .Config.DownloadableOnly }}&dlable=1{{ end }}'
      response:
        type: html
      headers:
        X-Requested-With: XMLHttpRequest
        Referer: '{{ .Config.sitelink }}torrents.php?cat={{ if .Categories }}{{ .Categories | join "," }}{{ else }}0{{ end }}{{ if .Config.DownloadableOnly }}&dlable=1{{ end }}'
  rows:
    selector: 'table tr:has(td:nth-of-type(2) a:nth-of-type(1)){{ if .Config.FreeleechOnly }}:has(img[alt="Gold Torrent"]){{ end }}'
  fields:
    title:
      selector: td:nth-of-type(2) a:nth-of-type(1)
    details:
      selector: td:nth-of-type(2) a:nth-of-type(1)
      attribute: href
    download:
      selector: td:nth-of-type(3) a
      attribute: href
    category:
      selector: td:nth-of-type(1) a
      attribute: href
      filters:
        - name: querystring
          args: cat
    date:
      selector: td:nth-of-type(5)
      filters:
        - name: dateparse
          args: "dd MMM yy"
    size:
      selector: td:nth-of-type(6)
    grabs:
      selector: td:nth-of-type(8)
      filters:
        - name: split
          args: ["/", "2"]
    seeders:
      selector: td:nth-of-type(8)
      filters:
        - name: split
          args: ["/", "0"]
    leechers:
      selector: td:nth-of-type(8)
      filters:
        - name: split
          args: ["/", "1"]
    downloadvolumefactor:
      case:
        'img[alt="Gold Torrent"]': "0"
        'img[alt="Silver Torrent"]': "0.5"
        tr: "1"
    uploadvolumefactor:
      selector: 'img[alt*="x Multiplier Torrent"]'
      attribute: alt
      optional: true
      filters:
        - name: regexp
          args: '^([0-9.]+)x'
`

const BAKABT = `
id: bakabt
name: BakaBT
description: Private anime community tracker exposed through a first-pass form-login HTML Cardigann definition.
type: private
links:
  - https://bakabt.me/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - anime
  - movies
  - tv
  - music
  - books
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Show freeleech torrents only.
  - name: adultContent
    label: Adult content
    type: checkbox
    default: false
    helpText: Include adult content when the account is allowed to view it.
caps:
  categorymappings:
    - id: "1"
      cat: TV/Anime
      desc: Anime Series
      newznab: 5070
    - id: "2"
      cat: TV/Anime
      desc: OVA
      newznab: 5070
    - id: "3"
      cat: Audio/Other
      desc: Soundtrack
      newznab: 3050
    - id: "4"
      cat: Books/Comics
      desc: Manga
      newznab: 7030
    - id: "5"
      cat: Movies
      desc: Anime Movie
      newznab: 2000
    - id: "6"
      cat: TV/Other
      desc: Live Action
      newznab: 5050
    - id: "7"
      cat: Books/Other
      desc: Artbook
      newznab: 7050
    - id: "8"
      cat: Audio/Video
      desc: Music Video
      newznab: 3020
    - id: "9"
      cat: Books/EBook
      desc: Light Novel
      newznab: 7020
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
    music-search: [q]
    book-search: [q]
login:
  method: form
  path: login.php
  form: form#loginForm, form[action*="login.php"], form
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
    returnto: "/index.php"
  error:
    - selector: '#loginError, .error'
search:
  keywordsfilters:
    - name: re_replace
      args: ["\\\\s(?:[Ee]\\\\d+|\\\\d+)$", ""]
    - name: trim
  paths:
    - path: 'browse.php?only=0{{ if .Config.AdultContent }}&hentai=1{{ end }}&incomplete=1&lossless=1&hd=1&multiaudio=1&bonus=1&reorder=1&q={{ .Keywords | urlencode }}'
      response:
        type: html
  rows:
    selector: 'tr.torrent{{ if .Config.FreeleechOnly }}:has(span.freeleech){{ end }}, tr.torrent_alt{{ if .Config.FreeleechOnly }}:has(span.freeleech){{ end }}'
  fields:
    title:
      selector: a.title, a.alt_title
      filters:
        - name: split
          args: ["|", "-1"]
        - name: trim
    details:
      selector: a.title, a.alt_title
      attribute: href
    download:
      selector: '.peers a:nth-of-type(1)'
      attribute: href
    categorydesc:
      selector: td.category span
      attribute: title
    date:
      selector: .added
      filters:
        - name: replace
          args: ["'", ""]
        - name: dateparse
          args: "dd MMM yy"
    size:
      selector: .size
    grabs:
      selector: .peers
      filters:
        - name: split
          args: ["/", "0"]
    seeders:
      selector: .peers
      filters:
        - name: split
          args: ["/", "1"]
    leechers:
      selector: .peers
      filters:
        - name: split
          args: ["/", "2"]
    downloadvolumefactor:
      case:
        span.freeleech: "0"
        tr: "1"
    uploadvolumefactor:
      text: "1"
`

const NEBULANCE = `
id: nebulance
name: Nebulance
description: Private ratioless TV tracker exposed through a first-pass JSON-RPC Cardigann definition.
type: private
links:
  - https://nebulance.io/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - tv
  - json
  - api
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: Nebulance API key.
caps:
  categorymappings:
    - id: season
      cat: TV
      desc: Season
      newznab: 5000
    - id: episode
      cat: TV
      desc: Episode
      newznab: 5000
    - id: "2"
      cat: TV/SD
      desc: TV SD
      newznab: 5030
    - id: "3"
      cat: TV/HD
      desc: TV HD
      newznab: 5040
    - id: "4"
      cat: TV/UHD
      desc: TV UHD
      newznab: 5045
  modes:
    search: [q]
    tv-search: [q, season, ep, imdbid]
search:
  paths:
    - path: api.php
      method: post
      response:
        type: json
      headers:
        content-type: application/json
      body: |
        {"jsonrpc":"2.0","method":"getTorrents","params":["{{ .Config.APIKey | jsonescape }}",{"age":">0"{{ if .Keywords }},"release":"{{ .Keywords | jsonescape }}"{{ end }}{{ if .Query.IMDBID }},"imdb":"{{ .Query.IMDBID | jsonescape }}"{{ end }}{{ if .Query.Season }},"season":{{ .Query.Season }}{{ end }}{{ if .Query.Ep }},"episode":{{ .Query.Ep }}{{ end }}},{{ .Query.Limit | default "100" }},{{ .Query.Offset | default "0" }}],"id":1}
  rows:
    selector: $.result.items
    missingAttributeEqualsNoResults: true
  fields:
    groupid:
      selector: group_id
    title:
      selector: rls_name
    details:
      text: "torrents.php?id={{ .Result.groupid }}"
    download:
      selector: download
    category:
      selector: cat
    size:
      selector: size
    grabs:
      selector: snatch
    seeders:
      selector: seed
    leechers:
      selector: leech
    date:
      selector: rls_utc
    downloadvolumefactor:
      text: "0"
    uploadvolumefactor:
      text: "1"
`

const ANIDEX = `
id: anidex
name: Anidex
description: Public anime, manga, music, and software tracker exposed through Cardigann HTML selectors.
type: public
links:
  - https://anidex.info/
version: builtin-cardigann-1
tags:
  - public
  - anime
  - html
settings:
  - name: authorisedOnly
    label: Authorised only
    type: checkbox
    default: false
    required: false
    helpText: Search authorised torrents only.
  - name: language
    label: Language
    type: select
    required: false
    helpText: Restrict searches to one Anidex language. Leave empty for all languages.
    options:
      - value: "1"
        label: English
      - value: "2"
        label: Japanese
      - value: "7"
        label: Russian
      - value: "8"
        label: German
      - value: "10"
        label: French
      - value: "15"
        label: Spanish
      - value: "21"
        label: Chinese Simplified
      - value: "28"
        label: Korean
caps:
  categorymappings:
    - id: "1"
      cat: TV/Anime
      desc: Anime - Sub
      newznab: 5070
    - id: "2"
      cat: TV/Anime
      desc: Anime - Raw
      newznab: 5070
    - id: "3"
      cat: TV/Anime
      desc: Anime - Dub
      newznab: 5070
    - id: "4"
      cat: TV/Anime
      desc: Live Action - Sub
      newznab: 5070
    - id: "5"
      cat: TV/Anime
      desc: Live Action - Raw
      newznab: 5070
    - id: "6"
      cat: Books/EBook
      desc: Light Novel
      newznab: 7020
    - id: "7"
      cat: Books/Comics
      desc: Manga - Translated
      newznab: 7030
    - id: "8"
      cat: Books/Comics
      desc: Manga - Raw
      newznab: 7030
    - id: "9"
      cat: Audio/MP3
      desc: Music - Lossy
      newznab: 3010
    - id: "10"
      cat: Audio/Lossless
      desc: Music - Lossless
      newznab: 3040
    - id: "11"
      cat: Audio/Video
      desc: Music - Video
      newznab: 3020
    - id: "12"
      cat: PC/Games
      desc: Games
      newznab: 4050
    - id: "13"
      cat: PC/0day
      desc: Applications
      newznab: 4010
    - id: "14"
      cat: XXX/ImageSet
      desc: Pictures
      newznab: 6060
    - id: "15"
      cat: XXX
      desc: Adult Video
      newznab: 6000
    - id: "16"
      cat: Other
      desc: Other
      newznab: 8000
  modes:
    search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: /
      response:
        type: html
      inputs:
        page: search
        s: upload_timestamp
        o: desc
        group_id: "0"
        q: "{{ .Keywords }}"
        id: "{{ .Categories | join ',' }}"
        a: "{{ if .Config.AuthorisedOnly }}1{{ end }}"
        lang_id: "{{ .Config.Language }}"
  rows:
    selector: div#content table > tbody > tr
  fields:
    title:
      selector: td:nth-child(3) span
      attribute: title
    details:
      selector: td:nth-child(3) a
      attribute: href
    download:
      selector: a[href^="/dl/"]
      attribute: href
    category:
      selector: td:nth-child(1) a
      attribute: href
      filters:
        - name: querystring
          args: id
    size:
      selector: td:nth-child(7)
    seeders:
      selector: td:nth-child(9)
    leechers:
      selector: td:nth-child(10)
    grabs:
      selector: td:nth-child(11)
    date:
      selector: td:nth-child(8)
      attribute: title
      filters:
        - name: dateparse
          args: yyyy-MM-dd HH:mm:ss UTC
`

const SHIZA_PROJECT = `
id: shizaproject
name: ShizaProject
description: Public Russian anime tracker and release group exposed through a first-pass GraphQL JSON Cardigann definition.
type: public
links:
  - https://shiza-project.com/
version: builtin-cardigann-1
tags:
  - public
  - anime
  - json
  - graphql
caps:
  categorymappings:
    - id: "1"
      cat: TV/Anime
      desc: TV
      newznab: 5070
    - id: "2"
      cat: TV/Anime
      desc: TV_SPECIAL
      newznab: 5070
    - id: "3"
      cat: TV/Anime
      desc: ONA
      newznab: 5070
    - id: "4"
      cat: TV/Anime
      desc: OVA
      newznab: 5070
    - id: "5"
      cat: Movies
      desc: MOVIE
      newznab: 2000
    - id: "6"
      cat: Movies
      desc: SHORT_MOVIE
      newznab: 2000
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
search:
  keywordsfilters:
    - name: re_replace
      args: ["(?:[SsEe]?\\\\d{1,4}){1,2}$", ""]
    - name: trim
  paths:
    - path: /graphql
      response:
        type: json
      inputs:
        query: 'query fetchReleases($first: Int, $query: String) { releases(first: $first, query: $query) { edges { node { name type originalName alternativeNames publishedAt slug torrents { synopsis downloaded seeders leechers size magnetUri updatedAt file { url } videoQualities } } } } }'
        variables: '{"first":50{{ if .Keywords }},"query":"{{ .Keywords | jsonescape }}"{{ end }}}'
  rows:
    selector: $.data.releases.edges
    attribute: node.torrents
    multiple: true
    missingAttributeEqualsNoResults: true
  fields:
    releasename:
      selector: ..node.name
    slug:
      selector: ..node.slug
    synopsis:
      selector: synopsis
      optional: true
    qualities:
      selector: videoQualities
      optional: true
      filters:
        - name: replace
          args: ["RESOLUTION_", ""]
        - name: replace
          args: [",", " "]
    title:
      text: "{{ .Result.releasename }} {{ .Result.synopsis }} [{{ .Result.qualities }}]"
    details:
      text: "/releases/{{ .Result.slug }}/"
    download:
      selector: file.url
    magnet:
      selector: magnetUri
      optional: true
    categorydesc:
      selector: ..node.type
    size:
      selector: size
    grabs:
      selector: downloaded
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    date:
      selector: updatedAt
    downloadvolumefactor:
      text: "0"
    uploadvolumefactor:
      text: "1"
`

const SUBSPLEASE = `
id: subsplease
name: SubsPlease
description: Public anime release feed exposed through Cardigann JSON selectors.
type: public
links:
  - https://subsplease.org/
version: builtin-cardigann-1
tags:
  - public
  - anime
  - json
caps:
  categorymappings:
    - id: "1"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "2"
      cat: Movies/Other
      desc: Anime Movies
      newznab: 2020
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: /api/
      response:
        type: json
      inputs:
        tz: UTC
        f: search
        s: "{{ .Keywords }}"
  rows:
    selector: $.*
    attribute: downloads
    multiple: true
    missingAttributeEqualsNoResults: true
  fields:
    show:
      selector: ..show
    episode:
      selector: ..episode
    page:
      selector: ..page
    resolution:
      selector: res
    title:
      text: "[SubsPlease] {{ .Result.show }} - {{ .Result.episode }} ({{ .Result.resolution }}p)"
    details:
      text: "/shows/{{ .Result.page }}/"
    magnet:
      selector: magnet
    category:
      text: "1"
    size:
      selector: magnet
      filters:
        - name: querystring
          args: xl
    seeders:
      text: "1"
    leechers:
      text: "2"
    date:
      selector: ..release_date
    downloadvolumefactor:
      text: "0"
    uploadvolumefactor:
      text: "1"
`

const TORRENTS_CSV = `
id: torrents-csv
name: TorrentsCSV
description: Public open torrent search index exposed through a JSON Cardigann definition.
type: public
links:
  - https://torrents-csv.com/
version: builtin-cardigann-1
rss: false
tags:
  - public
  - general
  - json
caps:
  categorymappings:
    - id: "1"
      cat: Other
      desc: Other
      newznab: 8000
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: /service/search
      response:
        type: json
      inputs:
        size: "100"
        q: "{{ .Keywords }}"
  rows:
    selector: $.torrents
    missingAttributeEqualsNoResults: true
  fields:
    title:
      selector: name
    details:
      text: "/search?q={{ .Result.title | urlencode }}"
    infohash:
      selector: infohash
    magnet:
      text: "magnet:?xt=urn:btih:{{ .Result.infohash }}"
    category:
      text: "1"
    size:
      selector: size_bytes
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    grabs:
      selector: completed
`

const KNABEN = `
id: knaben
name: Knaben
description: Public torrent meta-search engine exposed through a JSON POST Cardigann definition.
type: public
links:
  - https://knaben.org/
version: builtin-cardigann-1
rss: false
tags:
  - public
  - general
  - json
caps:
  categorymappings:
    - id: "1000000"
      cat: Audio
      desc: Audio
      newznab: 3000
    - id: "1001000"
      cat: Audio/MP3
      desc: MP3
      newznab: 3010
    - id: "1002000"
      cat: Audio/Lossless
      desc: Lossless
      newznab: 3040
    - id: "1003000"
      cat: Audio/Audiobook
      desc: Audiobook
      newznab: 3030
    - id: "1004000"
      cat: Audio/Video
      desc: Audio Video
      newznab: 3020
    - id: "1006000"
      cat: Audio/Other
      desc: Audio Other
      newznab: 3050
    - id: "2000000"
      cat: TV
      desc: TV
      newznab: 5000
    - id: "2001000"
      cat: TV/HD
      desc: TV HD
      newznab: 5040
    - id: "2002000"
      cat: TV/SD
      desc: TV SD
      newznab: 5030
    - id: "2003000"
      cat: TV/UHD
      desc: TV UHD
      newznab: 5045
    - id: "2004000"
      cat: TV/Documentary
      desc: Documentary
      newznab: 5080
    - id: "2005000"
      cat: TV/Foreign
      desc: TV Foreign
      newznab: 5020
    - id: "2006000"
      cat: TV/Sport
      desc: Sport
      newznab: 5060
    - id: "2008000"
      cat: TV/Other
      desc: TV Other
      newznab: 5050
    - id: "3000000"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "3001000"
      cat: Movies/HD
      desc: Movies HD
      newznab: 2040
    - id: "3002000"
      cat: Movies/SD
      desc: Movies SD
      newznab: 2030
    - id: "3003000"
      cat: Movies/UHD
      desc: Movies UHD
      newznab: 2045
    - id: "3004000"
      cat: Movies/DVD
      desc: Movies DVD
      newznab: 2070
    - id: "3005000"
      cat: Movies/Foreign
      desc: Movies Foreign
      newznab: 2010
    - id: "3007000"
      cat: Movies/3D
      desc: Movies 3D
      newznab: 2060
    - id: "3008000"
      cat: Movies/Other
      desc: Movies Other
      newznab: 2020
    - id: "4000000"
      cat: PC
      desc: PC
      newznab: 4000
    - id: "4001000"
      cat: PC/Games
      desc: Games
      newznab: 4050
    - id: "4002000"
      cat: PC/0day
      desc: Software
      newznab: 4010
    - id: "4003000"
      cat: PC/Mac
      desc: Mac
      newznab: 4030
    - id: "4004000"
      cat: PC/ISO
      desc: Unix
      newznab: 4020
    - id: "5000000"
      cat: XXX
      desc: XXX
      newznab: 6000
    - id: "5001000"
      cat: XXX/x264
      desc: XXX Video
      newznab: 6040
    - id: "5002000"
      cat: XXX/ImageSet
      desc: XXX ImageSet
      newznab: 6060
    - id: "5005000"
      cat: XXX/Other
      desc: XXX Other
      newznab: 6070
    - id: "6000000"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "6001000"
      cat: TV/Anime
      desc: Anime Subbed
      newznab: 5070
    - id: "6002000"
      cat: TV/Anime
      desc: Anime Dubbed
      newznab: 5070
    - id: "6004000"
      cat: TV/Anime
      desc: Anime Raw
      newznab: 5070
    - id: "7000000"
      cat: Console
      desc: Console
      newznab: 1000
    - id: "7001000"
      cat: Console/PS4
      desc: PS4
      newznab: 1180
    - id: "7002000"
      cat: Console/PS3
      desc: PS3
      newznab: 1080
    - id: "7005000"
      cat: Console/PS Vita
      desc: PS Vita
      newznab: 1120
    - id: "7006000"
      cat: Console/PSP
      desc: PSP
      newznab: 1020
    - id: "7007000"
      cat: Console/Xbox 360
      desc: Xbox 360
      newznab: 1050
    - id: "7008000"
      cat: Console/Xbox
      desc: Xbox
      newznab: 1040
    - id: "7010000"
      cat: Console/NDS
      desc: NDS
      newznab: 1010
    - id: "7011000"
      cat: Console/Wii
      desc: Wii
      newznab: 1030
    - id: "7012000"
      cat: Console/WiiU
      desc: WiiU
      newznab: 1130
    - id: "7013000"
      cat: Console/3DS
      desc: 3DS
      newznab: 1110
    - id: "7015000"
      cat: Console/Other
      desc: Console Other
      newznab: 1090
    - id: "8000000"
      cat: PC/Phone-Other
      desc: Mobile
      newznab: 4040
    - id: "8001000"
      cat: PC/Phone-Android
      desc: Android
      newznab: 4070
    - id: "8002000"
      cat: PC/Phone-IOS
      desc: IOS
      newznab: 4060
    - id: "9000000"
      cat: Books
      desc: Books
      newznab: 7000
    - id: "9001000"
      cat: Books/EBook
      desc: EBooks
      newznab: 7020
    - id: "9002000"
      cat: Books/Comics
      desc: Comics
      newznab: 7030
    - id: "9003000"
      cat: Books/Mags
      desc: Magazines
      newznab: 7010
    - id: "9004000"
      cat: Books/Technical
      desc: Technical
      newznab: 7040
    - id: "9005000"
      cat: Books/Other
      desc: Books Other
      newznab: 7050
    - id: "10000000"
      cat: Other
      desc: Other
      newznab: 8000
    - id: "10001000"
      cat: Other/Misc
      desc: Other Misc
      newznab: 8010
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
search:
  paths:
    - path: https://api.knaben.org/v1
      method: post
      response:
        type: json
      headers:
        content-type: application/json
      body: |
        {"order_by":"date","order_direction":"desc","from":0,"size":100,"hide_unsafe":true{{ if .Keywords }},"search_type":"100%","search_field":"title","query":"{{ .Keywords | jsonescape }}"{{ end }}{{ if .Categories }},"categories":[{{ .Categories | join "," }}]{{ end }}}
  rows:
    selector: $.hits
    missingAttributeEqualsNoResults: true
  fields:
    title:
      selector: title
    details:
      selector: details
    download:
      selector: link
      optional: true
    magnet:
      selector: magnetUrl
      optional: true
    infohash:
      selector: hash
    category:
      selector: categoryId[0]
    size:
      selector: bytes
    seeders:
      selector: seeders
    leechers:
      selector: peers
    date:
      selector: date
    downloadvolumefactor:
      text: "0"
    uploadvolumefactor:
      text: "1"
`

const TORRENT_DAY = `
id: torrentday
name: TorrentDay
description: Private TV, movie, and general tracker exposed through a first-pass JSON Cardigann definition.
type: private
links:
  - https://tday.love/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - json
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: true
    helpText: TorrentDay browser session cookie.
  - name: freeleechOnly
    label: FreeLeech Only
    type: checkbox
    required: false
    default: false
    helpText: Search freeleech torrents only.
caps:
  categorymappings:
    - id: "25"
      cat: Movies/SD
      desc: Movies/480p
      newznab: 2030
      default: true
    - id: "96"
      cat: Movies/UHD
      desc: Movie/4K
      newznab: 2045
      default: true
    - id: "11"
      cat: Movies/BluRay
      desc: Movies/Bluray
      newznab: 2050
      default: true
    - id: "5"
      cat: Movies/BluRay
      desc: Movies/Bluray-Full
      newznab: 2050
      default: true
    - id: "103"
      cat: Movies/SD
      desc: Movies/Cam
      newznab: 2030
      default: true
    - id: "3"
      cat: Movies/DVD
      desc: Movies/DVD-R
      newznab: 2070
      default: true
    - id: "21"
      cat: Movies/SD
      desc: Movies/MP4
      newznab: 2030
      default: true
    - id: "22"
      cat: Movies/Foreign
      desc: Movies/Non-English
      newznab: 2010
      default: true
    - id: "13"
      cat: Movies
      desc: Movies/Packs
      newznab: 2000
      default: true
    - id: "44"
      cat: Movies/SD
      desc: Movies/SD/x264
      newznab: 2030
      default: true
    - id: "48"
      cat: Movies
      desc: Movies/x265
      newznab: 2000
      default: true
    - id: "1"
      cat: Movies/SD
      desc: Movies/XviD
      newznab: 2030
      default: true
    - id: "24"
      cat: TV/SD
      desc: TV/480p
      newznab: 5030
      default: true
    - id: "104"
      cat: TV/UHD
      desc: TV/4K
      newznab: 5045
      default: true
    - id: "32"
      cat: TV/HD
      desc: TV/Bluray
      newznab: 5040
      default: true
    - id: "31"
      cat: TV/SD
      desc: TV/DVD-R
      newznab: 5030
      default: true
    - id: "33"
      cat: TV/SD
      desc: TV/DVD-Rip
      newznab: 5030
      default: true
    - id: "46"
      cat: TV/SD
      desc: TV/Mobile
      newznab: 5030
      default: true
    - id: "82"
      cat: TV/Foreign
      desc: TV/Non-English
      newznab: 5020
      default: true
    - id: "14"
      cat: TV
      desc: TV/Packs
      newznab: 5000
      default: true
    - id: "26"
      cat: TV/SD
      desc: TV/SD/x264
      newznab: 5030
      default: true
    - id: "7"
      cat: TV/HD
      desc: TV/x264
      newznab: 5040
      default: true
    - id: "34"
      cat: TV/HD
      desc: TV/x265
      newznab: 5040
      default: true
    - id: "2"
      cat: TV/SD
      desc: TV/XviD
      newznab: 5030
      default: true
    - id: "10"
      cat: Console/NDS
      desc: Nintendo
      newznab: 1010
      default: true
    - id: "4"
      cat: PC/Games
      desc: PC/Games
      newznab: 4050
      default: true
    - id: "18"
      cat: Console/PS3
      desc: PS
      newznab: 1080
      default: true
    - id: "8"
      cat: Console/PSP
      desc: PSP
      newznab: 1020
      default: true
    - id: "9"
      cat: Console/Xbox
      desc: Xbox
      newznab: 1040
      default: true
    - id: "17"
      cat: Audio/MP3
      desc: Music/Audio
      newznab: 3010
      default: true
    - id: "27"
      cat: Audio/Lossless
      desc: Music/Flac
      newznab: 3040
      default: true
    - id: "23"
      cat: Audio/Foreign
      desc: Music/Non-English
      newznab: 3060
      default: true
    - id: "41"
      cat: Audio
      desc: Music/Packs
      newznab: 3000
      default: true
    - id: "16"
      cat: Audio/Video
      desc: Music/Video
      newznab: 3020
      default: true
    - id: "29"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
      default: true
    - id: "42"
      cat: Audio/Audiobook
      desc: Audio Books
      newznab: 3030
      default: true
    - id: "20"
      cat: Books
      desc: Books
      newznab: 7000
      default: true
    - id: "102"
      cat: Books/Foreign
      desc: Books/Non-English
      newznab: 7060
      default: true
    - id: "30"
      cat: TV/Documentary
      desc: Documentary
      newznab: 5080
      default: true
    - id: "95"
      cat: TV/Documentary
      desc: Educational
      newznab: 5080
      default: true
    - id: "47"
      cat: Other
      desc: Fonts
      newznab: 8000
      default: true
    - id: "43"
      cat: PC/Mac
      desc: Mac
      newznab: 4030
      default: true
    - id: "45"
      cat: Audio/Other
      desc: Podcast
      newznab: 3050
      default: true
    - id: "28"
      cat: PC
      desc: Softwa/Packs
      newznab: 4000
      default: true
    - id: "12"
      cat: PC
      desc: Software
      newznab: 4000
      default: true
    - id: "19"
      cat: XXX
      desc: XXX/0Day
      newznab: 6000
      default: true
    - id: "6"
      cat: XXX
      desc: XXX/Movies
      newznab: 6000
      default: true
    - id: "15"
      cat: XXX/Pack
      desc: XXX/Packs
      newznab: 6050
      default: true
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: 't.json?{{ .Categories | join ";" }}{{ if .Config.FreeleechOnly }};free{{ end }};q={{ if .Query.IMDBID }}{{ .Query.IMDBID | urlencode }}%20{{ end }}{{ .Keywords | urlencode }}'
      response:
        type: json
  rows:
    selector: $.*
    missingAttributeEqualsNoResults: true
  fields:
    id:
      selector: t
    title:
      selector: name
    details:
      text: details.php?id={{ .Result.id }}
    download:
      text: download.php/{{ .Result.id }}/{{ .Result.id }}.torrent
    category:
      selector: c
    size:
      selector: size
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    date:
      selector: ctime
      filters:
        - name: unixtime
    downloadvolumefactor:
      selector: '["download-multiplier"]'
      default: "1"
    uploadvolumefactor:
      text: "1"
`

const IP_TORRENTS = `
id: iptorrents
name: IPTorrents
description: Private general tracker exposed through a first-pass cookie-auth HTML Cardigann definition.
type: private
links:
  - https://iptorrents.com/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - html
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: true
    helpText: IPTorrents browser session cookie.
  - name: userAgent
    label: User-Agent
    type: text
    required: true
    helpText: Browser user-agent used with the captured cookie.
  - name: freeleechOnly
    label: FreeLeech Only
    type: checkbox
    required: false
    default: false
    helpText: Search freeleech torrents only.
caps:
  categorymappings:
    - id: "72"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "87"
      cat: Movies/3D
      desc: Movie/3D
      newznab: 2060
    - id: "77"
      cat: Movies/SD
      desc: Movie/480p
      newznab: 2030
    - id: "101"
      cat: Movies/UHD
      desc: Movie/4K
      newznab: 2045
    - id: "89"
      cat: Movies/HD
      desc: Movie/BD-R
      newznab: 2040
    - id: "90"
      cat: Movies/SD
      desc: Movie/BD-Rip
      newznab: 2030
    - id: "96"
      cat: Movies/SD
      desc: Movie/Cam
      newznab: 2030
    - id: "6"
      cat: Movies/DVD
      desc: Movie/DVD-R
      newznab: 2070
    - id: "48"
      cat: Movies/BluRay
      desc: Movie/HD/Bluray
      newznab: 2050
    - id: "54"
      cat: Movies
      desc: Movie/Kids
      newznab: 2000
    - id: "62"
      cat: Movies/SD
      desc: Movie/MP4
      newznab: 2030
    - id: "38"
      cat: Movies/Foreign
      desc: Movie/Non-English
      newznab: 2010
    - id: "68"
      cat: Movies
      desc: Movie/Packs
      newznab: 2000
    - id: "20"
      cat: Movies/WEB-DL
      desc: Movie/Web-DL
      newznab: 2080
    - id: "7"
      cat: Movies/SD
      desc: Movie/Xvid
      newznab: 2030
    - id: "100"
      cat: Movies
      desc: Movie/x265
      newznab: 2000
    - id: "73"
      cat: TV
      desc: TV
      newznab: 5000
    - id: "26"
      cat: TV/Documentary
      desc: TV/Documentaries
      newznab: 5080
    - id: "55"
      cat: TV/Sport
      desc: Sports
      newznab: 5060
    - id: "78"
      cat: TV/SD
      desc: TV/480p
      newznab: 5030
    - id: "23"
      cat: TV/HD
      desc: TV/BD
      newznab: 5040
    - id: "24"
      cat: TV/SD
      desc: TV/DVD-R
      newznab: 5030
    - id: "25"
      cat: TV/SD
      desc: TV/DVD-Rip
      newznab: 5030
    - id: "66"
      cat: TV/SD
      desc: TV/Mobile
      newznab: 5030
    - id: "82"
      cat: TV/Foreign
      desc: TV/Non-English
      newznab: 5020
    - id: "65"
      cat: TV
      desc: TV/Packs
      newznab: 5000
    - id: "83"
      cat: TV/Foreign
      desc: TV/Packs/Non-English
      newznab: 5020
    - id: "79"
      cat: TV/SD
      desc: TV/SD/x264
      newznab: 5030
    - id: "22"
      cat: TV/HD
      desc: TV/Web-DL
      newznab: 5040
    - id: "5"
      cat: TV/HD
      desc: TV/x264
      newznab: 5040
    - id: "99"
      cat: TV/HD
      desc: TV/x265
      newznab: 5040
    - id: "4"
      cat: TV/SD
      desc: TV/Xvid
      newznab: 5030
    - id: "74"
      cat: Console
      desc: Games
      newznab: 1000
    - id: "2"
      cat: Console/Other
      desc: Games/Mixed
      newznab: 1090
    - id: "47"
      cat: Console/NDS
      desc: Games/Nintendo DS
      newznab: 1010
    - id: "43"
      cat: PC/ISO
      desc: Games/PC-ISO
      newznab: 4020
    - id: "45"
      cat: PC/Games
      desc: Games/PC-Rip
      newznab: 4050
    - id: "71"
      cat: Console/PS3
      desc: Games/PS3
      newznab: 1080
    - id: "50"
      cat: Console/Wii
      desc: Games/Wii
      newznab: 1030
    - id: "44"
      cat: Console/Xbox 360
      desc: Games/Xbox-360
      newznab: 1050
    - id: "75"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "3"
      cat: Audio/MP3
      desc: Music/Audio
      newznab: 3010
    - id: "80"
      cat: Audio/Lossless
      desc: Music/Flac
      newznab: 3040
    - id: "93"
      cat: Audio
      desc: Music/Packs
      newznab: 3000
    - id: "37"
      cat: Audio/Video
      desc: Music/Video
      newznab: 3020
    - id: "21"
      cat: Audio/Video
      desc: Podcast
      newznab: 3020
    - id: "76"
      cat: Other
      desc: Other/Miscellaneous
      newznab: 8000
    - id: "60"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "1"
      cat: PC/0day
      desc: Appz
      newznab: 4010
    - id: "86"
      cat: PC/0day
      desc: Appz/Non-English
      newznab: 4010
    - id: "64"
      cat: Audio/Audiobook
      desc: AudioBook
      newznab: 3030
    - id: "35"
      cat: Books
      desc: Books
      newznab: 7000
    - id: "102"
      cat: Books
      desc: Books/Non-English
      newznab: 7000
    - id: "94"
      cat: Books/Comics
      desc: Books/Comics
      newznab: 7030
    - id: "95"
      cat: Books/Other
      desc: Books/Educational
      newznab: 7050
    - id: "98"
      cat: Other
      desc: Other/Fonts
      newznab: 8000
    - id: "69"
      cat: PC/Mac
      desc: Appz/Mac
      newznab: 4030
    - id: "92"
      cat: Books/Mags
      desc: Books/Magazines & Newspapers
      newznab: 7010
    - id: "58"
      cat: PC/Phone-Other
      desc: Appz/Mobile
      newznab: 4040
    - id: "36"
      cat: Other
      desc: Other/Pics/Wallpapers
      newznab: 8000
    - id: "88"
      cat: XXX
      desc: XXX
      newznab: 6000
    - id: "85"
      cat: XXX/Other
      desc: XXX/Magazines
      newznab: 6070
    - id: "8"
      cat: XXX
      desc: XXX/Movie
      newznab: 6000
    - id: "81"
      cat: XXX
      desc: XXX/Movie/0Day
      newznab: 6000
    - id: "91"
      cat: XXX/Pack
      desc: XXX/Packs
      newznab: 6050
    - id: "84"
      cat: XXX/ImageSet
      desc: XXX/Pics/Wallpapers
      newznab: 6060
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: 't?{{ if .Categories }}{{ .Categories | join "=&" }}=&{{ end }}{{ if .Config.FreeleechOnly }}free=on&{{ end }}{{ if .Query.IMDBID }}q=%2B%28{{ .Query.IMDBID | urlencode }}%29&qf=all&{{ end }}{{ if .Keywords }}q=%2B%28{{ .Keywords | urlencode }}%29{{ end }}'
      response:
        type: html
      headers:
        User-Agent: "{{ .Config.UserAgent }}"
  rows:
    selector: table#torrents > tbody > tr
  fields:
    title:
      selector: a.hv
    details:
      selector: a.hv
      attribute: href
    download:
      selector: a[href^="/download.php/"]
      attribute: href
    category:
      selector: td:nth-of-type(1) a[href^="?"]
      attribute: href
      filters:
        - name: replace
          args: ["?", ""]
    size:
      selector: td:nth-of-type(6)
    seeders:
      selector: td:nth-of-type(9)
    leechers:
      selector: td:nth-of-type(10)
    date:
      selector: div.sub
      filters:
        - name: regexp
          args: '(?:^|\\|)\\s*([^|]*?(?:ago|yesterday|today|now))\\s+by'
        - name: reltime
    downloadvolumefactor:
      selector: span.free
      default: "1"
      case:
        span.free: "0"
    uploadvolumefactor:
      text: "1"
`

const RETRO_FLIX = `
id: retroflix
name: RetroFlix
description: Private classic movie, TV, and general tracker exposed through a first-pass SpeedApp JSON Cardigann definition.
type: private
links:
  - https://retroflix.club/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - tv
  - json
settings:
  - name: apiKey
    label: API token
    type: password
    required: true
    helpText: RetroFlix SpeedApp bearer token.
caps:
  categorymappings:
    - id: "401"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "402"
      cat: TV
      desc: TV Series
      newznab: 5000
    - id: "406"
      cat: Audio/Video
      desc: Music Videos
      newznab: 3020
    - id: "407"
      cat: TV/Sport
      desc: Sports
      newznab: 5060
    - id: "409"
      cat: Books
      desc: Books
      newznab: 7000
    - id: "408"
      cat: Audio
      desc: HQ Audio
      newznab: 3000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
search:
  paths:
    - path: 'api/torrent?itemsPerPage=100&sort=torrent.createdAt&direction=desc{{ if .Query.IMDBID }}&imdbId={{ .Query.IMDBID | urlencode }}{{ else }}&search={{ .Keywords | urlencode }}{{ end }}{{ if .Query.Season }}&season={{ .Query.Season }}{{ end }}{{ if .Query.Ep }}&episode={{ .Query.Ep }}{{ end }}{{ if .Categories }}&categories[]={{ .Categories | join "&categories[]=" }}{{ end }}'
      response:
        type: json
      headers:
        Authorization: "Bearer {{ .Config.APIKey }}"
  rows:
    selector: $
  fields:
    id:
      selector: id
    title:
      selector: name
    details:
      selector: url
    download:
      text: "/api/torrent/{{ .Result.id }}/download"
    category:
      selector: category.id
    size:
      selector: size
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    date:
      selector: created_at
    downloadvolumefactor:
      selector: download_volume_factor
    uploadvolumefactor:
      selector: upload_volume_factor
`

const SPEED_APP = `
id: speedapp
name: SpeedApp.io
description: Romanian private movie, TV, and general tracker exposed through a first-pass SpeedApp JSON Cardigann definition.
type: private
links:
  - https://speedapp.io/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - json
settings:
  - name: apiKey
    label: API token
    type: password
    required: true
    helpText: SpeedApp bearer token.
caps:
  categorymappings:
    - id: "38"
      cat: Movies
      desc: Movie Packs
      newznab: 2000
    - id: "10"
      cat: Movies/SD
      desc: "Movies: SD"
      newznab: 2030
    - id: "35"
      cat: Movies/SD
      desc: "Movies: SD Ro"
      newznab: 2030
    - id: "8"
      cat: Movies/HD
      desc: "Movies: HD"
      newznab: 2040
    - id: "29"
      cat: Movies/HD
      desc: "Movies: HD Ro"
      newznab: 2040
    - id: "7"
      cat: Movies/DVD
      desc: "Movies: DVD"
      newznab: 2070
    - id: "2"
      cat: Movies/DVD
      desc: "Movies: DVD Ro"
      newznab: 2070
    - id: "17"
      cat: Movies/BluRay
      desc: "Movies: BluRay"
      newznab: 2050
    - id: "24"
      cat: Movies/BluRay
      desc: "Movies: BluRay Ro"
      newznab: 2050
    - id: "59"
      cat: Movies
      desc: "Movies: Ro"
      newznab: 2000
    - id: "57"
      cat: Movies/UHD
      desc: "Movies: 4K (2160p) Ro"
      newznab: 2045
    - id: "61"
      cat: Movies/UHD
      desc: "Movies: 4K (2160p)"
      newznab: 2045
    - id: "41"
      cat: TV
      desc: TV Packs
      newznab: 5000
    - id: "66"
      cat: TV
      desc: TV Packs Ro
      newznab: 5000
    - id: "45"
      cat: TV/SD
      desc: TV Episodes
      newznab: 5030
    - id: "46"
      cat: TV/SD
      desc: TV Episodes Ro
      newznab: 5030
    - id: "43"
      cat: TV/HD
      desc: TV Episodes HD
      newznab: 5040
    - id: "44"
      cat: TV/HD
      desc: TV Episodes HD Ro
      newznab: 5040
    - id: "60"
      cat: TV
      desc: TV Ro
      newznab: 5000
    - id: "11"
      cat: PC/Games
      desc: "Games: PC-ISO"
      newznab: 4050
    - id: "52"
      cat: Console
      desc: "Games: Console"
      newznab: 1000
    - id: "1"
      cat: PC/0day
      desc: Applications
      newznab: 4010
    - id: "14"
      cat: PC
      desc: "Applications: Linux"
      newznab: 4000
    - id: "37"
      cat: PC/Mac
      desc: "Applications: Mac"
      newznab: 4030
    - id: "19"
      cat: PC/Phone-Other
      desc: "Applications: Mobile"
      newznab: 4040
    - id: "62"
      cat: TV
      desc: TV Cartoons
      newznab: 5000
    - id: "3"
      cat: TV/Anime
      desc: TV Anime / Hentai
      newznab: 5070
    - id: "6"
      cat: Books/EBook
      desc: E-books
      newznab: 7020
    - id: "5"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "64"
      cat: Audio/Video
      desc: Music Video
      newznab: 3020
    - id: "18"
      cat: Other
      desc: Images
      newznab: 8000
    - id: "22"
      cat: TV/Sport
      desc: TV Sports
      newznab: 5060
    - id: "58"
      cat: TV/Sport
      desc: TV Sports Ro
      newznab: 5060
    - id: "9"
      cat: TV/Documentary
      desc: TV Documentary
      newznab: 5080
    - id: "63"
      cat: TV/Documentary
      desc: TV Documentary Ro
      newznab: 5080
    - id: "65"
      cat: Other
      desc: Tutorial
      newznab: 8000
    - id: "67"
      cat: Other/Misc
      desc: Miscellaneous
      newznab: 8010
    - id: "15"
      cat: XXX
      desc: XXX Movies
      newznab: 6000
    - id: "47"
      cat: XXX
      desc: XXX DVD
      newznab: 6000
    - id: "48"
      cat: XXX
      desc: XXX HD
      newznab: 6000
    - id: "49"
      cat: XXX/ImageSet
      desc: XXX Images
      newznab: 6060
    - id: "50"
      cat: XXX
      desc: XXX Packs
      newznab: 6000
    - id: "51"
      cat: XXX
      desc: XXX SD
      newznab: 6000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
    music-search: [q]
    book-search: [q]
search:
  paths:
    - path: 'api/torrent?itemsPerPage=100&sort=torrent.createdAt&direction=desc{{ if .Query.IMDBID }}&imdbId={{ .Query.IMDBID | urlencode }}{{ else }}&search={{ .Keywords | urlencode }}{{ end }}{{ if .Query.Season }}&season={{ .Query.Season }}{{ end }}{{ if .Query.Ep }}&episode={{ .Query.Ep }}{{ end }}{{ if .Categories }}&categories[]={{ .Categories | join "&categories[]=" }}{{ end }}'
      response:
        type: json
      headers:
        Authorization: "Bearer {{ .Config.APIKey }}"
  rows:
    selector: $
  fields:
    id:
      selector: id
    title:
      selector: name
    details:
      selector: url
    download:
      text: "/api/torrent/{{ .Result.id }}/download"
    category:
      selector: category.id
    size:
      selector: size
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    date:
      selector: created_at
    downloadvolumefactor:
      selector: download_volume_factor
    uploadvolumefactor:
      selector: upload_volume_factor
`

const BEYOND_HD = `
id: beyond-hd
name: BeyondHD
description: Private HD movie and TV tracker exposed through a first-pass JSON POST Cardigann definition.
type: private
links:
  - https://beyond-hd.me/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - tv
  - json
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: BeyondHD API key.
  - name: rssKey
    label: RSS key
    type: password
    required: true
    helpText: BeyondHD RSS key.
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Search freeleech torrents only.
  - name: limitedOnly
    label: Limited only
    type: checkbox
    default: false
    helpText: Search limited torrents only.
  - name: refundOnly
    label: Refund only
    type: checkbox
    default: false
    helpText: Search refund torrents only.
  - name: rewindOnly
    label: Rewind only
    type: checkbox
    default: false
    helpText: Search rewind torrents only.
caps:
  categorymappings:
    - id: "1"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "1"
      cat: Movies/UHD
      desc: Movies
      newznab: 2045
    - id: "1"
      cat: Movies/HD
      desc: Movies
      newznab: 2040
    - id: "1"
      cat: Movies/SD
      desc: Movies
      newznab: 2030
    - id: "2"
      cat: TV
      desc: TV
      newznab: 5000
    - id: "2"
      cat: TV/UHD
      desc: TV
      newznab: 5045
    - id: "2"
      cat: TV/HD
      desc: TV
      newznab: 5040
    - id: "2"
      cat: TV/SD
      desc: TV
      newznab: 5030
  modes:
    search: [q]
    movie-search: [q, imdbid, tmdbid]
    tv-search: [q, season, ep, imdbid]
search:
  paths:
    - path: 'api/torrents/{{ .Config.APIKey }}'
      method: post
      response:
        type: json
      headers:
        content-type: application/json
      body: |
        {"action":"search","rsskey":"{{ .Config.RssKey | jsonescape }}"{{ if .Config.FreeleechOnly }},"freeleech":1{{ end }}{{ if .Config.LimitedOnly }},"limited":1{{ end }}{{ if .Config.RefundOnly }},"refund":1{{ end }}{{ if .Config.RewindOnly }},"rewind":1{{ end }}{{ if .Query.IMDBID }},"imdb_id":"{{ .Query.IMDBID | jsonescape }}"{{ end }}{{ if .Query.TMDBID }},"tmdb_id":"movie/{{ .Query.TMDBID }}"{{ end }}{{ if .Keywords }},"search":"{{ .Keywords | jsonescape }}"{{ end }}{{ if .Categories }},"categories":[{{ .Categories | join "," }}]{{ end }}}
  rows:
    selector: $.results
  fields:
    title:
      selector: name
    details:
      selector: url
    download:
      selector: download_url
    infohash:
      selector: info_hash
    categorydesc:
      selector: category
    size:
      selector: size
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    date:
      selector: created_at
    downloadvolumefactor:
      selector: freeleech
      default: "1"
      case:
        true: "0"
    uploadvolumefactor:
      text: "1"
`

const BIT_HDTV = `
id: bit-hdtv
name: BitHDTV
description: Private HD tracker exposed through a first-pass cookie-auth HTML Cardigann definition.
type: private
links:
  - https://www.bit-hdtv.com/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - tv
  - html
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: true
    helpText: BitHDTV browser session cookie.
caps:
  categorymappings:
    - id: "1"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "2"
      cat: Movies/BluRay
      desc: Movies/Blu-ray
      newznab: 2050
    - id: "4"
      cat: TV/Documentary
      desc: Documentaries
      newznab: 5080
    - id: "6"
      cat: Audio/Lossless
      desc: HQ Audio
      newznab: 3040
    - id: "7"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "8"
      cat: Audio/Video
      desc: Music Videos
      newznab: 3020
    - id: "9"
      cat: Other
      desc: Other
      newznab: 8000
    - id: "5"
      cat: TV/Sport
      desc: Sports
      newznab: 5060
    - id: "10"
      cat: TV
      desc: TV
      newznab: 5000
    - id: "12"
      cat: TV
      desc: TV/Seasonpack
      newznab: 5000
    - id: "11"
      cat: XXX
      desc: XXX
      newznab: 6000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: 'torrents.php?cat={{ if .Categories }}{{ .Categories | join "," }}{{ else }}0{{ end }}&search={{ if .Query.IMDBID }}{{ .Query.IMDBID | urlencode }}{{ else }}{{ .Keywords | urlencode }}{{ end }}&options={{ if .Query.IMDBID }}4{{ else }}0{{ end }}'
      response:
        type: html
  rows:
    selector: 'table[align="center"] + br + table > tbody > tr:has(a[href^="download.php"])'
  fields:
    title:
      selector: td:nth-of-type(3) a
      attribute: title
    details:
      selector: td:nth-of-type(3) a
      attribute: href
    download:
      selector: a[href^="download.php"]
      attribute: href
    category:
      selector: td:nth-of-type(2) a
      attribute: href
      filters:
        - name: querystring
          args: cat
    date:
      selector: td:nth-of-type(6)
      filters:
        - name: dateparse
          args: "yyyy-MM-ddHH:mm:ss"
    size:
      selector: td:nth-of-type(7)
    seeders:
      selector: td:nth-of-type(9)
    leechers:
      selector: td:nth-of-type(10)
    downloadvolumefactor:
      case:
        tr[bgcolor="#FFFF99"]: "0"
        tr[bgcolor="#CCFF99"]: "0"
        tr: "1"
    uploadvolumefactor:
      case:
        tr[bgcolor="#DDDDDD"]: "2"
        tr[bgcolor="#CCFF99"]: "2"
        tr: "1"
`

const TORRENT_BYTES = `
id: torrentbytes
name: TorrentBytes
description: Private general tracker exposed through a first-pass POST-login HTML Cardigann definition.
type: private
links:
  - https://www.torrentbytes.net/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
    helpText: TorrentBytes username.
  - name: password
    label: Password
    type: password
    required: true
    helpText: TorrentBytes password.
caps:
  categorymappings:
    - id: "23"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "52"
      cat: PC/Mac
      desc: Apple/All
      newznab: 4030
    - id: "22"
      cat: PC
      desc: Apps/misc
      newznab: 4000
    - id: "1"
      cat: PC
      desc: Apps/PC
      newznab: 4000
    - id: "28"
      cat: TV/Foreign
      desc: Foreign Titles
      newznab: 5020
    - id: "50"
      cat: Console
      desc: Games/Consoles
      newznab: 1000
    - id: "42"
      cat: PC/Games
      desc: Games/Pack
      newznab: 4050
    - id: "4"
      cat: PC/Games
      desc: Games/PC
      newznab: 4050
    - id: "51"
      cat: PC
      desc: Linux/All
      newznab: 4000
    - id: "31"
      cat: Other/Misc
      desc: Misc
      newznab: 8010
    - id: "20"
      cat: Movies/DVD
      desc: Movies/DVD-R
      newznab: 2070
    - id: "12"
      cat: Movies/BluRay
      desc: Movies/Full Blu-ray
      newznab: 2050
    - id: "5"
      cat: Movies/HD
      desc: Movies/HD
      newznab: 2040
    - id: "40"
      cat: Movies
      desc: Movies/Pack
      newznab: 2000
    - id: "19"
      cat: Movies/SD
      desc: Movies/SD
      newznab: 2030
    - id: "49"
      cat: Movies/UHD
      desc: Movies/UHD
      newznab: 2045
    - id: "25"
      cat: Audio
      desc: Music/DVDR
      newznab: 3000
    - id: "48"
      cat: Audio/Lossless
      desc: Music/Flac
      newznab: 3040
    - id: "6"
      cat: Audio/MP3
      desc: Music/MP3
      newznab: 3010
    - id: "43"
      cat: Audio
      desc: Music/Pack
      newznab: 3000
    - id: "34"
      cat: Audio/Video
      desc: Music/Videos
      newznab: 3020
    - id: "45"
      cat: Movies/BluRay
      desc: NonScene/BRrip
      newznab: 2050
    - id: "46"
      cat: Movies/HD
      desc: NonScene/x264
      newznab: 2040
    - id: "44"
      cat: Movies/SD
      desc: NonScene/Xvid
      newznab: 2030
    - id: "37"
      cat: TV/HD
      desc: TV/BRrip
      newznab: 5040
    - id: "38"
      cat: TV/HD
      desc: TV/HD
      newznab: 5040
    - id: "41"
      cat: TV
      desc: TV/Pack
      newznab: 5000
    - id: "33"
      cat: TV/SD
      desc: TV/SD
      newznab: 5030
    - id: "32"
      cat: TV/UHD
      desc: TV/UHD
      newznab: 5045
    - id: "39"
      cat: XXX/x264
      desc: XXX/HD
      newznab: 6040
    - id: "24"
      cat: XXX/ImageSet
      desc: XXX/IMGSET
      newznab: 6060
    - id: "21"
      cat: XXX/Pack
      desc: XXX/Pack
      newznab: 6050
    - id: "9"
      cat: XXX/XviD
      desc: XXX/SD
      newznab: 6030
    - id: "29"
      cat: XXX
      desc: XXX/Web
      newznab: 6000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
    music-search: [q]
login:
  method: post
  path: takelogin.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
    returnto: "/"
    login: "Log in!"
search:
  paths:
    - path: browse.php
      response:
        type: html
      inputs:
        incldead: "1"
        search: "{{ if .Query.IMDBID }}{{ .Query.IMDBID }}{{ else }}{{ .Keywords }}{{ end }}"
        sc: "{{ if .Query.IMDBID }}2{{ else }}1{{ end }}"
        $raw: '{{ range .Categories }}c{{ . }}=1&{{ end }}'
  rows:
    selector: 'table > tbody:has(tr > td.colhead) > tr:not(:has(td.colhead))'
  fields:
    title:
      selector: td:nth-of-type(2) a:nth-of-type(2)
    title|optional:
      selector: td:nth-of-type(2) a:nth-of-type(2)
      attribute: title
      optional: true
    details:
      selector: td:nth-of-type(2) a:nth-of-type(2)
      attribute: href
    download:
      selector: td:nth-of-type(2) a:nth-of-type(1)
      attribute: href
    category:
      selector: td:nth-of-type(1) a
      attribute: href
      filters:
        - name: querystring
          args: cat
    files:
      selector: td:nth-of-type(3)
    date:
      selector: td:nth-of-type(5)
      filters:
        - name: dateparse
          args: "yyyy-MM-ddHH:mm:ss"
    size:
      selector: td:nth-of-type(7)
    grabs:
      selector: td:nth-of-type(8)
    seeders:
      selector: td:nth-of-type(9)
    leechers:
      selector: td:nth-of-type(10)
    downloadvolumefactor:
      case:
        'font[color="green"]:contains("F"):contains("L")': "0"
        tr: "1"
    uploadvolumefactor:
      text: "1"
`

const TORRENT_SYNDIKAT = `
id: torrentsyndikat
name: TorrentSyndikat
description: German private general tracker exposed through a first-pass API-key JSON Cardigann definition.
type: private
links:
  - https://torrent-syndikat.org/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - json
  - api
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: TorrentSyndikat account API key.
  - name: productsOnly
    label: Products only
    type: checkbox
    default: false
    helpText: Limit search to torrents linked to a product.
caps:
  categorymappings:
    - id: "2"
      cat: PC
      desc: Apps / Windows
      newznab: 4000
    - id: "13"
      cat: PC
      desc: Apps / Linux
      newznab: 4000
    - id: "4"
      cat: PC/Mac
      desc: Apps / MacOS
      newznab: 4030
    - id: "6"
      cat: PC
      desc: Apps / Misc
      newznab: 4000
    - id: "50"
      cat: PC/Games
      desc: Spiele / Windows
      newznab: 4050
    - id: "51"
      cat: PC/Games
      desc: Spiele / MacOS
      newznab: 4050
    - id: "52"
      cat: PC/Games
      desc: Spiele / Linux
      newznab: 4050
    - id: "8"
      cat: Console/Other
      desc: Spiele / Playstation
      newznab: 1090
    - id: "7"
      cat: Console/Other
      desc: Spiele / Nintendo
      newznab: 1090
    - id: "32"
      cat: Console/Other
      desc: Spiele / XBOX
      newznab: 1090
    - id: "42"
      cat: Movies/UHD
      desc: Filme / 2160p
      newznab: 2045
    - id: "9"
      cat: Movies/HD
      desc: Filme / 1080p
      newznab: 2040
    - id: "20"
      cat: Movies/HD
      desc: Filme / 720p
      newznab: 2040
    - id: "10"
      cat: Movies/SD
      desc: Filme / SD
      newznab: 2030
    - id: "43"
      cat: TV/UHD
      desc: Serien / 2160p
      newznab: 5045
    - id: "53"
      cat: TV/HD
      desc: Serien / 1080p
      newznab: 5040
    - id: "54"
      cat: TV/HD
      desc: Serien / 720p
      newznab: 5040
    - id: "15"
      cat: TV/SD
      desc: Serien / SD
      newznab: 5030
    - id: "30"
      cat: TV/Sport
      desc: Serien / Sport
      newznab: 5060
    - id: "44"
      cat: TV/UHD
      desc: Serienpacks / 2160p
      newznab: 5045
    - id: "55"
      cat: TV/HD
      desc: Serienpacks / 1080p
      newznab: 5040
    - id: "56"
      cat: TV/HD
      desc: Serienpacks / 720p
      newznab: 5040
    - id: "27"
      cat: TV/SD
      desc: Serienpacks / SD
      newznab: 5030
    - id: "24"
      cat: Audio/Lossless
      desc: Audio / Musik / FLAC
      newznab: 3040
    - id: "25"
      cat: Audio/MP3
      desc: Audio / Musik / MP3
      newznab: 3010
    - id: "35"
      cat: Audio/Other
      desc: Audio / Other
      newznab: 3050
    - id: "18"
      cat: Audio/Audiobook
      desc: Audio / aBooks
      newznab: 3030
    - id: "33"
      cat: Audio/Video
      desc: Audio / Videos
      newznab: 3020
    - id: "17"
      cat: Books
      desc: Misc / eBooks
      newznab: 7000
    - id: "5"
      cat: PC/Phone-Other
      desc: Misc / Mobile
      newznab: 4040
    - id: "39"
      cat: Other
      desc: Misc / Bildung
      newznab: 8000
    - id: "36"
      cat: TV/Foreign
      desc: Englisch / Serien
      newznab: 5020
    - id: "57"
      cat: TV/Foreign
      desc: Englisch / Serienpacks
      newznab: 5020
    - id: "37"
      cat: Movies/Foreign
      desc: Englisch / Filme
      newznab: 2010
    - id: "47"
      cat: Books
      desc: Englisch / eBooks
      newznab: 7000
    - id: "48"
      cat: Other
      desc: Englisch / Bildung
      newznab: 8000
    - id: "49"
      cat: TV/Sport
      desc: Englisch / Sport
      newznab: 5060
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
    music-search: [q]
    book-search: [q]
search:
  paths:
    - path: api_9djWe8Tb2NE3p6opyqnh/v1/browse.php
      response:
        type: json
      inputs:
        apikey: "{{ .Config.APIKey }}"
        limit: "50"
        ponly: "{{ if .Config.ProductsOnly }}true{{ else }}false{{ end }}"
        imdbId: "{{ .Query.IMDBID }}"
        searchstring: "{{ if .Query.IMDBID }}{{ else }}{{ .Keywords }}{{ end }}"
        cats: "{{ .Categories | join ',' }}"
  rows:
    selector: $.rows
  fields:
    id:
      selector: id
    title:
      selector: name
    details:
      text: "/details.php?id={{ .Result.id }}"
    download:
      text: "/download.php?id={{ .Result.id }}&apikey={{ .Config.APIKey }}"
    category:
      selector: category
    date:
      selector: added
      filters:
        - name: unixtime
    size:
      selector: size
    files:
      selector: numfiles
    grabs:
      selector: snatched
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    downloadvolumefactor:
      text: "1"
    uploadvolumefactor:
      text: "1"
`

const SCENE_TIME = `
id: scenetime
name: SceneTime
description: Private general tracker exposed through a first-pass cookie-auth HTML Cardigann definition.
type: private
links:
  - https://www.scenetime.com/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - html
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: true
    helpText: SceneTime browser session cookie.
  - name: freeLeechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Search freeleech torrents only.
caps:
  categorymappings:
    - id: "10"
      cat: XXX
      desc: Movies Adult
      newznab: 6000
    - id: "47"
      cat: Movies
      desc: Movie Packs
      newznab: 2000
    - id: "57"
      cat: Movies/SD
      desc: Movies SD
      newznab: 2030
    - id: "59"
      cat: Movies/HD
      desc: Movies HD
      newznab: 2040
    - id: "64"
      cat: Movies/3D
      desc: Movies 3D
      newznab: 2060
    - id: "82"
      cat: Movies/Other
      desc: Movies CAM/TS
      newznab: 2020
    - id: "16"
      cat: Movies/UHD
      desc: Movies UHD
      newznab: 2045
    - id: "2"
      cat: TV/UHD
      desc: TV UHD
      newznab: 5045
    - id: "43"
      cat: TV
      desc: TV Packs
      newznab: 5000
    - id: "9"
      cat: TV/HD
      desc: TV HD
      newznab: 5040
    - id: "77"
      cat: TV/SD
      desc: TV SD
      newznab: 5030
    - id: "1"
      cat: TV/Anime
      desc: TV ANIME
      newznab: 5070
    - id: "6"
      cat: PC/Games
      desc: Games PC-ISO
      newznab: 4050
    - id: "48"
      cat: Console/Xbox
      desc: Games XBOX
      newznab: 1040
    - id: "51"
      cat: Console/Wii
      desc: Games Wii
      newznab: 1030
    - id: "55"
      cat: Console/NDS
      desc: Games Nintendo
      newznab: 1010
    - id: "12"
      cat: Console/PS4
      desc: Games PS
      newznab: 1180
    - id: "15"
      cat: Console/Other
      desc: Games Dreamcast
      newznab: 1090
    - id: "52"
      cat: PC/Mac
      desc: Mac/Linux
      newznab: 4030
    - id: "53"
      cat: PC/0day
      desc: Apps
      newznab: 4010
    - id: "24"
      cat: PC/Phone-Other
      desc: Mobile Apps
      newznab: 4040
    - id: "7"
      cat: Books
      desc: Books and Magazines
      newznab: 7000
    - id: "65"
      cat: Books/Comics
      desc: Books Comics
      newznab: 7030
    - id: "4"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "116"
      cat: Audio
      desc: Music Packs
      newznab: 3000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: 'browse.php?cata=yes{{ range .Categories }}&c{{ . }}=1{{ end }}{{ if .Query.IMDBID }}&imdb={{ .Query.IMDBID | urlencode }}{{ end }}{{ if .Keywords }}&search={{ .Keywords | urlencode }}{{ end }}{{ if .Config.FreeLeechOnly }}&freeleech=on{{ end }}'
      response:
        type: html
  rows:
    selector: tr.browse
  fields:
    id:
      selector: td:nth-of-type(2) a
      attribute: href
      filters:
        - name: querystring
          args: id
    title:
      selector: td:nth-of-type(2) a
      remove: font[color="green"]
    details:
      selector: td:nth-of-type(2) a
      attribute: href
    download:
      text: "download.php/{{ .Result.id }}/download.torrent"
    category:
      selector: td:nth-of-type(1) a
      attribute: href
      filters:
        - name: querystring
          args: cat
    date:
      selector: td:nth-of-type(2) span.elapsedDate
      attribute: title
      filters:
        - name: dateparse
          args: 'dddd, MMMM d, yyyy \\a\\t h:mmtt'
    size:
      selector: td:nth-of-type(3)
    seeders:
      selector: td:nth-of-type(4)
    leechers:
      selector: td:nth-of-type(5)
    downloadvolumefactor:
      case:
        'font > b:contains("Freeleech")': "0"
        tr: "1"
    uploadvolumefactor:
      text: "1"
`

const SCENE_HD = `
id: scenehd
name: SceneHD
description: Private HD movie and TV tracker exposed through a first-pass passkey JSON Cardigann definition.
type: private
links:
  - https://scenehd.org/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - tv
  - music
  - json
  - api
settings:
  - name: passkey
    label: Passkey
    type: password
    required: true
    helpText: SceneHD account passkey.
caps:
  categorymappings:
    - id: "2"
      cat: Movies/UHD
      desc: Movie/2160
      newznab: 2045
    - id: "1"
      cat: Movies/HD
      desc: Movie/1080
      newznab: 2040
    - id: "4"
      cat: Movies/HD
      desc: Movie/720
      newznab: 2040
    - id: "8"
      cat: Movies/BluRay
      desc: Movie/BD5/9
      newznab: 2050
    - id: "6"
      cat: TV/UHD
      desc: TV/2160
      newznab: 5045
    - id: "5"
      cat: TV/HD
      desc: TV/1080
      newznab: 5040
    - id: "7"
      cat: TV/HD
      desc: TV/720
      newznab: 5040
    - id: "22"
      cat: Movies/BluRay
      desc: Bluray/Complete
      newznab: 2050
    - id: "10"
      cat: XXX
      desc: XXX
      newznab: 6000
    - id: "16"
      cat: Movies/Other
      desc: Subpacks
      newznab: 2020
    - id: "13"
      cat: Audio/Video
      desc: MVID
      newznab: 3020
    - id: "9"
      cat: Other
      desc: Other
      newznab: 8000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep]
    music-search: [q]
search:
  paths:
    - path: browse.php?api=
      response:
        type: json
      inputs:
        passkey: "{{ .Config.Passkey }}"
        search: "{{ if .Query.IMDBID }}{{ .Query.IMDBID }} {{ .Keywords }}{{ else }}{{ .Keywords }}{{ end }}"
        cat: "{{ .Categories | join ',' }}"
  rows:
    selector: $
  fields:
    id:
      selector: id
    title:
      selector: name
    details:
      text: "details.php?id={{ .Result.id }}"
    download:
      text: "download.php?id={{ .Result.id }}&passkey={{ .Config.Passkey }}"
    category:
      selector: category
    date:
      selector: added
      filters:
        - name: dateparse
          args: "yyyy-MM-dd HH:mm:ss"
    size:
      selector: size
    grabs:
      selector: times_completed
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    downloadvolumefactor:
      selector: is_freeleech
      case:
        "1": "0"
        "0": "1"
    uploadvolumefactor:
      text: "1"
`

const HD_SPACE = `
id: hd-space
name: HD-Space
description: Private HD movie and TV tracker exposed through a first-pass form-login HTML Cardigann definition.
type: private
links:
  - https://hd-space.org/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - tv
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
    helpText: HD-Space username.
  - name: password
    label: Password
    type: password
    required: true
    helpText: HD-Space password.
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Show freeleech releases only.
caps:
  categorymappings:
    - id: "15"
      cat: Movies/BluRay
      desc: Movie / Blu-ray
      newznab: 2050
    - id: "19"
      cat: Movies/HD
      desc: Movie / 1080p
      newznab: 2040
    - id: "18"
      cat: Movies/HD
      desc: Movie / 720p
      newznab: 2040
    - id: "46"
      cat: Movies/UHD
      desc: Movie / 2160p
      newznab: 2045
    - id: "40"
      cat: Movies/HD
      desc: Movie / Remux
      newznab: 2040
    - id: "16"
      cat: Movies/HD
      desc: Movie / HD-DVD
      newznab: 2040
    - id: "41"
      cat: Movies/UHD
      desc: Movie / 4K UHD
      newznab: 2045
    - id: "21"
      cat: TV/HD
      desc: TV Show / 720p HDTV
      newznab: 5040
    - id: "22"
      cat: TV/HD
      desc: TV Show / 1080p HDTV
      newznab: 5040
    - id: "45"
      cat: TV/UHD
      desc: TV Show / 2160p HDTV
      newznab: 5045
    - id: "24"
      cat: TV/Documentary
      desc: Documentary / 720p
      newznab: 5080
    - id: "25"
      cat: TV/Documentary
      desc: Documentary / 1080p
      newznab: 5080
    - id: "47"
      cat: TV/Documentary
      desc: Documentary / 2160p
      newznab: 5080
    - id: "27"
      cat: TV/Anime
      desc: Animation / 720p
      newznab: 5070
    - id: "28"
      cat: TV/Anime
      desc: Animation / 1080p
      newznab: 5070
    - id: "48"
      cat: TV/Anime
      desc: Animation / 2160p
      newznab: 5070
    - id: "30"
      cat: Audio/Lossless
      desc: Music / HQ Audio
      newznab: 3040
    - id: "31"
      cat: Audio/Video
      desc: Music / Videos
      newznab: 3020
    - id: "33"
      cat: XXX
      desc: XXX / 720p
      newznab: 6000
    - id: "34"
      cat: XXX
      desc: XXX / 1080p
      newznab: 6000
    - id: "49"
      cat: XXX
      desc: XXX / 2160p
      newznab: 6000
    - id: "36"
      cat: Movies/Other
      desc: Trailers
      newznab: 2020
    - id: "37"
      cat: PC
      desc: Software
      newznab: 4000
    - id: "38"
      cat: Other
      desc: Others
      newznab: 8000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: form
  path: index.php?page=login
  form: form
  inputs:
    uid: "{{ .Config.Username }}"
    pwd: "{{ .Config.Password }}"
  error:
    - selector: 'table.lista td.lista span[style*="#FF0000"], table.lista td.header:contains("login attempts")'
search:
  paths:
    - path: index.php
      response:
        type: html
      inputs:
        page: torrents
        active: "0"
        category: '{{ .Categories | join ";" }}'
        options: "{{ if .Query.IMDBID }}2{{ else }}0{{ end }}"
        search: "{{ if .Query.IMDBID }}{{ .Query.IMDBID }}{{ else }}{{ .Keywords }}{{ end }}"
  rows:
    selector: 'div#bodyarea table.lista:not(:contains("Our Team Recommend")) > tbody > tr:has(a[href^="index.php?page=torrent-details&id="]){{ if .Config.FreeleechOnly }}:has(img[title="FreeLeech"], img[src="images/sf.png"]){{ end }}'
  fields:
    title:
      selector: td:nth-of-type(2) a[href^="index.php?page=torrent-details&id="]
    details:
      selector: td:nth-of-type(2) a[href^="index.php?page=torrent-details&id="]
      attribute: href
    download:
      selector: td:nth-of-type(4) a[href^="download.php?id="]
      attribute: href
    category:
      selector: a[href^="index.php?page=torrents&category="]
      attribute: href
      filters:
        - name: querystring
          args: category
    date:
      selector: td:nth-of-type(5)
      filters:
        - name: dateparse
          args: "MMMM d, yyyy, HH:mm:ss"
    size:
      selector: td:nth-of-type(6)
    seeders:
      selector: td:nth-of-type(8)
    leechers:
      selector: td:nth-of-type(9)
    downloadvolumefactor:
      case:
        'img[title="FreeLeech"]': "0"
        'img[src="images/sf.png"]': "0"
        'img[title="Half FreeLeech"]': "0.5"
        tr: "1"
    uploadvolumefactor:
      text: "1"
`

const SPEED_CD = `
id: speedcd
name: SpeedCD
description: Private general tracker exposed through a first-pass cookie-auth HTML Cardigann definition.
type: private
links:
  - https://speed.cd/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - html
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: true
    helpText: SpeedCD browser session cookie.
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Search freeleech torrents only.
  - name: excludeArchives
    label: Exclude archives
    type: checkbox
    default: false
    helpText: Exclude torrents containing RAR files from results.
caps:
  categorymappings:
    - id: "1"
      cat: Movies/Other
      desc: Movies/XviD
      newznab: 2020
    - id: "42"
      cat: Movies
      desc: Movies/Packs
      newznab: 2000
    - id: "32"
      cat: Movies
      desc: Movies/Kids
      newznab: 2000
    - id: "43"
      cat: Movies/HD
      desc: Movies/HD
      newznab: 2040
    - id: "47"
      cat: Movies
      desc: Movies/DiVERSiTY
      newznab: 2000
    - id: "28"
      cat: Movies/BluRay
      desc: Movies/B-Ray
      newznab: 2050
    - id: "48"
      cat: Movies/3D
      desc: Movies/3D
      newznab: 2060
    - id: "40"
      cat: Movies/DVD
      desc: Movies/DVD-R
      newznab: 2070
    - id: "56"
      cat: Movies
      desc: Movies/Anime
      newznab: 2000
    - id: "50"
      cat: TV/Sport
      desc: TV/Sports
      newznab: 5060
    - id: "52"
      cat: TV/HD
      desc: TV/B-Ray
      newznab: 5040
    - id: "53"
      cat: TV/SD
      desc: TV/DVD-R
      newznab: 5030
    - id: "41"
      cat: TV
      desc: TV/Packs
      newznab: 5000
    - id: "55"
      cat: TV
      desc: TV/Kids
      newznab: 5000
    - id: "57"
      cat: TV
      desc: TV/DiVERSiTY
      newznab: 5000
    - id: "49"
      cat: TV/HD
      desc: TV/HD
      newznab: 5040
    - id: "2"
      cat: TV/SD
      desc: TV/Episodes
      newznab: 5030
    - id: "30"
      cat: TV/Anime
      desc: TV/Anime
      newznab: 5070
    - id: "25"
      cat: PC/Games
      desc: Games/PC ISO
      newznab: 4050
    - id: "39"
      cat: Console/Wii
      desc: Games/Wii
      newznab: 1030
    - id: "45"
      cat: Console/PS3
      desc: Games/PS3
      newznab: 1080
    - id: "35"
      cat: Console
      desc: Games/Nintendo
      newznab: 1000
    - id: "33"
      cat: Console/Xbox 360
      desc: Games/XboX360
      newznab: 1050
    - id: "46"
      cat: PC/Phone-Other
      desc: Mobile
      newznab: 4040
    - id: "24"
      cat: PC/0day
      desc: Apps/0DAY
      newznab: 4010
    - id: "51"
      cat: PC/Mac
      desc: Mac
      newznab: 4030
    - id: "54"
      cat: Books
      desc: Educational
      newznab: 7000
    - id: "27"
      cat: Books
      desc: Books-Mags
      newznab: 7000
    - id: "26"
      cat: Audio
      desc: Music/Audio
      newznab: 3000
    - id: "3"
      cat: Audio/Lossless
      desc: Music/Flac
      newznab: 3040
    - id: "44"
      cat: Audio
      desc: Music/Pack
      newznab: 3000
    - id: "29"
      cat: Audio/Video
      desc: Music/Video
      newznab: 3020
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  paths:
    - path: 'browse/{{ range .Categories }}{{ . }}/{{ end }}{{ if .Config.FreeleechOnly }}freeleech/{{ end }}{{ if .Config.ExcludeArchives }}norar/{{ end }}{{ if .Keywords }}q/{{ .Keywords | urlencode }}{{ end }}'
      response:
        type: html
  rows:
    selector: 'tr:has(a)'
  fields:
    title:
      selector: 'td:nth-of-type(2) > div > a[href^="/t/"]'
      filters:
        - name: re_replace
          args: ['\\[REQ(UEST)?\\]', ""]
    details:
      selector: 'td:nth-of-type(2) > div > a[href^="/t/"]'
      attribute: href
    download:
      selector: 'td:nth-of-type(4) a[href^="/download/"]'
      attribute: href
    category:
      selector: td:nth-of-type(1) a
      attribute: href
      filters:
        - name: split
          args: ["/", "-1"]
    date:
      selector: 'td:nth-of-type(2) span[class^="elapsedDate"]'
      attribute: title
      filters:
        - name: dateparse
          args: "dddd, MMMM d, yyyy h:mmtt"
    size:
      selector: td:nth-of-type(6)
    seeders:
      selector: td:nth-of-type(8)
    leechers:
      selector: td:nth-of-type(9)
    downloadvolumefactor:
      case:
        'td:nth-of-type(2) span:contains("[Freeleech]")': "0"
        tr: "1"
    uploadvolumefactor:
      text: "1"
`

const HD_TORRENTS = `
id: hd-torrents
name: HD-Torrents
description: Private HD tracker exposed through a first-pass POST-login HTML Cardigann definition.
type: private
links:
  - https://hdts.ru/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - tv
  - music
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
caps:
  categorymappings:
    - id: "70"
      cat: Movies/BluRay
      desc: Movie/UHD/Blu-Ray
      newznab: 2050
    - id: "1"
      cat: Movies/BluRay
      desc: Movie/Blu-Ray
      newznab: 2050
    - id: "71"
      cat: Movies/UHD
      desc: Movie/UHD/Remux
      newznab: 2045
    - id: "2"
      cat: Movies/HD
      desc: Movie/Remux
      newznab: 2040
    - id: "5"
      cat: Movies/HD
      desc: Movie/1080p/i
      newznab: 2040
    - id: "3"
      cat: Movies/HD
      desc: Movie/720p
      newznab: 2040
    - id: "64"
      cat: Movies/UHD
      desc: Movie/2160p
      newznab: 2045
    - id: "63"
      cat: Audio
      desc: Movie/Audio Track
      newznab: 3000
    - id: "72"
      cat: TV/UHD
      desc: TV Show/UHD/Blu-ray
      newznab: 5045
    - id: "59"
      cat: TV/HD
      desc: TV Show/Blu-ray
      newznab: 5040
    - id: "73"
      cat: TV/UHD
      desc: TV Show/UHD/Remux
      newznab: 5045
    - id: "60"
      cat: TV/HD
      desc: TV Show/Remux
      newznab: 5040
    - id: "30"
      cat: TV/HD
      desc: TV Show/1080p/i
      newznab: 5040
    - id: "38"
      cat: TV/HD
      desc: TV Show/720p
      newznab: 5040
    - id: "65"
      cat: TV/UHD
      desc: TV Show/2160p
      newznab: 5045
    - id: "44"
      cat: Audio
      desc: Music/Album
      newznab: 3000
    - id: "61"
      cat: Audio/Video
      desc: Music/Blu-Ray
      newznab: 3020
    - id: "62"
      cat: Audio/Video
      desc: Music/Remux
      newznab: 3020
    - id: "57"
      cat: Audio/Video
      desc: Music/1080p/i
      newznab: 3020
    - id: "45"
      cat: Audio/Video
      desc: Music/720p
      newznab: 3020
    - id: "66"
      cat: Audio/Video
      desc: Music/2160p
      newznab: 3020
    - id: "58"
      cat: XXX
      desc: XXX/Blu-ray
      newznab: 6000
    - id: "74"
      cat: XXX
      desc: XXX/UHD/Blu-ray
      newznab: 6000
    - id: "48"
      cat: XXX
      desc: XXX/1080p/i
      newznab: 6000
    - id: "47"
      cat: XXX
      desc: XXX/720p
      newznab: 6000
    - id: "67"
      cat: XXX
      desc: XXX/2160p
      newznab: 6000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: post
  path: login.php
  inputs:
    uid: "{{ .Config.Username }}"
    pwd: "{{ .Config.Password }}"
  error:
    - selector: 'div > font[color="#FF0000"]'
search:
  paths:
    - path: 'torrents.php?{{ range .Categories }}category[]={{ . }}&{{ end }}search={{ if .Query.IMDBID }}{{ .Query.IMDBID | urlencode }}%20{{ end }}{{ .Keywords | replace "." " " | urlencode }}&active=0&options=0'
      response:
        type: html
  rows:
    selector: 'table.mainblockcontenttt tr:has(a[href^="details.php?id="])'
  fields:
    title:
      selector: td:nth-of-type(3) a[href^="details.php?id="]
    details:
      selector: td:nth-of-type(3) a[href^="details.php?id="]
      attribute: href
    download:
      selector: td:nth-of-type(5) a[href^="download.php"]
      attribute: href
    category:
      selector: td:nth-of-type(1) a[href*="category="]
      attribute: href
      filters:
        - name: querystring
          args: category
    date:
      selector: td:nth-of-type(7) span
      attribute: title
      filters:
        - name: dateparse
          args: "dd MMM yyyy HH:mm:ss"
    size:
      selector: td:nth-of-type(8)
    seeders:
      selector: td:nth-last-of-type(3)
    leechers:
      selector: td:nth-last-of-type(2)
    downloadvolumefactor:
      case:
        'img[src$="no_ratio.png"]': "0"
        'img[src$="free.png"]': "0"
        'img[src$="50.png"]': "0.5"
        'img[src$="25.png"]': "0.75"
        'img[src$="75.png"]': "0.25"
        tr: "1"
    uploadvolumefactor:
      case:
        'img[src$="no_ratio.png"]': "0"
        tr: "1"
`

const FUNFILE = `
id: funfile
name: FunFile
description: Private general tracker exposed through a first-pass POST-login HTML Cardigann definition.
type: private
links:
  - https://www.funfile.org/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
caps:
  categorymappings:
    - id: "44"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "22"
      cat: PC
      desc: Applications
      newznab: 4000
    - id: "43"
      cat: Audio/Audiobook
      desc: Audio Books
      newznab: 3030
    - id: "27"
      cat: Books
      desc: Ebook
      newznab: 7000
    - id: "4"
      cat: PC/Games
      desc: Games
      newznab: 4050
    - id: "40"
      cat: Other/Misc
      desc: Miscellaneous
      newznab: 8010
    - id: "19"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "6"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "31"
      cat: PC/Phone-Other
      desc: Portable
      newznab: 4040
    - id: "49"
      cat: Other
      desc: Tutorials
      newznab: 8000
    - id: "7"
      cat: TV
      desc: TV
      newznab: 5000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
login:
  method: post
  path: takelogin.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
    returnto: /
    login: Login
  error:
    - selector: td.mf_content
search:
  paths:
    - path: 'browse.php?cat=0&incldead=1&showspam=1&s_title=1&search={{ if .Query.IMDBID }}{{ .Query.IMDBID | urlencode }}{{ else }}{{ .Keywords | urlencode }}{{ end }}{{ if .Query.IMDBID }}&s_desc=1{{ end }}{{ range .Categories }}&c{{ . }}=1{{ end }}'
      response:
        type: html
  rows:
    selector: 'table.mainframe tr:has(a[href^="download.php"])'
  fields:
    title:
      selector: a[href^="details.php?id="]
      attribute: title
    details:
      selector: a[href^="details.php?id="]
      attribute: href
    download:
      selector: a[href^="download.php"]
      attribute: href
    category:
      selector: a[href^="browse.php?cat="]
      attribute: href
      filters:
        - name: querystring
          args: cat
    date:
      selector: td:nth-of-type(6)
      filters:
        - name: timeago
    size:
      selector: td:nth-of-type(8)
    grabs:
      selector: td:nth-of-type(9)
    seeders:
      selector: td:nth-of-type(10)
    leechers:
      selector: td:nth-of-type(11)
    downloadvolumefactor:
      text: "1"
    uploadvolumefactor:
      text: "1"
`

const IMMORTAL_SEED = `
id: immortalseed
name: ImmortalSeed
description: Private general tracker exposed through a first-pass POST-login HTML Cardigann definition.
type: private
links:
  - https://immortalseed.me/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Show freeleech releases only.
caps:
  categorymappings:
    - id: "3"
      cat: Other
      desc: Nuked
      newznab: 8000
    - id: "32"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "23"
      cat: PC
      desc: Apps
      newznab: 4000
    - id: "35"
      cat: Audio/Audiobook
      desc: Audiobooks
      newznab: 3030
    - id: "31"
      cat: TV
      desc: Childrens/Cartoons
      newznab: 5000
    - id: "54"
      cat: TV/Documentary
      desc: Documentary - HD
      newznab: 5080
    - id: "53"
      cat: TV/Documentary
      desc: Documentary - SD
      newznab: 5080
    - id: "22"
      cat: Books/EBook
      desc: Ebooks
      newznab: 7020
    - id: "41"
      cat: Books/Comics
      desc: Ebooks -- Comics
      newznab: 7030
    - id: "46"
      cat: Books/Mags
      desc: Ebooks -- Magazines
      newznab: 7010
    - id: "25"
      cat: PC/Games
      desc: Games
      newznab: 4050
    - id: "61"
      cat: Console/NDS
      desc: Games -- Nintendo
      newznab: 1010
    - id: "26"
      cat: PC/Games
      desc: Games -- PC
      newznab: 4050
    - id: "28"
      cat: Console/PS3
      desc: Games -- Playstation
      newznab: 1080
    - id: "29"
      cat: Console/Xbox
      desc: Games -- Xbox
      newznab: 1040
    - id: "49"
      cat: PC/Phone-Other
      desc: Mobile
      newznab: 4040
    - id: "51"
      cat: PC/Phone-Android
      desc: Mobile -- Android
      newznab: 4070
    - id: "50"
      cat: PC/Phone-IOS
      desc: Mobile -- IOS
      newznab: 4060
    - id: "52"
      cat: PC/Phone-Other
      desc: Mobile -- Windows
      newznab: 4040
    - id: "59"
      cat: Movies/UHD
      desc: Movies-4k
      newznab: 2045
    - id: "60"
      cat: Movies/Foreign
      desc: Movies-4k -- Non-English
      newznab: 2010
    - id: "16"
      cat: Movies/HD
      desc: Movies-HD
      newznab: 2040
    - id: "18"
      cat: Movies/Foreign
      desc: Movies-HD -- Non-English
      newznab: 2010
    - id: "17"
      cat: Movies/SD
      desc: Movies-Low Def
      newznab: 2030
    - id: "34"
      cat: Movies/Foreign
      desc: Movies-Low Def -- Non-English
      newznab: 2010
    - id: "62"
      cat: Movies
      desc: Movies-Packs
      newznab: 2000
    - id: "14"
      cat: Movies/SD
      desc: Movies-SD
      newznab: 2030
    - id: "33"
      cat: Movies/Foreign
      desc: Movies-SD -- Non-English
      newznab: 2010
    - id: "30"
      cat: Audio/Other
      desc: Music
      newznab: 3050
    - id: "37"
      cat: Audio/Lossless
      desc: Music -- FLAC
      newznab: 3040
    - id: "36"
      cat: Audio/MP3
      desc: Music -- MP3
      newznab: 3010
    - id: "39"
      cat: Audio/Other
      desc: Music -- Other
      newznab: 3050
    - id: "38"
      cat: Audio/Video
      desc: Music -- Video
      newznab: 3020
    - id: "45"
      cat: Other
      desc: Other
      newznab: 8000
    - id: "7"
      cat: TV/Sport
      desc: Sports Tv
      newznab: 5060
    - id: "44"
      cat: TV/Sport
      desc: Sports Tv -- Fitness-Instructional
      newznab: 5060
    - id: "58"
      cat: TV/Sport
      desc: Sports Tv -- Olympics
      newznab: 5060
    - id: "47"
      cat: TV/SD
      desc: TV - 480p
      newznab: 5030
    - id: "64"
      cat: TV/UHD
      desc: TV - 4K
      newznab: 5045
    - id: "8"
      cat: TV/HD
      desc: TV - High Definition
      newznab: 5040
    - id: "48"
      cat: TV/SD
      desc: TV SD - x264
      newznab: 5030
    - id: "9"
      cat: TV/SD
      desc: TV SD - XviD
      newznab: 5030
    - id: "63"
      cat: TV/UHD
      desc: TV Season Packs - 4K
      newznab: 5045
    - id: "4"
      cat: TV/HD
      desc: TV Season Packs - HD
      newznab: 5040
    - id: "6"
      cat: TV/SD
      desc: TV Season Packs - SD
      newznab: 5030
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
login:
  method: post
  path: takelogin.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: 'browse.php?category=0&include_dead_torrents=yes&sort=added&order=desc{{ if .Keywords }}&do=search&keywords={{ .Keywords | replace "." " " | replace "-" " " | replace "_" " " | urlencode }}&search_type=t_name{{ end }}{{ if .Categories }}&selectedcats2={{ .Categories | join "," }}{{ end }}'
      response:
        type: html
  rows:
    selector: 'table#sortabletable > tbody > tr:has(a[href*="details.php?id="]){{ if .Config.FreeleechOnly }}:has(img[title^="Free Torrent"], img[title^="Sitewide Free Torrent"]){{ end }}'
  fields:
    title:
      selector: 'div > a[href*="details.php?id="]'
    details:
      selector: 'div > a[href*="details.php?id="]'
      attribute: href
    download:
      selector: 'a[href*="download.php"]'
      attribute: href
    category:
      selector: td:nth-of-type(1) a
      attribute: href
      filters:
        - name: querystring
          args: category
    date:
      selector: 'td:nth-of-type(2) > div:last-child'
      filters:
        - name: dateparse
          args: "yyyy-MM-dd HH:mm:ss"
    size:
      selector: td:nth-of-type(5)
    grabs:
      selector: td:nth-of-type(6)
    seeders:
      selector: td:nth-of-type(7)
    leechers:
      selector: td:nth-of-type(8)
    downloadvolumefactor:
      case:
        'img[title^="Free Torrent"]': "0"
        'img[title^="Sitewide Free Torrent"]': "0"
        'img[title^="Silver Torrent"]': "0.5"
        tr: "1"
    uploadvolumefactor:
      case:
        'img[title^="x2 Torrent"]': "2"
        tr: "1"
`

const X_SPEEDS = `
id: xspeeds
name: XSpeeds
description: Private general tracker exposed through a first-pass POST-login HTML Cardigann definition.
type: private
links:
  - https://www.xspeeds.eu/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Show freeleech releases only.
caps:
  categorymappings:
    - id: "70"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "113"
      cat: TV/Anime
      desc: Anime Boxsets
      newznab: 5070
    - id: "112"
      cat: Movies/Other
      desc: Anime Movies
      newznab: 2020
    - id: "111"
      cat: Movies/Other
      desc: Anime TV
      newznab: 2020
    - id: "150"
      cat: PC
      desc: Apps
      newznab: 4000
    - id: "153"
      cat: Books
      desc: Books
      newznab: 7000
    - id: "154"
      cat: Audio/Audiobook
      desc: Books Audiobooks
      newznab: 3030
    - id: "155"
      cat: Books
      desc: Books eBooks & Magazines
      newznab: 7000
    - id: "68"
      cat: Movies/Other
      desc: Cams/TS
      newznab: 2020
    - id: "140"
      cat: TV/Documentary
      desc: Documentary
      newznab: 5080
    - id: "10"
      cat: Movies/DVD
      desc: DVDR
      newznab: 2070
    - id: "109"
      cat: Movies/BluRay
      desc: DVDR Bluray Disc
      newznab: 2050
    - id: "131"
      cat: TV/Sport
      desc: Fighting
      newznab: 5060
    - id: "134"
      cat: TV/Sport
      desc: Fighting Boxing
      newznab: 5060
    - id: "133"
      cat: TV/Sport
      desc: Fighting MMA
      newznab: 5060
    - id: "132"
      cat: TV/Sport
      desc: Fighting Wrestling
      newznab: 5060
    - id: "72"
      cat: Movies/Foreign
      desc: Foreign
      newznab: 2010
    - id: "116"
      cat: TV/Foreign
      desc: Foreign Boxsets
      newznab: 5020
    - id: "114"
      cat: Movies/Foreign
      desc: Foreign Movies
      newznab: 2010
    - id: "115"
      cat: TV/Foreign
      desc: Foreign TV
      newznab: 5020
    - id: "103"
      cat: Console/Other
      desc: Games Console
      newznab: 1090
    - id: "105"
      cat: Console/Other
      desc: Games Console Nintendo
      newznab: 1090
    - id: "104"
      cat: Console/PS4
      desc: Games Console Playstation
      newznab: 1180
    - id: "106"
      cat: Console/Xbox
      desc: Games Console XBOX
      newznab: 1040
    - id: "6"
      cat: PC/Games
      desc: Games PC
      newznab: 4050
    - id: "108"
      cat: PC
      desc: Games PC Linux
      newznab: 4000
    - id: "107"
      cat: PC/Mac
      desc: Games PC Mac
      newznab: 4030
    - id: "11"
      cat: Movies
      desc: Movie Boxsets
      newznab: 2000
    - id: "118"
      cat: Movies/UHD
      desc: Movie Boxsets 4K
      newznab: 2045
    - id: "162"
      cat: Movies/HD
      desc: Movie Boxsets AV1
      newznab: 2040
    - id: "143"
      cat: Movies/HD
      desc: Movie Boxsets HD
      newznab: 2040
    - id: "119"
      cat: Movies/HD
      desc: Movie Boxsets HEVC
      newznab: 2040
    - id: "144"
      cat: Movies/SD
      desc: Movie Boxsets SD
      newznab: 2030
    - id: "12"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "117"
      cat: Movies/UHD
      desc: Movies 4K
      newznab: 2045
    - id: "163"
      cat: Movies/HD
      desc: Movies AV1
      newznab: 2040
    - id: "145"
      cat: Movies/HD
      desc: Movies HD
      newznab: 2040
    - id: "100"
      cat: Movies/HD
      desc: Movies HEVC
      newznab: 2040
    - id: "146"
      cat: Movies/SD
      desc: Movies SD
      newznab: 2030
    - id: "13"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "135"
      cat: Audio/Lossless
      desc: Music FLAC
      newznab: 3040
    - id: "151"
      cat: Audio
      desc: Music Karaoke
      newznab: 3000
    - id: "136"
      cat: Audio
      desc: Music Boxset
      newznab: 3000
    - id: "148"
      cat: Audio/Video
      desc: Music Videos
      newznab: 3020
    - id: "9"
      cat: Other
      desc: Other
      newznab: 8000
    - id: "125"
      cat: Other
      desc: Other Pictures
      newznab: 8000
    - id: "54"
      cat: TV/Other
      desc: Other Soaps
      newznab: 5050
    - id: "83"
      cat: TV/Other
      desc: Other Specials
      newznab: 5050
    - id: "139"
      cat: TV
      desc: TOTM (Freeleech)
      newznab: 5000
    - id: "138"
      cat: TV
      desc: TOTW (x2 upload)
      newznab: 5000
    - id: "139"
      cat: Movies
      desc: TOTM (Freeleech)
      newznab: 2000
    - id: "138"
      cat: Movies
      desc: TOTW (x2 upload)
      newznab: 2000
    - id: "20"
      cat: TV/Sport
      desc: Sports
      newznab: 5060
    - id: "88"
      cat: TV/Sport
      desc: Sports/Football
      newznab: 5060
    - id: "86"
      cat: TV/Sport
      desc: Sports/MotorSports
      newznab: 5060
    - id: "89"
      cat: TV/Sport
      desc: Sports/Olympics
      newznab: 5060
    - id: "126"
      cat: TV
      desc: TV
      newznab: 5000
    - id: "127"
      cat: TV/UHD
      desc: TV 4K
      newznab: 5045
    - id: "164"
      cat: TV/HD
      desc: TV AV1
      newznab: 5040
    - id: "129"
      cat: TV/HD
      desc: TV HD
      newznab: 5040
    - id: "130"
      cat: TV/HD
      desc: TV HEVC
      newznab: 5040
    - id: "128"
      cat: TV/SD
      desc: TV SD
      newznab: 5030
    - id: "149"
      cat: TV
      desc: TV Specials
      newznab: 5000
    - id: "21"
      cat: TV/SD
      desc: TV Boxsets
      newznab: 5030
    - id: "120"
      cat: TV/UHD
      desc: TV Boxset 4K
      newznab: 5045
    - id: "165"
      cat: TV/UHD
      desc: TV Boxset AV1
      newznab: 5045
    - id: "76"
      cat: TV/HD
      desc: TV Boxset HD
      newznab: 5040
    - id: "97"
      cat: TV/HD
      desc: TV Boxset HEVC
      newznab: 5040
    - id: "147"
      cat: TV/SD
      desc: TV Boxset SD
      newznab: 5030
  modes:
    search: [q]
    movie-search: [q]
    tv-search: [q, season, ep]
    music-search: [q]
    book-search: [q]
login:
  method: post
  path: takelogin.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: 'browse.php?category={{ if .Categories }}{{ .Categories | join "," }}{{ else }}0{{ end }}&include_dead_torrents=yes&sort=added&order=desc{{ if .Keywords }}&do=search&keywords={{ .Keywords | replace "." " " | replace "-" " " | replace "_" " " | urlencode }}&search_type=t_name{{ end }}'
      response:
        type: html
  rows:
    selector: 'table#sortabletable > tbody > tr:has(a[href*="details.php?id="]){{ if .Config.FreeleechOnly }}:has(img[title^="Free Torrent"], img[title^="Sitewide Free Torrent"]){{ end }}'
  fields:
    title:
      selector: 'div > a[href*="details.php?id="]'
    details:
      selector: 'div > a[href*="details.php?id="]'
      attribute: href
    download:
      selector: 'a[href*="download.php"]'
      attribute: href
    category:
      selector: td:nth-of-type(1) a
      attribute: href
      filters:
        - name: querystring
          args: category
    date:
      selector: 'td:nth-of-type(2) > div:last-child'
      filters:
        - name: dateparse
          args: "dd-MM-yyyy HH:mm"
    size:
      selector: td:nth-of-type(5)
    grabs:
      selector: td:nth-of-type(6)
    seeders:
      selector: td:nth-of-type(7)
    leechers:
      selector: td:nth-of-type(8)
    downloadvolumefactor:
      case:
        'img[title^="Free Torrent"]': "0"
        'img[title^="Sitewide Free Torrent"]': "0"
        'img[title^="Silver Torrent"]': "0.5"
        tr: "1"
    uploadvolumefactor:
      case:
        'img[title^="x2 Torrent"]': "2"
        tr: "1"
`

const XTHOR = `
id: xthor
name: Xthor
description: French private general tracker exposed through a first-pass passkey JSON API Cardigann definition.
type: private
links:
  - https://api.xthor.tk/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - books
  - json
  - api
settings:
  - name: passkey
    label: Passkey
    type: password
    required: true
    helpText: Xthor account passkey.
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Search freeleech torrents only.
caps:
  categorymappings:
    - id: "118"
      cat: Movies/BluRay
      desc: Films 2160p/Bluray
      newznab: 2050
    - id: "119"
      cat: Movies/BluRay
      desc: Films 2160p/Remux
      newznab: 2050
    - id: "107"
      cat: Movies/UHD
      desc: Films 2160p/x265
      newznab: 2045
    - id: "1"
      cat: Movies/BluRay
      desc: Films 1080p/BluRay
      newznab: 2050
    - id: "2"
      cat: Movies/BluRay
      desc: Films 1080p/Remux
      newznab: 2050
    - id: "100"
      cat: Movies/HD
      desc: Films 1080p/x265
      newznab: 2040
    - id: "4"
      cat: Movies/HD
      desc: Films 1080p/x264
      newznab: 2040
    - id: "5"
      cat: Movies/HD
      desc: Films 720p/x264
      newznab: 2040
    - id: "7"
      cat: Movies/SD
      desc: Films SD/x264
      newznab: 2030
    - id: "3"
      cat: Movies/3D
      desc: Films 3D
      newznab: 2060
    - id: "6"
      cat: Movies/SD
      desc: Films XviD
      newznab: 2030
    - id: "8"
      cat: Movies/DVD
      desc: Films DVD
      newznab: 2070
    - id: "122"
      cat: Movies/HD
      desc: Films HDTV
      newznab: 2040
    - id: "94"
      cat: Movies/WEB-DL
      desc: Films WEBDL
      newznab: 2080
    - id: "95"
      cat: Movies/WEB-DL
      desc: Films WEBRiP
      newznab: 2080
    - id: "12"
      cat: TV/Documentary
      desc: Films Documentaire
      newznab: 5080
    - id: "31"
      cat: Movies/Other
      desc: Films Animation
      newznab: 2020
    - id: "33"
      cat: Movies/Other
      desc: Films Spectacle
      newznab: 2020
    - id: "125"
      cat: TV/Sport
      desc: Films Sports
      newznab: 5060
    - id: "20"
      cat: Audio/Video
      desc: Films Concerts, Clips
      newznab: 3020
    - id: "9"
      cat: Movies/Other
      desc: Films VOSTFR
      newznab: 2020
    - id: "104"
      cat: TV/Other
      desc: Series BluRay
      newznab: 5050
    - id: "13"
      cat: TV/Other
      desc: Series Pack VF
      newznab: 5050
    - id: "15"
      cat: TV/HD
      desc: Series HD VF
      newznab: 5040
    - id: "14"
      cat: TV/SD
      desc: Series SD VF
      newznab: 5030
    - id: "98"
      cat: TV/Other
      desc: Series Pack VOSTFR
      newznab: 5050
    - id: "17"
      cat: TV/HD
      desc: Series HD VOSTFR
      newznab: 5040
    - id: "16"
      cat: TV/SD
      desc: Series SD VOSTFR
      newznab: 5030
    - id: "101"
      cat: TV/Anime
      desc: Series Packs Anime
      newznab: 5070
    - id: "32"
      cat: TV/Anime
      desc: Series Animes
      newznab: 5070
    - id: "110"
      cat: TV/Anime
      desc: Series Anime VOSTFR
      newznab: 5070
    - id: "123"
      cat: TV/Other
      desc: Series Animation
      newznab: 5050
    - id: "109"
      cat: TV/Documentary
      desc: Series DOC
      newznab: 5080
    - id: "34"
      cat: TV/Other
      desc: Series Sport
      newznab: 5050
    - id: "30"
      cat: TV/Other
      desc: Series Emission TV
      newznab: 5050
    - id: "36"
      cat: XXX
      desc: MISC XxX/Films
      newznab: 6000
    - id: "105"
      cat: XXX
      desc: MISC XxX/Series
      newznab: 6000
    - id: "114"
      cat: XXX
      desc: MISC XxX/Lesbiennes
      newznab: 6000
    - id: "115"
      cat: XXX
      desc: MISC XxX/Gays
      newznab: 6000
    - id: "113"
      cat: XXX
      desc: MISC XxX/Hentai
      newznab: 6000
    - id: "120"
      cat: XXX
      desc: MISC XxX/Magazines
      newznab: 6000
    - id: "24"
      cat: Books/EBook
      desc: Livres Romans
      newznab: 7020
    - id: "124"
      cat: Audio/Audiobook
      desc: Livres Audio Books
      newznab: 3030
    - id: "96"
      cat: Books/Mags
      desc: Livres Magazines
      newznab: 7010
    - id: "99"
      cat: Books/Other
      desc: Livres Bandes dessinees
      newznab: 7050
    - id: "116"
      cat: Books/EBook
      desc: Livres Romans Jeunesse
      newznab: 7020
    - id: "102"
      cat: Books/Comics
      desc: Livres Comics
      newznab: 7030
    - id: "103"
      cat: Books/Other
      desc: Livres Mangas
      newznab: 7050
    - id: "25"
      cat: PC/Games
      desc: Logiciels Jeux PC
      newznab: 4050
    - id: "27"
      cat: Console/PS3
      desc: Logiciels Playstation
      newznab: 1080
    - id: "111"
      cat: PC/Mac
      desc: Logiciels Jeux MAC
      newznab: 4030
    - id: "26"
      cat: Console/Xbox 360
      desc: Logiciels XboX
      newznab: 1050
    - id: "112"
      cat: PC
      desc: Logiciels Jeux Linux
      newznab: 4000
    - id: "28"
      cat: Console/Wii
      desc: Logiciels Nintendo
      newznab: 1030
    - id: "29"
      cat: Console/NDS
      desc: Logiciels NDS
      newznab: 1010
    - id: "117"
      cat: PC
      desc: Logiciels ROM
      newznab: 4000
    - id: "21"
      cat: PC
      desc: Logiciels Applis PC
      newznab: 4000
    - id: "22"
      cat: PC/Mac
      desc: Logiciels Applis Mac
      newznab: 4030
    - id: "23"
      cat: PC/Phone-Android
      desc: Logiciels Smartphone
      newznab: 4070
  modes:
    search: [q]
    movie-search: [q, tmdbid]
    tv-search: [q, season, ep]
    music-search: [q]
    book-search: [q]
search:
  paths:
    - path: /
      response:
        type: json
      inputs:
        passkey: "{{ .Config.Passkey }}"
        tmdbid: "{{ .Query.TMDBID }}"
        search: "{{ if .Query.TMDBID }}{{ else }}{{ .Keywords }}{{ end }}"
        freeleech: "{{ if .Config.FreeleechOnly }}1{{ end }}"
        category: "{{ .Categories | join '+' }}"
  rows:
    selector: $.torrents, $.Torrents
  fields:
    id:
      selector: id, Id
    title:
      selector: name, Name
    details:
      text: "https://xthor.tk/details.php?id={{ .Result.id }}"
    download:
      selector: download_link, Download_link
    category:
      selector: category, Category
    date:
      selector: added, Added
      filters:
        - name: unixtime
    size:
      selector: size, Size
    files:
      selector: numfiles, Numfiles
    grabs:
      selector: times_completed, Times_completed
    seeders:
      selector: seeders, Seeders
    leechers:
      selector: leechers, Leechers
    downloadvolumefactor:
      selector: freeleech, Freeleech
      case:
        "1": "0"
        "0": "1"
    uploadvolumefactor:
      text: "1"
`

const HDBITS = `
id: hdbits
name: HDBits
description: Private HD tracker exposed through a first-pass username/passkey JSON POST Cardigann definition.
type: private
links:
  - https://hdbits.org/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - tv
  - music
  - json
  - api
settings:
  - name: username
    label: Username
    type: text
    required: true
    helpText: HDBits username.
  - name: apiKey
    label: Passkey
    type: password
    required: true
    helpText: HDBits account passkey.
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    helpText: Search freeleech torrents only.
caps:
  categorymappings:
    - id: "1"
      cat: Movies
      desc: Movie
      newznab: 2000
    - id: "2"
      cat: TV
      desc: TV
      newznab: 5000
    - id: "3"
      cat: TV/Documentary
      desc: Documentary
      newznab: 5080
    - id: "4"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "5"
      cat: TV/Sport
      desc: Sport
      newznab: 5060
    - id: "6"
      cat: Audio
      desc: Audio Track
      newznab: 3000
    - id: "7"
      cat: XXX
      desc: XXX
      newznab: 6000
    - id: "8"
      cat: Other
      desc: Misc/Demo
      newznab: 8000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, tvdbid]
search:
  paths:
    - path: /api/torrents
      method: post
      response:
        type: json
      headers:
        accept: application/json
        content-type: application/json
      body: >-
        {"username":"{{ .Config.Username | jsonescape }}","passkey":"{{ .Config.ApiKey | jsonescape }}","limit":100,"category":[{{ .Categories | join "," }}]{{ if or .Query.IMDBIDShort .Query.TVDBID }}{{ else }},"search":"{{ .Keywords | jsonescape }}"{{ end }}{{ if .Query.IMDBIDShort }},"imdb":{"id":{{ .Query.IMDBIDShort }}}{{ end }}{{ if .Query.TVDBID }},"tvdb":{"id":{{ .Query.TVDBID }}{{ end }}{{ if and .Query.TVDBID .Query.Season }},"season":{{ .Query.Season }}{{ end }}{{ if and .Query.TVDBID .Query.Episode }},"episode":"{{ .Query.Episode | jsonescape }}"{{ end }}{{ if .Query.TVDBID }}}{{ end }}}
  rows:
    selector: '$.data{{ if .Config.FreeleechOnly }}:contains("yes"){{ end }}'
  fields:
    id:
      selector: id
    title:
      selector: name
    details:
      text: "/details.php?id={{ .Result.id }}"
    download:
      text: "/download.php?id={{ .Result.id }}&passkey={{ .Config.ApiKey }}"
    category:
      selector: type_category
    date:
      selector: utadded
      filters:
        - name: unixtime
    size:
      selector: size
    files:
      selector: numfiles
    grabs:
      selector: times_completed
    seeders:
      selector: seeders
    leechers:
      selector: leechers
    infohash:
      selector: hash
    downloadvolumefactor:
      selector: freeleech
      case:
        "yes": "0"
        "no": "1"
    uploadvolumefactor:
      selector: type_category
      case:
        "7": "0"
        "*": "1"
`

const PIXELHD = `
id: pixelhd
name: PiXELHD
description: Private HD tracker exposed through a first-pass cookie-auth HTML Cardigann definition.
type: private
links:
  - https://pixelhd.me/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - html
settings:
  - name: cookie
    label: Cookie
    type: cookie
    required: true
    helpText: Browser cookie for PiXELHD.
  - name: userAgent
    label: Cookie User-Agent
    type: text
    required: true
    helpText: User-Agent associated with the browser cookie.
caps:
  categorymappings:
    - id: "1"
      cat: Movies/HD
      desc: Movies HD
      newznab: 2040
  modes:
    search: [q]
    movie-search: [q, imdbid]
login:
  method: cookie
  inputs:
    cookie: "{{ .Config.Cookie }}"
search:
  headers:
    user-agent: "{{ .Config.UserAgent }}"
  paths:
    - path: /torrents.php
      response:
        type: html
      inputs:
        order_by: time
        order_way: desc
        imdbid: "{{ .Query.IMDBID }}"
        groupname: "{{ if .Query.IMDBID }}{{ else }}{{ .Keywords }}{{ end }}"
  rows:
    selector: 'tr.group_torrent:has(a[href^="torrents.php?id="])'
  fields:
    id:
      selector: 'a[href^="torrents.php?id="]'
      attribute: href
      filters:
        - name: querystring
          args: id
    title:
      selector: 'a[href^="torrents.php?id="]'
    details:
      selector: 'a[href^="torrents.php?id="]'
      attribute: href
    download:
      selector: 'a[href^="torrents.php?action=download"]'
      attribute: href
    category:
      text: "1"
    date:
      selector: "td:nth-child(3) span.time"
      attribute: title
      filters:
        - name: dateparse
          args: "MMM dd yyyy, HH:mm"
    size:
      selector: "td:nth-child(4)"
    grabs:
      selector: "td:nth-child(6)"
    seeders:
      selector: "td:nth-child(7)"
    leechers:
      selector: "td:nth-child(8)"
    downloadvolumefactor:
      text: "0"
    uploadvolumefactor:
      text: "1"
`

const SECRET_CINEMA = `
id: secret-cinema
name: Secret Cinema
description: Private rare movie tracker exposed through a first-pass Gazelle JSON Cardigann definition.
type: private
links:
  - https://secret-cinema.pw/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - movies
  - music
  - json
  - gazelle
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
  - name: useFreeleechToken
    label: Use Freeleech Tokens
    type: select
    default: "0"
    required: false
    options:
      - value: "0"
        label: Never
      - value: "1"
        label: Preferred
      - value: "2"
        label: Required
caps:
  categorymappings:
    - id: "1"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "2"
      cat: Audio
      desc: Music
      newznab: 3000
  modes:
    search: [q]
    movie-search: [q, imdbid]
login:
  method: post
  path: login.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
    keeplogged: "1"
search:
  paths:
    - path: /ajax.php
      response:
        type: json
      inputs:
        action: browse
        order_by: time
        order_way: desc
        searchstr: "{{ .Keywords }}"
        cataloguenumber: "{{ .Query.IMDBID }}"
        $raw: '{{ range .Categories }}filter_cat[{{ . }}]=1&{{ end }}'
  rows:
    selector: $.response.results, $.Response.Results
    attribute: torrents, Torrents
    multiple: true
    missingAttributeEqualsNoResults: true
  fields:
    id:
      selector: torrentId, TorrentId
    groupid:
      selector: ..groupId
    groupname:
      selector: ..groupName
      filters:
        - name: htmldecode
    groupyear:
      selector: ..groupYear
    media:
      selector: media, Media
    remastertitle:
      selector: remasterTitle, RemasterTitle
      optional: true
      filters:
        - name: htmldecode
    title:
      text: "{{ .Result.groupname }} ({{ .Result.groupyear }}) {{ .Result.media }}{{ if .Result.remastertitle }} [{{ .Result.remastertitle }}]{{ end }}"
    details:
      text: "/torrents.php?id={{ .Result.groupid }}&torrentid={{ .Result.id }}"
    download:
      text: '/torrents.php?action=download&id={{ .Result.id }}{{ if ne .Config.UseFreeleechToken "0" }}&useToken=1{{ end }}'
    category:
      selector: category, Category
      default: "1"
      case:
        "Movie": "1"
        "Movies": "1"
        "Music": "2"
        "Select Category": "1"
    date:
      selector: time, Time
    size:
      selector: size, Size
    files:
      selector: fileCount, FileCount
    grabs:
      selector: snatches, Snatches
    seeders:
      selector: seeders, Seeders
    leechers:
      selector: leechers, Leechers
    freeflags:
      selector: isFreeLeech, IsFreeLeech, isNeutralLeech, IsNeutralLeech, isPersonalFreeLeech, IsPersonalFreeLeech
      filters:
        - name: regexp
          args: "true"
    neutralflag:
      selector: isNeutralLeech, IsNeutralLeech
      filters:
        - name: regexp
          args: "true"
    downloadvolumefactor:
      text: "{{ if .Result.freeflags }}0{{ else }}1{{ end }}"
    uploadvolumefactor:
      text: "{{ if .Result.neutralflag }}0{{ else }}1{{ end }}"
`

const FILELIST = `
id: filelist
name: FileList.io
description: Romanian private general tracker exposed through a first-pass HTTP Basic-auth JSON Cardigann definition.
type: private
links:
  - https://filelist.io/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - json
  - api
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: passkey
    label: Passkey
    type: password
    required: true
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    required: false
caps:
  categorymappings:
    - id: "1"
      cat: Movies/SD
      desc: Filme SD
      newznab: 2030
    - id: "2"
      cat: Movies/DVD
      desc: Filme DVD
      newznab: 2070
    - id: "3"
      cat: Movies/Foreign
      desc: Filme DVD-RO
      newznab: 2010
    - id: "4"
      cat: Movies/HD
      desc: Filme HD
      newznab: 2040
    - id: "5"
      cat: Audio/Lossless
      desc: FLAC
      newznab: 3040
    - id: "6"
      cat: Movies/UHD
      desc: Filme 4K
      newznab: 2045
    - id: "7"
      cat: XXX
      desc: XXX
      newznab: 6000
    - id: "8"
      cat: PC
      desc: Programe
      newznab: 4000
    - id: "9"
      cat: PC/Games
      desc: Jocuri PC
      newznab: 4050
    - id: "10"
      cat: Console
      desc: Jocuri Console
      newznab: 1000
    - id: "11"
      cat: Audio
      desc: Audio
      newznab: 3000
    - id: "12"
      cat: Audio/Video
      desc: Videoclip
      newznab: 3020
    - id: "13"
      cat: TV/Sport
      desc: Sport
      newznab: 5060
    - id: "15"
      cat: TV
      desc: Desene
      newznab: 5000
    - id: "16"
      cat: Books
      desc: Docs
      newznab: 7000
    - id: "17"
      cat: PC
      desc: Linux
      newznab: 4000
    - id: "18"
      cat: Other
      desc: Diverse
      newznab: 8000
    - id: "19"
      cat: Movies/Foreign
      desc: Filme HD-RO
      newznab: 2010
    - id: "20"
      cat: Movies/BluRay
      desc: Filme Blu-Ray
      newznab: 2050
    - id: "21"
      cat: TV/HD
      desc: Seriale HD
      newznab: 5040
    - id: "22"
      cat: PC/Phone-Other
      desc: Mobile
      newznab: 4040
    - id: "23"
      cat: TV/SD
      desc: Seriale SD
      newznab: 5030
    - id: "24"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "25"
      cat: Movies/3D
      desc: Filme 3D
      newznab: 2060
    - id: "26"
      cat: Movies/BluRay
      desc: Filme 4K Blu-Ray
      newznab: 2050
    - id: "27"
      cat: TV/UHD
      desc: Seriale 4K
      newznab: 5045
    - id: "28"
      cat: Movies/Foreign
      desc: RO Dubbed Movies
      newznab: 2010
    - id: "28"
      cat: TV/Foreign
      desc: RO Dubbed TV
      newznab: 5020
    - id: "31"
      cat: TV/Foreign
      desc: K-Drama
      newznab: 5020
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
    music-search: [q]
    book-search: [q]
search:
  headers:
    authorization: "{{ basicauth .Config.Username .Config.Passkey }}"
  paths:
    - path: /api.php
      response:
        type: json
      inputs:
        action: "{{ if .Keywords }}search-torrents{{ else }}latest-torrents{{ end }}"
        type: "{{ if .Query.IMDBID }}imdb{{ else }}name{{ end }}"
        query: "{{ if .Query.IMDBID }}{{ .Query.IMDBID }}{{ else }}{{ .Keywords }}{{ end }}"
        season: "{{ .Query.Season }}"
        episode: "{{ .Query.Ep }}"
        category: '{{ .Categories | join "," }}'
        freeleech: "{{ if .Config.FreeleechOnly }}1{{ end }}"
  rows:
    selector: '\${{ if .Config.FreeleechOnly }}:has(freeleech:contains(true)){{ end }}'
  fields:
    id:
      selector: id, Id
    title:
      selector: name, Name
    details:
      text: "/details.php?id={{ .Result.id }}"
    download:
      text: "/download.php?id={{ .Result.id }}&passkey={{ .Config.Passkey }}"
    category:
      selector: category, Category
    date:
      selector: upload_date, UploadDate
      filters:
        - name: append
          args: " +0300"
        - name: dateparse
          args: "yyyy-MM-dd HH:mm:ss zzz"
    size:
      selector: size, Size
    files:
      selector: files, Files
    grabs:
      selector: times_completed, TimesCompleted
    seeders:
      selector: seeders, Seeders
    leechers:
      selector: leechers, Leechers
    freeflag:
      selector: freeleech, FreeLeech
      filters:
        - name: regexp
          args: "true"
    doubleflag:
      selector: doubleup, DoubleUp
      filters:
        - name: regexp
          args: "true"
    downloadvolumefactor:
      text: "{{ if .Result.freeflag }}0{{ else }}1{{ end }}"
    uploadvolumefactor:
      text: "{{ if .Result.doubleflag }}2{{ else }}1{{ end }}"
`

const ALPHA_RATIO = `
id: alpharatio
name: AlphaRatio
description: Private 0day and general tracker exposed through a first-pass Gazelle JSON Cardigann definition.
type: private
links:
  - https://alpharatio.cc/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - games
  - apps
  - json
  - gazelle
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
  - name: useFreeleechToken
    label: Use Freeleech Tokens
    type: select
    default: "0"
    required: false
    options:
      - value: "0"
        label: Never
      - value: "1"
        label: Preferred
      - value: "2"
        label: Required
  - name: freeleechOnly
    label: Freeleech only
    type: checkbox
    default: false
    required: false
  - name: excludeScene
    label: Exclude Scene
    type: checkbox
    default: false
    required: false
caps:
  categorymappings:
    - id: "1"
      cat: TV/SD
      desc: TvSD
      newznab: 5030
    - id: "2"
      cat: TV/HD
      desc: TvHD
      newznab: 5040
    - id: "3"
      cat: TV/UHD
      desc: TvUHD
      newznab: 5045
    - id: "4"
      cat: TV/SD
      desc: TvDVDRip
      newznab: 5030
    - id: "5"
      cat: TV/SD
      desc: TvPackSD
      newznab: 5030
    - id: "6"
      cat: TV/HD
      desc: TvPackHD
      newznab: 5040
    - id: "7"
      cat: TV/UHD
      desc: TvPackUHD
      newznab: 5045
    - id: "8"
      cat: Movies/SD
      desc: MovieSD
      newznab: 2030
    - id: "9"
      cat: Movies/HD
      desc: MovieHD
      newznab: 2040
    - id: "10"
      cat: Movies/UHD
      desc: MovieUHD
      newznab: 2045
    - id: "11"
      cat: Movies/SD
      desc: MoviePackSD
      newznab: 2030
    - id: "12"
      cat: Movies/HD
      desc: MoviePackHD
      newznab: 2040
    - id: "13"
      cat: Movies/UHD
      desc: MoviePackUHD
      newznab: 2045
    - id: "14"
      cat: XXX
      desc: MovieXXX
      newznab: 6000
    - id: "15"
      cat: Movies/BluRay
      desc: Bluray
      newznab: 2050
    - id: "16"
      cat: TV/Anime
      desc: AnimeSD
      newznab: 5070
    - id: "17"
      cat: TV/Anime
      desc: AnimeHD
      newznab: 5070
    - id: "18"
      cat: PC/Games
      desc: GamesPC
      newznab: 4050
    - id: "19"
      cat: Console/Xbox
      desc: GamesxBox
      newznab: 1000
    - id: "20"
      cat: Console/PS
      desc: GamesPS
      newznab: 1000
    - id: "21"
      cat: Console/Nintendo
      desc: GamesNin
      newznab: 1000
    - id: "22"
      cat: PC/0day
      desc: AppsWindows
      newznab: 4010
    - id: "23"
      cat: PC/Mac
      desc: AppsMAC
      newznab: 4020
    - id: "24"
      cat: PC/0day
      desc: AppsLinux
      newznab: 4010
    - id: "25"
      cat: PC/Phone-Other
      desc: AppsMobile
      newznab: 4040
    - id: "26"
      cat: XXX
      desc: 0dayXXX
      newznab: 6000
    - id: "27"
      cat: Books
      desc: eBook
      newznab: 7000
    - id: "28"
      cat: Audio/Audiobook
      desc: AudioBook
      newznab: 3030
    - id: "29"
      cat: Audio/Other
      desc: Music
      newznab: 3000
    - id: "30"
      cat: Other
      desc: Misc
      newznab: 8000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
    music-search: [q]
    book-search: [q]
login:
  method: post
  path: login.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
    keeplogged: "1"
search:
  paths:
    - path: /ajax.php
      response:
        type: json
      inputs:
        action: browse
        order_by: time
        order_way: desc
        searchstr: "{{ .Keywords }}"
        taglist: "{{ .Query.IMDBID }}"
        freetorrent: "{{ if .Config.FreeleechOnly }}1{{ end }}"
        scene: "{{ if .Config.ExcludeScene }}0{{ end }}"
        $raw: '{{ range .Categories }}filter_cat[{{ . }}]=1&{{ end }}'
  rows:
    selector: $.response.results, $.Response.Results
    attribute: torrents, Torrents
    multiple: true
    missingAttributeEqualsNoResults: true
  fields:
    id:
      selector: torrentId, TorrentId
    groupid:
      selector: ..groupId
    artist:
      selector: ..artist, ..Artist
      optional: true
      filters:
        - name: htmldecode
    groupname:
      selector: ..groupName
      filters:
        - name: htmldecode
    groupyear:
      selector: ..groupYear
    format:
      selector: format, Format
    encoding:
      selector: encoding, Encoding
    media:
      selector: media, Media
    hascue:
      selector: hasCue, HasCue
      filters:
        - name: regexp
          args: "true"
    title:
      text: "{{ if .Result.artist }}{{ .Result.artist }} - {{ end }}{{ .Result.groupname }} ({{ .Result.groupyear }}) [{{ .Result.format }} {{ .Result.encoding }}] [{{ .Result.media }}]{{ if .Result.hascue }} [Cue]{{ end }}"
    details:
      text: "/torrents.php?id={{ .Result.groupid }}&torrentid={{ .Result.id }}"
    download:
      text: '/torrents.php?action=download&id={{ .Result.id }}{{ if ne .Config.UseFreeleechToken "0" }}&usetoken=1{{ end }}'
    category:
      selector: category, Category
      default: "1"
      case:
        "TvSD": "1"
        "TvHD": "2"
        "TvUHD": "3"
        "TvDVDRip": "4"
        "TvPackSD": "5"
        "TvPackHD": "6"
        "TvPackUHD": "7"
        "MovieSD": "8"
        "MovieHD": "9"
        "MovieUHD": "10"
        "MoviePackSD": "11"
        "MoviePackHD": "12"
        "MoviePackUHD": "13"
        "MovieXXX": "14"
        "Bluray": "15"
        "AnimeSD": "16"
        "AnimeHD": "17"
        "GamesPC": "18"
        "GamesxBox": "19"
        "GamesPS": "20"
        "GamesNin": "21"
        "AppsWindows": "22"
        "AppsMAC": "23"
        "AppsLinux": "24"
        "AppsMobile": "25"
        "0dayXXX": "26"
        "eBook": "27"
        "AudioBook": "28"
        "Music": "29"
        "Misc": "30"
        "Select Category": "1"
    date:
      selector: time, Time
    size:
      selector: size, Size
    files:
      selector: fileCount, FileCount
    grabs:
      selector: snatches, Snatches
    seeders:
      selector: seeders, Seeders
    leechers:
      selector: leechers, Leechers
    freeflags:
      selector: isFreeLeech, IsFreeLeech, isNeutralLeech, IsNeutralLeech, isPersonalFreeLeech, IsPersonalFreeLeech
      filters:
        - name: regexp
          args: "true"
    neutralflag:
      selector: isNeutralLeech, IsNeutralLeech
      filters:
        - name: regexp
          args: "true"
    downloadvolumefactor:
      text: "{{ if .Result.freeflags }}0{{ else }}1{{ end }}"
    uploadvolumefactor:
      text: "{{ if .Result.neutralflag }}0{{ else }}1{{ end }}"
`

const BROKENSTONES = `
id: brokenstones
name: BrokenStones
description: Private MacOS and iOS apps and games tracker exposed through a first-pass Gazelle JSON Cardigann definition.
type: private
links:
  - https://brokenstones.is/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - apps
  - games
  - music
  - json
  - gazelle
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
  - name: useFreeleechToken
    label: Use Freeleech Tokens
    type: select
    default: "0"
    required: false
    options:
      - value: "0"
        label: Never
      - value: "1"
        label: Preferred
      - value: "2"
        label: Required
caps:
  categorymappings:
    - id: "1"
      cat: PC/Mac
      desc: MacOS Apps
      newznab: 4020
    - id: "2"
      cat: PC/Mac
      desc: MacOS Games
      newznab: 4020
    - id: "3"
      cat: PC/Phone-iOS
      desc: iOS Apps
      newznab: 4040
    - id: "4"
      cat: PC/Phone-iOS
      desc: iOS Games
      newznab: 4040
    - id: "5"
      cat: Other
      desc: Graphics
      newznab: 8000
    - id: "6"
      cat: Audio
      desc: Audio
      newznab: 3000
    - id: "7"
      cat: Other
      desc: Tutorials
      newznab: 8000
    - id: "8"
      cat: Other
      desc: Other
      newznab: 8000
  modes:
    search: [q]
login:
  method: post
  path: login.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
    keeplogged: "1"
search:
  paths:
    - path: /ajax.php
      response:
        type: json
      inputs:
        action: browse
        order_by: time
        order_way: desc
        searchstr: "{{ .Keywords }}"
        $raw: '{{ range .Categories }}filter_cat[{{ . }}]=1&{{ end }}'
  rows:
    selector: $.response.results, $.Response.Results
    attribute: torrents, Torrents
    multiple: true
    missingAttributeEqualsNoResults: true
  fields:
    id:
      selector: torrentId, TorrentId
    groupid:
      selector: ..groupId
    groupname:
      selector: ..groupName
      filters:
        - name: htmldecode
    groupyear:
      selector: ..groupYear
    format:
      selector: format, Format
    encoding:
      selector: encoding, Encoding
    media:
      selector: media, Media
    hascue:
      selector: hasCue, HasCue
      filters:
        - name: regexp
          args: "true"
    title:
      text: "{{ .Result.groupname }} ({{ .Result.groupyear }}) [{{ .Result.format }} {{ .Result.encoding }}] [{{ .Result.media }}]{{ if .Result.hascue }} [Cue]{{ end }}"
    details:
      text: "/torrents.php?id={{ .Result.groupid }}&torrentid={{ .Result.id }}"
    download:
      text: '/torrents.php?action=download&id={{ .Result.id }}{{ if ne .Config.UseFreeleechToken "0" }}&usetoken=1{{ end }}'
    category:
      selector: category, Category
      default: "1"
      case:
        "MacOS Apps": "1"
        "MacOS Games": "2"
        "iOS Apps": "3"
        "iOS Games": "4"
        "Graphics": "5"
        "Audio": "6"
        "Tutorials": "7"
        "Other": "8"
        "Select Category": "1"
    date:
      selector: time, Time
    size:
      selector: size, Size
    files:
      selector: fileCount, FileCount
    grabs:
      selector: snatches, Snatches
    seeders:
      selector: seeders, Seeders
    leechers:
      selector: leechers, Leechers
    freeflags:
      selector: isFreeLeech, IsFreeLeech, isNeutralLeech, IsNeutralLeech, isPersonalFreeLeech, IsPersonalFreeLeech
      filters:
        - name: regexp
          args: "true"
    neutralflag:
      selector: isNeutralLeech, IsNeutralLeech
      filters:
        - name: regexp
          args: "true"
    downloadvolumefactor:
      text: "{{ if .Result.freeflags }}0{{ else }}1{{ end }}"
    uploadvolumefactor:
      text: "{{ if .Result.neutralflag }}0{{ else }}1{{ end }}"
`

const REVOLUTION_TT = `
id: revolutiontt
name: RevolutionTT
description: Private general tracker exposed through a first-pass POST-login HTML Cardigann definition.
type: private
links:
  - https://revott.me/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
caps:
  categorymappings:
    - id: "23"
      cat: TV/Anime
      desc: Anime
      newznab: 5070
    - id: "22"
      cat: PC/0day
      desc: Apps
      newznab: 4010
    - id: "1"
      cat: PC/ISO
      desc: Apps ISO
      newznab: 4020
    - id: "36"
      cat: Books
      desc: Books
      newznab: 7000
    - id: "36"
      cat: Books/EBook
      desc: Ebooks
      newznab: 7020
    - id: "4"
      cat: PC/Games
      desc: Games
      newznab: 4050
    - id: "21"
      cat: PC/Games
      desc: Games PC
      newznab: 4050
    - id: "16"
      cat: Console/PS3
      desc: Games PS3
      newznab: 1080
    - id: "40"
      cat: Console/Wii
      desc: Games Wii
      newznab: 1030
    - id: "39"
      cat: Console/Xbox 360
      desc: Games Xbox 360
      newznab: 1050
    - id: "35"
      cat: Console/NDS
      desc: Games NDS
      newznab: 1010
    - id: "34"
      cat: Console/PSP
      desc: Games PSP
      newznab: 1020
    - id: "2"
      cat: PC/Mac
      desc: Mac
      newznab: 4030
    - id: "10"
      cat: Movies/BluRay
      desc: Movies BluRay
      newznab: 2050
    - id: "20"
      cat: Movies/DVD
      desc: Movies DVD
      newznab: 2070
    - id: "12"
      cat: Movies/HD
      desc: Movies HD
      newznab: 2040
    - id: "44"
      cat: Movies/Other
      desc: Movies Other
      newznab: 2020
    - id: "11"
      cat: Movies/SD
      desc: Movies SD
      newznab: 2030
    - id: "19"
      cat: Movies/SD
      desc: Movies XviD
      newznab: 2030
    - id: "6"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "8"
      cat: Audio/Lossless
      desc: Music Lossless
      newznab: 3040
    - id: "46"
      cat: Audio/Other
      desc: Music Other
      newznab: 3050
    - id: "29"
      cat: Audio/Video
      desc: Music Video
      newznab: 3020
    - id: "43"
      cat: TV/Other
      desc: TV Other
      newznab: 5050
    - id: "42"
      cat: TV/HD
      desc: TV HD
      newznab: 5040
    - id: "45"
      cat: TV/Other
      desc: TV Other Packs
      newznab: 5050
    - id: "41"
      cat: TV/SD
      desc: TV SD
      newznab: 5030
    - id: "7"
      cat: TV/SD
      desc: TV XviD
      newznab: 5030
    - id: "9"
      cat: XXX
      desc: XXX
      newznab: 6000
    - id: "49"
      cat: XXX
      desc: XXX Other
      newznab: 6000
    - id: "47"
      cat: XXX/DVD
      desc: XXX DVD
      newznab: 6010
    - id: "48"
      cat: XXX
      desc: XXX Packs
      newznab: 6000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep]
login:
  method: post
  path: takelogin.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
search:
  paths:
    - path: 'browse.php?incldead=1&titleonly={{ if .Query.IMDBID }}0{{ else }}1{{ end }}&search={{ if .Query.IMDBID }}{{ .Query.IMDBID | urlencode }}{{ else }}{{ .Keywords | urlencode }}{{ end }}{{ range .Categories }}&c{{ . }}=1{{ end }}'
      response:
        type: html
  rows:
    selector: 'table#torrents-table tr:has(a[href^="download.php"])'
  fields:
    title:
      selector: '.br_right > a b'
    details:
      selector: '.br_right > a'
      attribute: href
    download:
      selector: 'td:nth-child(4) > a'
      attribute: href
    category:
      selector: '.br_type > a'
      attribute: href
      filters:
        - name: querystring
          args: cat
    date:
      selector: 'td:nth-child(6) nobr'
      filters:
        - name: dateparse
          args: "yyyy-MM-ddHH:mm:ss"
    size:
      selector: 'td:nth-child(7)'
    grabs:
      selector: 'td:nth-child(8)'
    seeders:
      selector: 'td:nth-child(9)'
    leechers:
      selector: 'td:nth-child(10)'
    downloadvolumefactor:
      text: "1"
    uploadvolumefactor:
      text: "1"
`

const PRETOME = `
id: pretome
name: PreToMe
description: Private ratioless 0Day/general tracker exposed through a first-pass form-login HTML Cardigann definition.
type: private
links:
  - https://pretome.info/
version: builtin-cardigann-1
rss: false
tags:
  - private
  - general
  - movies
  - tv
  - music
  - books
  - html
settings:
  - name: username
    label: Username
    type: text
    required: true
  - name: password
    label: Password
    type: password
    required: true
  - name: pin
    label: PIN
    type: password
    required: true
    helpText: PreToMe site PIN.
caps:
  categorymappings:
    - id: "22"
      cat: PC
      desc: Applications
      newznab: 4000
    - id: "22"
      cat: PC/0day
      desc: Applications/Windows
      newznab: 4010
    - id: "22"
      cat: PC/Mac
      desc: Applications/MAC
      newznab: 4030
    - id: "22"
      cat: PC
      desc: Applications/Linux
      newznab: 4000
    - id: "27"
      cat: Books/EBook
      desc: Ebooks
      newznab: 7020
    - id: "4"
      cat: Console
      desc: Games
      newznab: 1000
    - id: "4"
      cat: PC/Games
      desc: Games/PC
      newznab: 4050
    - id: "4"
      cat: PC/Games
      desc: Games/RIP
      newznab: 4050
    - id: "4"
      cat: PC/Games
      desc: Games/ISO
      newznab: 4050
    - id: "4"
      cat: Console/Xbox 360
      desc: Games/XBOX360
      newznab: 1050
    - id: "4"
      cat: Console/PS3
      desc: Games/PS3
      newznab: 1080
    - id: "4"
      cat: Console/Wii
      desc: Games/Wii
      newznab: 1030
    - id: "4"
      cat: Console/PSP
      desc: Games/PSP
      newznab: 1020
    - id: "4"
      cat: Console/Other
      desc: Games/NSW
      newznab: 1090
    - id: "4"
      cat: Console/NDS
      desc: Games/NDS
      newznab: 1010
    - id: "4"
      cat: Console/Xbox
      desc: Games/Xbox
      newznab: 1040
    - id: "4"
      cat: Console/Other
      desc: Games/PS2
      newznab: 1090
    - id: "31"
      cat: Other
      desc: Miscellaneous
      newznab: 8000
    - id: "31"
      cat: Books/EBook
      desc: Miscellaneous/Ebook
      newznab: 7020
    - id: "31"
      cat: Other/Misc
      desc: Miscellaneous/RARFiX
      newznab: 8010
    - id: "19"
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: "19"
      cat: Movies
      desc: Movies/x264
      newznab: 2000
    - id: "19"
      cat: Movies/HD
      desc: Movies/720p
      newznab: 2040
    - id: "19"
      cat: Movies/SD
      desc: Movies/XviD
      newznab: 2030
    - id: "19"
      cat: Movies/HD
      desc: Movies/BluRay
      newznab: 2040
    - id: "19"
      cat: Movies/SD
      desc: Movies/DVDRiP
      newznab: 2030
    - id: "19"
      cat: Movies/HD
      desc: Movies/1080p
      newznab: 2040
    - id: "19"
      cat: Movies/SD
      desc: Movies/DVD
      newznab: 2030
    - id: "19"
      cat: Movies/SD
      desc: Movies/DVDR
      newznab: 2030
    - id: "19"
      cat: Movies
      desc: Movies/WMV
      newznab: 2000
    - id: "19"
      cat: Movies
      desc: Movies/CAM
      newznab: 2000
    - id: "6"
      cat: Audio
      desc: Music
      newznab: 3000
    - id: "6"
      cat: Audio/MP3
      desc: Music/MP3
      newznab: 3010
    - id: "6"
      cat: Audio/MP3
      desc: Music/V2
      newznab: 3010
    - id: "6"
      cat: Audio/Lossless
      desc: Music/FLAC
      newznab: 3040
    - id: "6"
      cat: Audio/MP3
      desc: Music/320kbps
      newznab: 3010
    - id: "7"
      cat: TV
      desc: TV
      newznab: 5000
    - id: "7"
      cat: TV/HD
      desc: TV/x264
      newznab: 5040
    - id: "7"
      cat: TV/HD
      desc: TV/720p
      newznab: 5040
    - id: "7"
      cat: TV/HD
      desc: TV/HDTV
      newznab: 5040
    - id: "7"
      cat: TV/SD
      desc: TV/XviD
      newznab: 5030
    - id: "7"
      cat: TV/HD
      desc: TV/BluRay
      newznab: 5040
    - id: "7"
      cat: TV/SD
      desc: TV/DVDRiP
      newznab: 5030
    - id: "7"
      cat: TV/SD
      desc: TV/DVD
      newznab: 5030
    - id: "7"
      cat: TV/Documentary
      desc: TV/Documentary
      newznab: 5080
    - id: "7"
      cat: TV/SD
      desc: TV/PDTV
      newznab: 5030
    - id: "7"
      cat: TV/SD
      desc: TV/HD-DVD
      newznab: 5030
    - id: "51"
      cat: XXX
      desc: XXX
      newznab: 6000
    - id: "51"
      cat: XXX/XviD
      desc: XXX/XviD
      newznab: 6030
    - id: "51"
      cat: XXX/DVD
      desc: XXX/DVDRiP
      newznab: 6010
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid]
    music-search: [q]
    book-search: [q]
login:
  method: form
  path: login.php
  form: form
  submitpath: takelogin.php
  inputs:
    username: "{{ .Config.Username }}"
    password: "{{ .Config.Password }}"
    login_pin: "{{ .Config.Pin }}"
    returnto: /
    login: Login
  error:
    - selector: 'table.body_table font[color~="red"]'
search:
  paths:
    - path: 'browse.php?st=1&search={{ if .Query.IMDBID }}{{ .Query.IMDBID | urlencode }}{{ else }}{{ .Keywords | urlencode }}{{ end }}{{ if .Query.IMDBID }}&sd=1{{ end }}{{ range .Categories }}&cat[]={{ . }}{{ end }}&tags=&tf=all'
      response:
        type: html
  rows:
    selector: 'table tr.browse:has(a[href^="details.php?id="])'
  fields:
    title:
      selector: a[href^="details.php?id="]
      attribute: title
    details:
      selector: a[href^="details.php?id="]
      attribute: href
    download:
      selector: a[href^="download.php"]
      attribute: href
    category:
      selector: 'td:nth-of-type(1) a[href^="browse.php"]'
    date:
      selector: td:nth-of-type(6)
      filters:
        - name: timeago
    size:
      selector: td:nth-of-type(8)
    grabs:
      selector: td:nth-of-type(9)
    seeders:
      selector: td:nth-of-type(10)
    leechers:
      selector: td:nth-of-type(11)
    downloadvolumefactor:
      text: "0"
    uploadvolumefactor:
      text: "1"
`

const MORE_THAN_TV = `
id: morethantv
name: MoreThanTV
description: Private TV and movie tracker exposed through a Torznab-compatible endpoint.
type: private
links:
  - https://www.morethantv.me
version: builtin-cardigann-1
tags:
  - private
  - movies
  - tv
  - torznab
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: MoreThanTV Torznab API key.
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: tv
      cat: TV
      desc: TV
      newznab: 5000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid, tvdbid]
search:
  paths:
    - path: /api/torznab
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tvdbid: "{{ .Query.TVDBID }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const HDACCESS = `
id: hdaccess
name: HDAccess
description: Private HD movie and TV tracker exposed through a Torznab-compatible endpoint.
type: private
links:
  - https://hdaccess.net
version: builtin-cardigann-1
tags:
  - private
  - movies
  - tv
  - hd
  - torznab
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: HDAccess Torznab API key.
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: movies-hd
      cat: Movies/HD
      desc: Movies HD
      newznab: 2040
    - id: movies-3d
      cat: Movies/3D
      desc: Movies 3D
      newznab: 2060
    - id: tv
      cat: TV
      desc: TV
      newznab: 5000
    - id: tv-hd
      cat: TV/HD
      desc: TV HD
      newznab: 5040
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid, tvdbid]
search:
  paths:
    - path: /api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tvdbid: "{{ .Query.TVDBID }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const TORRENT_NETWORK = `
id: torrent-network
name: Torrent Network
description: German private TV, movie, and general tracker exposed through a Torznab-compatible endpoint.
type: private
links:
  - https://tntracker.org
version: builtin-cardigann-1
tags:
  - private
  - movies
  - tv
  - general
  - de
  - torznab
settings:
  - name: apiKey
    label: API key
    type: password
    required: true
    helpText: Torrent Network Torznab API key.
caps:
  categorymappings:
    - id: movies
      cat: Movies
      desc: Movies
      newznab: 2000
    - id: tv
      cat: TV
      desc: TV
      newznab: 5000
    - id: general
      cat: Other
      desc: General
      newznab: 8000
  modes:
    search: [q]
    movie-search: [q, imdbid]
    tv-search: [q, season, ep, imdbid, tvdbid]
search:
  paths:
    - path: /api/torznab/api
      response:
        type: torznab
      inputs:
        apikey: "{{ .Config.APIKey }}"
        t: "{{ .Query.Type }}"
        q: "{{ .Keywords }}"
        cat: "{{ .Categories }}"
        imdbid: "{{ .Query.IMDBID }}"
        tvdbid: "{{ .Query.TVDBID }}"
        season: "{{ .Query.Season }}"
        ep: "{{ .Query.Ep }}"
        limit: "{{ .Query.Limit }}"
`

const CATEGORY_NAME_ALIASES: Readonly<Record<string, number>> = {
  anime: 5070,
  audio: 3000,
  book: 7020,
  books: 7000,
  console: 1000,
  games: 1000,
  movies: 2000,
  music: 3000,
  pc: 4000,
  tv: 5000,
  "tv/hd": 5040,
  "tv/sd": 5030,
  other: 8000,
  xxx: 6000,
}

const CATEGORY_NAME_TO_NEWZNAB: ReadonlyMap<string, number> = new Map([
  ...CATEGORIES.map((category) => [normalizeCategoryName(category.name), category.id] as const),
  ...Object.entries(CATEGORY_NAME_ALIASES).map(
    ([name, category]) => [normalizeCategoryName(name), category] as const,
  ),
])

const BUILT_IN_CARDIGANN_SOURCES = [
  PUBLIC_DOMAIN_MOVIE_TORRENTS,
  OPEN_TV_TORRENTS,
  NYAA,
  ANIME_TOSHO,
  ANIME_TORRENTS,
  BAKABT,
  NEBULANCE,
  ANIDEX,
  SHIZA_PROJECT,
  SUBSPLEASE,
  TORRENTS_CSV,
  KNABEN,
  TORRENT_DAY,
  IP_TORRENTS,
  RETRO_FLIX,
  SPEED_APP,
  BEYOND_HD,
  BIT_HDTV,
  TORRENT_BYTES,
  TORRENT_SYNDIKAT,
  SCENE_HD,
  SCENE_TIME,
  HD_SPACE,
  SPEED_CD,
  HD_TORRENTS,
  FUNFILE,
  IMMORTAL_SEED,
  X_SPEEDS,
  XTHOR,
  HDBITS,
  PIXELHD,
  SECRET_CINEMA,
  FILELIST,
  ALPHA_RATIO,
  BROKENSTONES,
  REVOLUTION_TT,
  PRETOME,
  MORE_THAN_TV,
  HDACCESS,
  TORRENT_NETWORK,
] as const

export const BUILT_IN_CARDIGANN_DEFINITIONS: ReadonlyArray<IndexerDefinitionSeed> =
  BUILT_IN_CARDIGANN_SOURCES.map(parseCardigannDefinitionYaml)

export const BUILT_IN_CARDIGANN_RUNTIME_DEFINITIONS: ReadonlyArray<CardigannRuntimeDefinition> =
  BUILT_IN_CARDIGANN_SOURCES.map(parseCardigannRuntimeDefinitionYaml)

export function getBuiltInCardigannRuntimeDefinition(
  definitionKey: string | null | undefined,
): CardigannRuntimeDefinition | null {
  if (!definitionKey) return null
  return (
    BUILT_IN_CARDIGANN_RUNTIME_DEFINITIONS.find(
      (definition) => definition.definitionKey === definitionKey,
    ) ?? null
  )
}

export function parseCardigannDefinitionYaml(source: string): IndexerDefinitionSeed {
  const root = expectRecord(load(source), "definition")
  const definitionKey = requiredString(root, "id")
  const displayName = requiredString(root, "name")
  const protocol = parseProtocol(optionalString(root, "protocol") ?? "torrent")
  const privacy = parsePrivacy(
    optionalString(root, "privacy") ?? optionalString(root, "type") ?? "private",
  )
  const caps = expectRecord(root.caps ?? {}, "caps")
  const categories = parseCategories(root.categories ?? caps.categorymappings ?? caps.categories)
  const searchTypes = parseSearchTypes(caps)
  const authFields = appendCaptchaAuthField(parseAuthFields(root.auth ?? root.settings), root.login)

  return {
    definitionKey,
    displayName,
    protocol,
    implementation: "cardigann_yaml",
    baseUrl: optionalString(root, "baseUrl") ?? firstString(root.links),
    privacy,
    supportsRss: optionalBoolean(root, "rss") ?? true,
    supportsSearch: searchTypes.length > 0,
    authFields,
    categories,
    capabilities: {
      searchTypes,
      categories: categories.map((category) => ({
        id: category.newznabCategory,
        name: category.trackerCategoryDesc,
      })),
    },
    tags: parseStringArray(root.tags),
    version: optionalString(root, "version") ?? "cardigann-yaml",
  }
}

export function parseCardigannRuntimeDefinitionYaml(source: string): CardigannRuntimeDefinition {
  const root = expectRecord(load(source), "definition")
  const seed = parseCardigannDefinitionYaml(source)
  return {
    definitionKey: seed.definitionKey,
    displayName: seed.displayName,
    protocol: seed.protocol,
    baseUrl: seed.baseUrl,
    authFields: seed.authFields,
    categories: seed.categories,
    capabilities: seed.capabilities,
    login: parseLoginRuntime(root.login),
    search: parseSearchRuntime(root, seed.protocol),
  }
}

function parseSearchTypes(value: unknown): ReadonlyArray<string> {
  const caps = expectRecord(value, "caps")
  const modes = isRecord(caps.modes) ? caps.modes : {}
  const types: Array<string> = []
  if (truthy(caps.search) || "search" in modes) types.push("search")
  if (truthy(caps.movie) || "movie-search" in modes || "movie" in modes) types.push("movie")
  if (truthy(caps.tv) || "tv-search" in modes || "tvsearch" in modes || "tv" in modes) {
    types.push("tvsearch")
  }
  return types
}

function parseSearchRuntime(
  root: Record<string, unknown>,
  protocol: IndexerProtocol,
): CardigannSearchRuntime {
  const search = expectRecord(root.search ?? {}, "search")
  const paths = parseSearchPaths(search.paths ?? search.path, protocol)
  return {
    allowEmptyInputs: optionalBoolean(search, "allowEmptyInputs") ?? false,
    keywordFilters: parseFilters(search.keywordsfilters ?? search.keywordsFilters),
    preprocessingFilters: parseFilters(search.preprocessingfilters ?? search.preprocessingFilters),
    inputs: parseInputMap(search.inputs),
    headers: parseHeaderMap(search.headers),
    rows: parseRows(search.rows),
    fields: parseFields(search.fields),
    paths,
  }
}

function parseLoginRuntime(value: unknown): CardigannLoginRuntime | null {
  if (value === undefined) return null
  const login = expectRecord(value, "login")
  const method = parseLoginMethod(optionalString(login, "method") ?? "get")
  const form = optionalString(login, "form")
  const submitPath = optionalString(login, "submitpath") ?? optionalString(login, "submitPath")
  const selectors = optionalBoolean(login, "selectors") === true
  const selectorInputs = parseSelectorInputMap(
    login.selectorinputs ?? login.selectorInputs,
    "login selector inputs",
  )
  const getSelectorInputs = parseSelectorInputMap(
    login.getselectorinputs ?? login.getSelectorInputs,
    "login get selector inputs",
  )
  const test = parseLoginTest(login.test)
  const captcha = parseLoginCaptcha(login.captcha)
  return {
    method,
    inputs: parseInputMap(login.inputs),
    headers: parseHeaderMap(login.headers),
    cookies: parseScalarStringArray(login.cookies, "login cookies"),
    errors: parseLoginErrors(login.error),
    paths:
      method === "cookie"
        ? []
        : parseLoginPaths(
            login.paths ?? login.path,
            login,
            method === "oneurl" || method === "form" ? "get" : null,
            method === "form",
          ),
    ...(selectors ? { selectors } : {}),
    ...(Object.keys(selectorInputs).length > 0 ? { selectorInputs } : {}),
    ...(Object.keys(getSelectorInputs).length > 0 ? { getSelectorInputs } : {}),
    ...(test !== undefined ? { test } : {}),
    ...(captcha !== undefined ? { captcha } : {}),
    ...(form !== null ? { form } : {}),
    ...(submitPath !== null ? { submitPath } : {}),
  }
}

function parseLoginPaths(
  value: unknown,
  login: Record<string, unknown>,
  defaultMethodOverride: "get" | "post" | null = null,
  allowPathMethodOverride = false,
): ReadonlyArray<CardigannLoginPath> {
  const pathValues =
    typeof value === "string"
      ? [{ path: value }]
      : Array.isArray(value)
        ? value
        : isRecord(value)
          ? [value]
          : []
  const defaultMethod = defaultMethodOverride ?? optionalString(login, "method") ?? "get"

  return pathValues.map((item) => {
    const path = typeof item === "string" ? { path: item } : expectRecord(item, "login path")
    const pathMethod =
      defaultMethodOverride === null || allowPathMethodOverride
        ? optionalString(path, "method")
        : null
    return {
      path: requiredString(path, "path"),
      method: parseMethod(pathMethod ?? defaultMethod),
      inputs: parseInputMap(path.inputs),
      headers: parseHeaderMap(path.headers),
    }
  })
}

function parseRows(value: unknown): CardigannRowsSelector | null {
  if (value === undefined) return null
  const rows = expectRecord(value, "rows")
  const attribute = optionalScalarStringFromAny(rows, ["attribute"])
  const before = optionalNonNegativeInt(rows, "before")
  const after = optionalNonNegativeInt(rows, "after")
  const count = rows.count
  const multiple = optionalBoolean(rows, "multiple") === true
  const missingAttributeEqualsNoResults =
    (optionalBoolean(rows, "missingattributeequalsnoresults") ??
      optionalBoolean(rows, "missingAttributeEqualsNoResults")) === true
  const dateHeaders = rows.dateheaders ?? rows.dateHeaders
  return {
    selector: requiredString(rows, "selector"),
    filters: parseFilters(rows.filters),
    ...(attribute !== null ? { attribute } : {}),
    ...(before !== null ? { before } : {}),
    ...(after !== null ? { after } : {}),
    ...(count !== undefined
      ? { count: parseFieldSelector(expectRecord(count, "rows count")) }
      : {}),
    ...(multiple ? { multiple } : {}),
    ...(missingAttributeEqualsNoResults ? { missingAttributeEqualsNoResults } : {}),
    ...(dateHeaders !== undefined
      ? { dateHeaders: parseFieldSelector(expectRecord(dateHeaders, "rows dateheaders")) }
      : {}),
  }
}

function parseFields(value: unknown): Readonly<Record<string, CardigannFieldSelector>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "fields")
  const fields: Record<string, CardigannFieldSelector> = {}
  for (const [fieldName, fieldValue] of Object.entries(record)) {
    const field = expectRecord(fieldValue, `field ${fieldName}`)
    fields[fieldName] = parseFieldSelector(field)
  }
  return fields
}

function parseSelectorInputMap(
  value: unknown,
  label: string,
): Readonly<Record<string, CardigannFieldSelector>> {
  if (value === undefined) return {}
  const record = expectRecord(value, label)
  const fields: Record<string, CardigannFieldSelector> = {}
  for (const [fieldName, fieldValue] of Object.entries(record)) {
    fields[fieldName] = parseFieldSelector(expectRecord(fieldValue, `${label} ${fieldName}`))
  }
  return fields
}

function parseFieldSelector(field: Record<string, unknown>): CardigannFieldSelector {
  const selector = optionalScalarStringFromAny(field, ["selector"])
  const attribute = optionalScalarStringFromAny(field, ["attribute"])
  const text = optionalScalarStringFromAny(field, ["text"])
  const remove = optionalScalarStringFromAny(field, ["remove"])
  const cases = parseCaseMap(field.case)
  const defaultValue = optionalScalarStringFromAny(field, ["default", "defaultValue"])
  return {
    optional: optionalBoolean(field, "optional") ?? false,
    filters: parseFilters(field.filters),
    ...(selector !== null ? { selector } : {}),
    ...(attribute !== null ? { attribute } : {}),
    ...(text !== null ? { text } : {}),
    ...(remove !== null ? { remove } : {}),
    ...(Object.keys(cases).length > 0 ? { case: cases } : {}),
    ...(defaultValue !== null ? { defaultValue } : {}),
  }
}

function parseLoginErrors(value: unknown): ReadonlyArray<CardigannLoginError> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("login error must be a list")

  return value.map((item) => {
    const error = expectRecord(item, "login error")
    const selector = optionalScalarStringFromAny(error, ["selector"])
    const message = isRecord(error.message) ? parseFieldSelector(error.message) : undefined
    if (selector === null && message === undefined) {
      throw new Error("login error must include selector or message")
    }
    return {
      ...(selector !== null ? { selector } : {}),
      ...(message !== undefined ? { message } : {}),
    }
  })
}

function parseLoginTest(value: unknown): CardigannLoginTest | undefined {
  if (value === undefined) return undefined
  const test = expectRecord(value, "login test")
  const path = optionalString(test, "path")
  return {
    selector: requiredString(test, "selector"),
    ...(path !== null ? { path } : {}),
  }
}

function parseLoginCaptcha(value: unknown): CardigannLoginCaptcha | undefined {
  if (value === undefined) return undefined
  const captcha = expectRecord(value, "login captcha")
  const type = optionalScalarStringFromAny(captcha, ["type"])
  const selector = optionalScalarStringFromAny(captcha, ["selector"])
  const input = optionalScalarStringFromAny(captcha, ["input"])
  return {
    ...(type !== null ? { type } : {}),
    ...(selector !== null ? { selector } : {}),
    ...(input !== null ? { input } : {}),
  }
}

function parseCaseMap(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "case")
  const cases: Record<string, string> = {}
  for (const [selector, caseValue] of Object.entries(record)) {
    cases[selector] = inputScalarToString(caseValue, `case ${selector}`).trim()
  }
  return cases
}

function parseSearchPaths(
  value: unknown,
  protocol: IndexerProtocol,
): ReadonlyArray<CardigannSearchPath> {
  const fallbackResponseType: CardigannResponseType = protocol === "usenet" ? "newznab" : "torznab"
  const pathValues =
    typeof value === "string"
      ? [{ path: value }]
      : Array.isArray(value)
        ? value
        : isRecord(value)
          ? [value]
          : []

  return pathValues.map((item) => {
    const path = typeof item === "string" ? { path: item } : expectRecord(item, "search path")
    const response = isRecord(path.response) ? path.response : {}
    const noResultsMessage = optionalScalarStringFromAnyAllowEmpty(response, [
      "noresultsmessage",
      "noResultsMessage",
    ])
    const searchPath: {
      path: string
      method: "get" | "post"
      inheritInputs: boolean
      inputs: Readonly<Record<string, string>>
      headers: Readonly<Record<string, string>>
      body?: string
      categories: ReadonlyArray<string>
      responseType: CardigannResponseType
      noResultsMessage?: string
    } = {
      path: requiredString(path, "path"),
      method: parseMethod(optionalString(path, "method") ?? "get"),
      inheritInputs:
        optionalBoolean(path, "inheritinputs") ?? optionalBoolean(path, "inheritInputs") ?? true,
      inputs: parseInputMap(path.inputs),
      headers: parseHeaderMap(path.headers),
      categories: parseOptionalStringArray(path.categories),
      responseType: parseResponseType(optionalString(response, "type") ?? fallbackResponseType),
    }
    const body = optionalScalarStringFromAnyAllowEmpty(path, [
      "body",
      "requestbody",
      "requestBody",
      "rawbody",
      "rawBody",
    ])
    if (body !== null) searchPath.body = body
    if (noResultsMessage !== null) searchPath.noResultsMessage = noResultsMessage
    return searchPath
  })
}

function parseInputMap(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "inputs")
  const inputs: Record<string, string> = {}
  for (const [key, val] of Object.entries(record)) {
    inputs[key] = inputScalarToString(val, `input ${key}`)
  }
  return inputs
}

function parseHeaderMap(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) return {}
  const record = expectRecord(value, "headers")
  const headers: Record<string, string> = {}
  for (const [key, val] of Object.entries(record)) {
    headers[key] = headerValueToString(val, `header ${key}`)
  }
  return headers
}

function headerValueToString(value: unknown, label: string): string {
  if (!Array.isArray(value)) return inputScalarToString(value, label)
  if (value.length === 0) throw new Error(`${label} must contain at least one value`)
  return inputScalarToString(value[0], `${label} value 0`)
}

function parseFilters(value: unknown): ReadonlyArray<CardigannFilter> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("filters must be a list")
  return value.map((item) => {
    const filter = expectRecord(item, "filter")
    return {
      name: requiredString(filter, "name").toLowerCase(),
      args: parseFilterArgs(filter.args),
    }
  })
}

function parseFilterArgs(value: unknown): ReadonlyArray<string> {
  if (value === undefined) return []
  if (Array.isArray(value)) {
    return value.map((item, index) => inputScalarToString(item, `filter arg ${index}`))
  }
  return [inputScalarToString(value, "filter arg")]
}

function inputScalarToString(value: unknown, label: string): string {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  throw new Error(`${label} must be a scalar value`)
}

function parseAuthFields(value: unknown): ReadonlyArray<IndexerAuthField> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("auth must be a list")
  const fields: Array<IndexerAuthField> = []
  for (const item of value) {
    const field = expectRecord(item, "auth field")
    const defaultValue = optionalScalarStringFromAny(field, ["default", "defaultValue"])
    const helpText = optionalScalarStringFromAny(field, ["helpText", "helptext", "help"])
    const options = parseAuthFieldOptions(field.options)
    const type = parseAuthFieldType(optionalString(field, "type") ?? "text")
    if (type === null) continue

    fields.push({
      name: requiredString(field, "name"),
      label: optionalString(field, "label") ?? requiredString(field, "name"),
      type,
      required: optionalBoolean(field, "required") ?? false,
      ...(helpText !== null ? { helpText } : {}),
      ...(defaultValue !== null ? { defaultValue } : {}),
      ...(options.length > 0 ? { options } : {}),
    })
  }
  return fields
}

function appendCaptchaAuthField(
  fields: ReadonlyArray<IndexerAuthField>,
  loginValue: unknown,
): ReadonlyArray<IndexerAuthField> {
  if (loginValue === undefined) return fields

  const login = expectRecord(loginValue, "login")
  const captcha = parseLoginCaptcha(login.captcha)
  if (captcha === undefined) return fields

  if (fields.some((field) => field.name.toLowerCase() === "cardiganncaptcha")) return fields

  return [
    ...fields,
    {
      name: "cardigannCaptcha",
      label: "CAPTCHA",
      type: "text",
      required: false,
      helpText: "Manual response for Cardigann login CAPTCHA prompts.",
    },
  ]
}

function parseAuthFieldOptions(value: unknown): ReadonlyArray<IndexerAuthFieldOption> {
  if (value === undefined) return []

  if (isRecord(value)) {
    return Object.entries(value).map(([key, optionValue]) => {
      const label = inputScalarToString(optionValue, `auth field option ${key}`).trim()
      return {
        value: key,
        label: label.length > 0 ? label : key,
      }
    })
  }

  if (!Array.isArray(value)) throw new Error("auth field options must be a list or object")
  return value.map((item) => {
    if (!isRecord(item)) {
      const optionValue = inputScalarToString(item, "auth field option").trim()
      if (optionValue.length === 0) throw new Error("auth field option value is required")
      return { value: optionValue, label: optionValue }
    }

    const optionValue = optionalScalarStringFromAny(item, ["value", "id", "key"])
    if (optionValue === null) throw new Error("auth field option value is required")
    return {
      value: optionValue,
      label: optionalScalarStringFromAny(item, ["label", "name", "text"]) ?? optionValue,
    }
  })
}

function parseCategories(value: unknown): ReadonlyArray<IndexerCategoryMapping> {
  if (isRecord(value)) {
    return Object.entries(value).map(([trackerCategory, category]) => {
      const trackerCategoryDesc = inputScalarToString(
        category,
        `category ${trackerCategory}`,
      ).trim()
      if (trackerCategory.trim().length === 0 || trackerCategoryDesc.length === 0) {
        throw new Error("categories must contain non-empty strings")
      }

      const newznabCategory = newznabFromCategoryName(trackerCategoryDesc)
      if (newznabCategory === null) {
        throw new Error("category must include a known cat or newznab category")
      }

      return {
        trackerCategory: trackerCategory.trim(),
        trackerCategoryDesc,
        newznabCategory,
      }
    })
  }

  if (!Array.isArray(value)) throw new Error("categories must be a list")
  return value.flatMap((item) => {
    const category = expectRecord(item, "category")
    const trackerCategory = requiredStringFromAny(category, ["tracker", "id"])
    const trackerCategoryDesc =
      optionalString(category, "description") ?? optionalString(category, "desc") ?? trackerCategory
    const defaultCategory = optionalBoolean(category, "default") === true
    const newznabCategories = resolveNewznabCategories(category)
    return newznabCategories.map((newznabCategory) => {
      const mapping: IndexerCategoryMapping = {
        trackerCategory,
        trackerCategoryDesc,
        newznabCategory,
      }
      return defaultCategory ? Object.assign(mapping, { defaultCategory: true }) : mapping
    })
  })
}

function resolveNewznabCategories(record: Record<string, unknown>): ReadonlyArray<number> {
  const explicit = record.newznab ?? record.newznabCategory
  if (explicit !== undefined) {
    const values = Array.isArray(explicit) ? explicit : [explicit]
    return uniqueNumbers(values.map((item) => positiveIntFromValue(item, "newznab")))
  }

  const category = record.cat
  const values = Array.isArray(category) ? category : [category]
  const resolved = values.flatMap((item) => {
    const newznabCategory = newznabFromCategoryName(item)
    return newznabCategory === null ? [] : [newznabCategory]
  })
  if (resolved.length > 0) return uniqueNumbers(resolved)

  throw new Error("category must include a known cat or newznab category")
}

function uniqueNumbers(values: ReadonlyArray<number>): ReadonlyArray<number> {
  return Array.from(new Set(values))
}

function newznabFromCategoryName(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return CATEGORY_NAME_TO_NEWZNAB.get(normalizeCategoryName(trimmed)) ?? null
}

function normalizeCategoryName(value: string): string {
  return value
    .trim()
    .replaceAll(/\s*\/\s*/g, "/")
    .replaceAll(/\s+/g, " ")
    .toLowerCase()
}

function parseStringArray(value: unknown): ReadonlyArray<string> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("tags must be a list")
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error("tags must contain non-empty strings")
    }
    return item.trim()
  })
}

function parseScalarStringArray(value: unknown, label: string): ReadonlyArray<string> {
  if (value === undefined) return []
  const values = Array.isArray(value) ? value : [value]
  return values.map((item, index) => inputScalarToString(item, `${label} ${index}`).trim())
}

function parseOptionalStringArray(value: unknown): ReadonlyArray<string> {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error("categories must be a list")
  return value.map((item) => {
    const normalized = typeof item === "number" && Number.isFinite(item) ? String(item) : item
    if (typeof normalized !== "string" || normalized.trim().length === 0) {
      throw new Error("categories must contain non-empty strings")
    }
    return normalized.trim()
  })
}

function parseProtocol(value: string): IndexerProtocol {
  if (value === "torrent" || value === "usenet") return value
  throw new Error(`unsupported indexer protocol: ${value}`)
}

function parseMethod(value: string): "get" | "post" {
  const method = value.toLowerCase()
  if (method === "get" || method === "post") return method
  throw new Error(`unsupported Cardigann search method: ${value}`)
}

function parseLoginMethod(value: string): "get" | "post" | "cookie" | "oneurl" | "form" {
  const method = value.toLowerCase()
  if (
    method === "get" ||
    method === "post" ||
    method === "cookie" ||
    method === "oneurl" ||
    method === "form"
  ) {
    return method
  }
  throw new Error(`unsupported Cardigann login method: ${value}`)
}

function parseResponseType(value: string): CardigannResponseType {
  const type = value.toLowerCase()
  if (type === "html" || type === "json" || type === "xml") return type
  if (type === "torznab" || type === "newznab" || type === "rss") return type
  throw new Error(`unsupported Cardigann response type: ${value}`)
}

function parsePrivacy(value: string): IndexerPrivacy {
  if (value === "public" || value === "private" || value === "semi_private") return value
  if (value === "semi-private") return "semi_private"
  throw new Error(`unsupported indexer privacy: ${value}`)
}

function parseAuthFieldType(value: string): IndexerAuthFieldType | null {
  const type = value.toLowerCase()
  if (type === "input" || type === "textbox") return "text"
  if (type === "cardiganncaptcha") return "text"
  if (type === "info" || type.startsWith("info_")) return "info"
  if (
    type === "text" ||
    type === "password" ||
    type === "cookie" ||
    type === "textarea" ||
    type === "select" ||
    type === "checkbox"
  ) {
    return type
  }
  throw new Error(`unsupported auth field type: ${value}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`)
  }
  return value.trim()
}

function requiredStringFromAny(
  record: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): string {
  for (const key of keys) {
    const value = optionalStringLike(record, key)
    if (value !== null) return value
  }
  throw new Error(`${keys.join(" or ")} is required`)
}

function optionalStringLike(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return optionalString(record, key)
}

function optionalScalarStringFromAny(
  record: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || value === null) continue
    const text = inputScalarToString(value, key).trim()
    if (text.length > 0) return text
  }
  return null
}

function optionalScalarStringFromAnyAllowEmpty(
  record: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || value === null) continue
    return inputScalarToString(value, key).trim()
  }
  return null
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value !== "string") throw new Error(`${key} must be a string`)
  return value.trim().length > 0 ? value.trim() : null
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`)
  return value
}

function positiveIntFromValue(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim())
  throw new Error(`${label} must be a positive integer`)
}

function optionalNonNegativeInt(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === undefined || value === null) return null
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim())
  throw new Error(`${key} must be a non-negative integer`)
}

function firstString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) throw new Error("links must be a list")
  const first = value.find((item) => typeof item === "string" && item.trim().length > 0)
  return typeof first === "string" ? first.trim() : null
}

function truthy(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "object" && value !== null && "available" in value) {
    return Boolean((value as { readonly available?: unknown }).available)
  }
  return false
}
