# ARR Hub Development Plan

Date: 2026-05-09

Purpose: turn the current codebase into a viable all-in-one replacement for Sonarr, Radarr, and Prowlarr. This plan is based on the current ARR Hub workspace plus local references under `vendor/sonarr`, `vendor/radarr`, and `vendor/prowlarr`.

## Executive Verdict

ARR Hub has a credible foundation, but it is not yet a viable Sonarr/Radarr/Prowlarr replacement.

What exists today:

- TanStack Start + tRPC + Effect service architecture.
- SQLite/Drizzle schema for users, API keys, movies, series/seasons/episodes, quality profiles, custom formats, indexers, download clients, media servers, queue, notifications, plugins, release decisions, scheduler, onboarding, and Plex playback history.
- Built-in adapters for qBittorrent, SABnzbd, Torznab/Newznab, Plex, and experimental Jellyfin.
- Basic release parsing, quality/profile scoring, search/grab pipeline, queue polling, and scheduler loop.
- TMDB-backed movie/TV metadata lookup, metadata-backed add flows, series episode hydration, Sonarr episode import, metadata refresh jobs, and a TV episode calendar.
- First-run onboarding, local admin login, API key creation, Dockerfile/compose, and a system health endpoint.
- Plex-oriented dashboard/history/users/stats functionality.

Primary blockers:

- The operator UI now exposes the existing backend workflows and has persisted browser smoke coverage, but deeper workflows still depend on backend work listed below.
- The metadata lifecycle is now functional for TMDB-backed movie/TV adds, Sonarr episode import, refresh jobs, and calendar population, but still lacks Sonarr/Radarr-depth alternate titles, ratings, local artwork cache, availability semantics, and TVDB/SkyHook parity.
- Completed download handling now has a real import path that resolves completed output paths and remote path mappings, selects media files, filters samples, renames, copy/move/hardlinks into library folders, persists media file records, supports manual import, scans existing libraries, and exposes rename preview/action. It still lacks unpack/repair waiting beyond downloader status normalization, free-space checks, recycle-bin support, and deeper Sonarr/Radarr import rejection rules.
- The release decision engine now has persistent blocklist enforcement, focused specification modules, target title/year/episode/season checks, size/free-space/queue/protocol/client availability checks, minimum age/retention/seeder gates, required/ignored/preferred release terms, sample/hardcoded subtitle/raw-disk rejection, and first-pass TV/anime edge checks. It still lacks full Sonarr/Radarr parity for language profiles, tagged release profiles, deep media inspection, proper/repack version upgrade semantics, scene/XEM mapping, and exhaustive parser coverage.
- Prowlarr replacement now has a first-pass foundation. The app consumes Torznab/Newznab endpoints and exposes authenticated aggregate Torznab/Newznab feeds with offset/extended metadata forwarding plus persisted generic definitions, small Cardigann-style YAML fixture definitions including Nyaa RSS, Anidex HTML selector, TorrentsCSV JSON selector, SubsPlease JSON selector, Knaben JSON POST body, TorrentDay cookie-auth JSON selector, IPTorrents cookie-auth HTML selector, RetroFlix and SpeedApp.io JSON selectors, BeyondHD JSON POST selector, BitHDTV cookie-auth HTML selector, TorrentBytes POST-login HTML selector, TorrentSyndikat API-key JSON selector, SceneHD passkey JSON selector, SceneTime cookie-auth HTML selector, HD-Space form-login HTML selector, SpeedCD cookie-auth HTML selector, HD-Torrents POST-login HTML selector, FunFile POST-login HTML selector, ImmortalSeed POST-login HTML selector, XSpeeds POST-login HTML selector, Xthor passkey JSON API selector, HDBits username/passkey JSON POST selector, RevolutionTT POST-login HTML selector, PreToMe form-login HTML selector, AnimeTorrents cookie-auth AJAX HTML selector, BakaBT form-login HTML selector, Nebulance JSON-RPC API selector, ShizaProject GraphQL JSON selector, and Prowlarr-derived Torznab-compatible AnimeTosho, MoreThanTV, HDAccess, and Torrent Network coverage with encrypted definition-specific config/auth values, first-pass Settings UI inputs including select options/defaults, checkbox controls, informational auth notes, and manual CAPTCHA fields, editable tags, search/RSS flags, proxy controls, stats, built-in refresh controls, definition source/catalog controls, and app-sync controls, first-pass GET/POST XML/raw-body request execution, request template filters including `querystring`, `split`, URL decode aliases, and HTML entity and JSON escape filters, search keyword filters including `querystring`, `split`, URL alias/escape filters, and HTML entity and JSON escape filters, search preprocessing filters, response no-results message handling, range template expansion, base template variables, conditional/function template helpers, checkbox config booleans, auth-default config rendering, scalar and list-valued templated request headers, single-object search paths, scalar static request input/category normalization, `caps.categories` dictionary parsing against the standard Newznab category tree, multi-Newznab category mapping expansion, default category fallback, path-scoped category narrowing, path-level inherited input controls, first-pass HTML row/field selector result parsing with simple descendant selector scoping, `rows.after`/`rows.before` merging, row filter support, date header support, field descendant removal, selector case mappings, field selector self-matching, HTML selector attribute operators, case-insensitive HTML selector attribute flags, escaped HTML selector identifiers, HTML selector escaped attribute names, escaped HTML selector delimiters, HTML selector quoted attribute delimiters, HTML selector matching pseudo-classes, HTML selector pseudo-tail simple parts, HTML selector content-state pseudo-classes, HTML selector pseudo-filters, HTML selector positional filters, HTML selector direct-child combinators, HTML void element selectors, HTML selector state pseudo-classes, HTML selector form pseudo-classes, HTML selector visibility pseudo-classes, HTML selector header pseudo-classes, HTML selector root pseudo-classes, HTML selector language pseudo-classes, HTML selector child-position pseudo-classes, HTML selector nth-child pseudo-classes, HTML selector nth-last-child pseudo-classes, HTML selector of-type pseudo-classes, HTML selector only-child pseudo-classes, HTML selector sibling combinators, HTML selector list support, HTML selector template rendering, first-pass JSON response row/field selector parsing with row count/attribute metadata, parent selectors, selector positional filters, selector lists, and selector pseudo-filters, first-pass XML response selector parsing, magnet result-field aliasing, categorydesc result-field mapping, zero volume-factor preservation, field-name modifier handling, optional field fallback preservation, and relative-time, fuzzy-date, formatted-date, Unix timestamp, JSON array-join, validation, diacritics, and filename field filters, first-pass login request execution with pre-seeded login cookies, direct cookie-login rendering, one-url login requests, form login requests, GET method form login submissions, form-login landing request methods and inputs, form login control serialization, selector-resolved form login controls, multipart form login submissions, selector-derived form login values, configured CAPTCHA response submission, automatic simpleCaptcha form handling, login error selectors, login test selectors, manual CAPTCHA and informational auth-field exposure, and session-cookie reuse, and per-indexer category-restricted search fan-out, version-aware built-in definition refresh, URL-backed Cardigann definition source refresh with DB-backed runtime loading, scheduler execution, checksum provenance/pinning, and first-pass checksum-required catalog manifest import whose entries must also carry source SHA-256 pins, proxy records applied to outbound requests, search stats, first-pass health/backoff handling, per-indexer minimum-seeder, query-cooldown, and rolling query/grab-limit policy controls, and persisted Radarr/Sonarr aggregate app sync with scheduler execution, indexer add/update/remove triggers, full-sync stale remote aggregate cleanup, add-only stale mapping preservation, app-side remote setting retention during updates, separate Sonarr anime category sync, and app-specific torrent seed criteria. It still does not manage a Prowlarr-scale tracker catalogue, full Cardigann selector/login/auth UX parity, full app-sync parity for richer per-indexer and app-specific sync semantics, deeper policy parity beyond first-pass search/grab limits, or a full trusted first-party remote definition catalogue distribution pipeline.
- Download client coverage is narrow: qBittorrent and SABnzbd only.
- There is no Radarr/Sonarr/Prowlarr REST API compatibility layer, which matters if existing tools are expected to treat ARR Hub as a drop-in replacement.

## Verification Snapshot

Commands run from `/Users/codythatsme/Developer/arr-hub`:

- `bun run typecheck`: passed.
- `bun run test`: passed, 40 test files plus 1 skipped live suite, 499 passed and 4 skipped tests.
- `bun run test:e2e`: passed, 1 Chromium smoke test covering onboarding, settings, add movie, add TV from metadata, manual search display, calendar population, and queue page.
- `bun run lint`: passed with 357 warnings and 0 errors.
- `bun run build`: passed with chunk-size and external dependency warnings.

Mechanical health is acceptable. Product completeness is the issue.

## Implementation Progress On 2026-05-09

Completed in atomic commits after this plan was written:

- `0246b446ef` added indexer settings CRUD/test UI.
- `d206f4bbd0` added download client settings CRUD/test UI.
- `540ea82ddd` added media server settings CRUD/test/library UI.
- `11749d1d36` added scheduler config/status/job controls.
- `0217f93ff0` added general settings UI.
- `4e2f66d121` added media-management/root-folder UI.
- `7ed65c3088` added movie add/edit/delete/monitor/profile/root/manual-search UI.
- `0b5d2a1553` added TV manual add/edit/delete/monitor/season/episode search UI.
- `688ac6f283` added profile create/edit/delete/apply-bundle UI.
- `ab7f7dbffa` added queue delete-files and clear-error actions.
- `f8c3a19976` added persisted Playwright operator smoke tests and deterministic e2e fixtures.
- `a42c44f420` added TMDB TV search/details/season metadata support.
- `9ebe255f06` added the metadata-backed TV add flow that creates seasons and episodes.
- `0438ca577f` imported Sonarr episodes, files, monitored flags, air dates, and existing quality data.
- `6cb918f655` added movie and series metadata refresh jobs plus scheduler integration.
- `bf7597a151` added a calendar UI populated from real monitored episode air dates.
- `42142ccd4f` persisted completed download output paths from qBittorrent/SABnzbd into queue rows.
- `a99bda9144` added `MediaImportService`, movie/episode import file operations, and monitor-driven completed download imports.
- `01dd5263dd` added dedicated `media_files` and `remote_path_mappings` persistence, plus remote path resolution during imports.
- `5b249551de` added remote path mapping workflows, manual movie/episode import, library scanning, rename preview/action, and matching UI on settings/movie/TV pages.
- `566abf0e25` added a persistent release blocklist table and blocks matching future release candidates.
- `4df7222527` split high-impact release decisions into specification modules with target title/year/episode/season, size, and torrent seeder checks.
- `fcb481448b` added release free-space and active queue conflict guardrails.
- `1a2d1e0eec` added configurable release guardrails for protocol availability, minimum age, retention, seeders, and required/ignored/preferred release terms.
- `6af5da144a` added TV release edge checks for unaired episodes, multi-episode releases, multi-season packs, and anime absolute episode numbering.
- `0ab6b74069` expanded the title parser test corpus with vendor-inspired release fixtures.
- `b6864bf5f3` added first-pass indexer definition, proxy, and statistics persistence for the selected Prowlarr replacement path.
- `62b0ac1be0` exposed authenticated aggregate Torznab/Newznab XML feeds for external clients.
- `e2ee3e17b8` added a Cardigann-style YAML definition loader and seeded a tiny curated fixture set.
- `6d5a81b696` applied stored HTTP/SOCKS/FlareSolverr proxy settings to outbound Torznab/Newznab requests.
- `f0c0dcb22d` added first-pass indexer search health/backoff handling and automatic disable on authentication failures.
- `a13d8210db` added a first-pass Cardigann YAML search runtime for definition-keyed GET/XML searches.
- `cc1e4cb6b0` added version-aware built-in indexer definition refresh reporting.
- `cf365fed05` added persisted Radarr/Sonarr application records and first-pass aggregate Torznab/Newznab app sync.
- `ea6689495f` added URL-backed Cardigann definition source refresh and DB-backed Cardigann runtime loading.
- `a26561d100` added scheduler-driven refresh for enabled URL-backed Cardigann definition sources.
- `63bcbd41a4` added scheduler-driven Radarr/Sonarr aggregate app sync for enabled applications.
- `d10e8ad82b` added SHA-256 checksum provenance and optional pin verification for URL-backed Cardigann definition sources.
- `bc07c31138` added first-pass per-indexer search policy controls for minimum seeders and query cooldowns.
- `b478385cec` triggered enabled Radarr/Sonarr aggregate app sync after indexer add/update/remove mutations.
- `160651db17` pruned stale remote aggregate app indexers during full app sync.
- `abd28a549d` added Cardigann POST form search path execution for definition-keyed indexers.
- `23569d525d` added Cardigann request header template execution for definition-keyed indexers.
- `a3a8eeaf68` added app-specific torrent seed criteria to aggregate Radarr/Sonarr indexer sync.
- `fa94a0127e` added first-pass rolling query-limit controls for indexers.
- `f781688327` added a Nyaa RSS Cardigann definition to the curated built-in catalogue.
- `1a8499c821` added first-pass rolling grab-limit controls for automatic indexer grabs.
- `1d802069da` added first-pass checksum-pinned catalog manifest import for URL-backed indexer definition sources.
- `213dba943d` added first-pass Cardigann request template filters.
- `6c8a940348` added encrypted definition-specific indexer config/auth values for adapters.
- `c7407922a5` added first-pass indexer definition config/auth UI and preserves omitted stored config secrets on edit.
- `0d39c38d8f` expanded the curated built-in indexer definitions with Prowlarr-derived Torznab-compatible AnimeTosho, MoreThanTV, and Torrent Network coverage.
- `136e8b7ae1` added HDAccess to the curated Cardigann built-in catalogue.
- `b381e4ea10` added Anidex to the curated Cardigann built-in catalogue with first-pass HTML selector coverage.
- `1c931c4836` added TorrentsCSV to the curated Cardigann built-in catalogue with first-pass JSON selector coverage.
- `c535a77f25` added SubsPlease to the curated Cardigann built-in catalogue with first-pass JSON selector coverage.
- `60590b7807` added Knaben to the curated Cardigann built-in catalogue with first-pass JSON POST body coverage.
- `95b069c39c` added TorrentDay to the curated Cardigann built-in catalogue with first-pass cookie-auth JSON selector coverage.
- `819260b4f0` added IPTorrents to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage.
- `7a93b3a294` added RetroFlix to the curated Cardigann built-in catalogue with first-pass SpeedApp JSON selector coverage.
- `874c95b163` added SpeedApp.io to the curated Cardigann built-in catalogue with first-pass SpeedApp JSON selector coverage and Prowlarr-derived category mappings.
- `0d1e8a9198` added BeyondHD to the curated Cardigann built-in catalogue with first-pass JSON POST coverage and Prowlarr-derived category mappings.
- `28d4e07ce4` added BitHDTV to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage and Prowlarr-derived category mappings.
- `cbfb7d0ecd` added TorrentBytes to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
- `3bf7bd73f0` added TorrentSyndikat to the curated Cardigann built-in catalogue with first-pass API-key JSON selector coverage and Prowlarr-derived category mappings.
- `7be0a08256` added SceneHD to the curated Cardigann built-in catalogue with first-pass passkey JSON selector coverage and Prowlarr-derived category mappings.
- `6909b2b59a` added SceneTime to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage and Prowlarr-derived category mappings.
- `2f516b7ad2` added HD-Space to the curated Cardigann built-in catalogue with first-pass form-login HTML selector coverage and Prowlarr-derived category mappings.
- `5841a0de96` added SpeedCD to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage and Prowlarr-derived category mappings.
- `d21e23b1b0` added HD-Torrents to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
- `edd17d0e53` added FunFile to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
- `a486a0f6d2` added ImmortalSeed to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage, freeleech filtering, and Prowlarr-derived category mappings.
- `ba660eed61` added XSpeeds to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage, freeleech filtering, and Prowlarr-derived category mappings.
- `79ec2e8e9f` added Xthor to the curated Cardigann built-in catalogue with first-pass passkey JSON API selector coverage and Prowlarr-derived category mappings.
- `cb45caf5dc` added HDBits to the curated Cardigann built-in catalogue with first-pass username/passkey JSON POST body coverage, freeleech filtering, and Prowlarr-derived category mappings.
- `36b0b8b6b7` added RevolutionTT to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
- `05a9b68d80` added PreToMe to the curated Cardigann built-in catalogue with first-pass form-login HTML selector coverage and Prowlarr-derived category mappings.
- `69cf6b9735` added AnimeTorrents to the curated Cardigann built-in catalogue with first-pass cookie-auth AJAX HTML selector coverage and Prowlarr-derived category mappings.
- `12e9130bc1` added BakaBT to the curated Cardigann built-in catalogue with first-pass form-login HTML selector coverage and Prowlarr-derived category mappings.
- `0c4c94f97a` added Nebulance to the curated Cardigann built-in catalogue with first-pass JSON-RPC API selector coverage and Prowlarr-derived TV category mappings.
- `25a0dc632b` added ShizaProject to the curated Cardigann built-in catalogue with first-pass GraphQL JSON selector coverage and Prowlarr-derived category mappings.
- `a515123cad` exposed first-pass indexer tags and search/RSS flags in Settings.
- `3915c4f987` exposed first-pass indexer proxy management and assignment controls in Settings.
- `1528454d10` exposed first-pass indexer statistics in Settings.
- `737019c547` exposed first-pass URL-backed definition source management and checksum-pinned catalog imports in Settings.
- `0186ed7e03` exposed first-pass Radarr/Sonarr indexer application sync controls in Settings.
- `fc4d30ab51` exposed first-pass built-in definition refresh controls in Settings.
- `ca8703c1bf` updated deterministic indexer definition tests for the expanded built-in catalogue.
- `beab879376` preserved app-side remote settings during aggregate Radarr/Sonarr app sync updates.
- `904f5f2301` separated Sonarr standard and anime category filters for aggregate app sync.
- `461f775f84` required catalog manifest SHA-256 pins before importing remote definition sources.
- `d25a75377d` accepted scalar Cardigann search request metadata and single-object search paths.
- `531749860e` rendered Cardigann select auth fields with options/defaults in Settings.
- `6a2427c3e1` preserved stale remote aggregate mappings during add-only Radarr/Sonarr app sync.
- `452d4fa31e` parsed Cardigann `caps.categories` dictionaries against the standard Newznab category tree.
- `3f649cd693` honored Cardigann path-level inherited input controls during search request construction.
- `7b2ffefb2c` applied first-pass Cardigann search keyword filters before request template rendering.
- `5f7dd7545c` narrowed rendered Cardigann category variables for path-scoped category matches.
- `d90c66e977` added first-pass Cardigann range template expansion for repeated request inputs.
- `842b2a7d50` honored Cardigann default category mappings when searches have no usable category match.
- `a795fd0cfa` parsed first-value Cardigann header lists for templated request headers.
- `6ed19d6ca8` rendered first-pass Cardigann base template variables (`.Config.sitelink`, `.True`, `.False`, and `.Today.Year`).
- `48056c4ecb` rendered first-pass Cardigann conditional/function templates (`if`, `and`, `or`, `eq`, `ne`, `join`, and `re_replace`).
- `c81aa8b04f` parsed Cardigann checkbox auth fields, skipped informational settings, rendered checkbox values as template booleans, and exposed checkbox controls in Settings.
- `b0e1ddd45e` added Cardigann `querystring` extraction for request template filters and search keyword filters.
- `5663be16be` added Cardigann `htmldecode` and `htmlencode` support for request template filters and search keyword filters.
- `0619ba169c` added Cardigann URL decode aliases for request template filters and URL alias/escape support for search keyword filters.
- `4722ffea22` rendered Cardigann auth field defaults into request templates when saved config values are omitted.
- `8413f1c228` honored per-indexer category restrictions during search request fan-out and defaulted uncategorized searches to each indexer's configured categories.
- `507b3f54ff` expanded Cardigann category mappings that reference multiple Newznab categories and deduped rendered tracker category values.
- `792edb9f9f` forwarded aggregate Torznab/Newznab offset and extended parameters into upstream adapters and Cardigann request templates.
- `c7f28739a2` parsed first-pass Cardigann HTML row and field selector results into release candidates.
- `c823a075c5` executed first-pass Cardigann login requests and reused returned session cookies for search requests.
- `ce1fbc321d` resolved simple nested Cardigann HTML descendant selectors inside their parent matches.
- `2a85bac051` merged selected Cardigann HTML rows with `rows.after` before field extraction.
- `ee3e2ca494` merged selected Cardigann HTML rows with `rows.before` before field extraction.
- `e06c4100ac` removed Cardigann HTML field descendants before text extraction.
- `d9d8b303da` resolved Cardigann HTML selector case mappings before text or attribute extraction.
- `db3595e479` matched Cardigann HTML field selectors against the current row before descendant lookup.
- `f5d7f029f1` added Cardigann `split` filter support for template pipelines and filter blocks.
- `d7e20f9054` added Cardigann direct cookie-login rendering and pre-seeded login cookies.
- `088bc912e3` added Cardigann login error selector handling.
- `d87983b4aa` added Cardigann one-url login request support.
- `ad7f728dbd` added first-pass Cardigann form login request support.
- `ae57eb9ba7` added Cardigann GET method form login submission support.
- `142c112518` added Cardigann form-login landing request method/input support.
- `819a628527` added first-pass Cardigann form login control serialization.
- `1f0e68c99b` added first-pass Cardigann form login selector-control resolution.
- `c42da0474d` added Cardigann form selector input support.
- `e5ef2b8b86` added Cardigann multipart form login support.
- `959d652111` added Cardigann login test selector support.
- `312aace651` added Cardigann form login CAPTCHA response submission support.
- `3f4f3ea996` added Cardigann automatic simpleCaptcha form login support.
- `419a2628d1` added first-pass Cardigann CAPTCHA auth field exposure for definitions that declare login CAPTCHA prompts.
- `8f75141e4b` added first-pass Cardigann informational auth field exposure for cookie/2FA guidance in Settings.
- `ce71926914` added first-pass Cardigann relative-time field filter support.
- `45569da917` added first-pass Cardigann `dateparse`/`timeparse` field filter support.
- `b42741f6b6` added first-pass Cardigann HTML row `andmatch` filter support.
- `bdd11e9ea5` added first-pass Cardigann HTML date header support.
- `a38543762d` added first-pass Cardigann `diacritics`, `fuzzytime`, `validate`, and `validfilename` field filter support.
- `57456f0b2a` added first-pass Cardigann `jsonjoinarray` filter support.
- `a0271d2abd` added first-pass Cardigann JSON response selector parsing.
- `81750712ec` added first-pass Cardigann search preprocessing filter support.
- `2153bf90d5` added first-pass Cardigann response no-results message handling.
- `a1568e3181` added first-pass Cardigann JSON row count/attribute metadata support.
- `1934d57305` added first-pass Cardigann JSON parent selector support.
- `da5601ab46` added first-pass Cardigann JSON positional selector support.
- `17cb414e4a` added first-pass Cardigann JSON selector-list support.
- `78f985cff8` added first-pass Cardigann HTML attribute operator support.
- `d9374db3ed` added first-pass Cardigann HTML attribute selector flag support.
- `2dc53ee17c` added first-pass Cardigann HTML selector escaping support.
- `16425ac40f` added first-pass Cardigann HTML escaped attribute-name selector support.
- `01c5a34af4` added first-pass Cardigann HTML matching pseudo selector support.
- `f71e25961d` added first-pass Cardigann HTML escaped selector delimiter support.
- `12dd243a53` added first-pass Cardigann HTML quoted attribute delimiter support.
- `9920bfa344` added first-pass Cardigann HTML pseudo selector tail support.
- `ebeaef302f` covered first-pass Cardigann HTML content-state pseudo selector support.
- `188ccd5820` added first-pass Cardigann JSON selector pseudo-filter support.
- `bb2cba02f7` added first-pass Cardigann XML response selector parsing.
- `32605787fb` added first-pass Cardigann `magnet` result-field aliasing.
- `2fa6d71887` added first-pass Cardigann `categorydesc` result-field mapping.
- `4b9f7a0b49` added first-pass Cardigann HTML selector pseudo-filter support.
- `9babda5f74` added first-pass Cardigann HTML positional selector filter support.
- `0fd6d81ea3` added first-pass Cardigann HTML selector-list support.
- `d1b03430a2` added first-pass Cardigann HTML direct-child selector support.
- `b7c6c0ce5f` added first-pass Cardigann HTML void element and state pseudo-class selector support.
- `5e28e69337` added first-pass Cardigann HTML child-position pseudo-class selector support.
- `ab3ab70cbc` added first-pass Cardigann HTML nth-child pseudo-class selector support.
- `58aef2d4e5` added first-pass Cardigann HTML nth-last-child pseudo-class selector support.
- `c3dfb78453` added first-pass Cardigann HTML of-type pseudo-class selector support.
- `e06360237f` added first-pass Cardigann HTML only-child pseudo-class selector support.
- `0aaf9248fd` added first-pass Cardigann HTML sibling combinator selector support.
- `bf9153875a` added first-pass Cardigann HTML form pseudo-class selector support.
- `ccd3b03238` added first-pass Cardigann HTML visibility pseudo-class selector support.
- `b39e211dc6` added first-pass Cardigann HTML header pseudo-class selector support.
- `753f905231` added first-pass Cardigann HTML root pseudo-class selector support.
- `45e594bd6a` added first-pass Cardigann HTML language pseudo-class selector support.
- `e041547e70` added first-pass Cardigann HTML selector template rendering.
- `da6e4c3605` preserved Cardigann zero volume factors for freeleech-style result fields.
- `5b1e926ded` added first-pass Cardigann field-name modifier handling.
- `20f0343d60` preserved existing Cardigann field values when optional selectors are empty.

Milestones 1, 2, 3, and 4 are complete for deterministic local coverage against the current backend surface. Milestone 5 now has a first-pass foundation: persisted generic indexer definitions, a Cardigann-style YAML fixture loader with Nyaa RSS, Anidex HTML selector, TorrentsCSV JSON selector, SubsPlease JSON selector, Knaben JSON POST body, TorrentDay cookie-auth JSON selector, IPTorrents cookie-auth HTML selector, RetroFlix and SpeedApp.io JSON selectors, BeyondHD JSON POST selector, BitHDTV cookie-auth HTML selector, TorrentBytes POST-login HTML selector, TorrentSyndikat API-key JSON selector, SceneHD passkey JSON selector, SceneTime cookie-auth HTML selector, HD-Space form-login HTML selector, SpeedCD cookie-auth HTML selector, HD-Torrents POST-login HTML selector, FunFile POST-login HTML selector, ImmortalSeed POST-login HTML selector, XSpeeds POST-login HTML selector, Xthor passkey JSON API selector, HDBits username/passkey JSON POST selector, RevolutionTT POST-login HTML selector, PreToMe form-login HTML selector, AnimeTorrents cookie-auth AJAX HTML selector, BakaBT form-login HTML selector, Nebulance JSON-RPC API selector, ShizaProject GraphQL JSON selector, AnimeTosho, MoreThanTV, HDAccess, and Torrent Network coverage, encrypted definition-specific config/auth values with first-pass Settings UI inputs including select options/defaults, checkbox controls, informational auth notes, and manual CAPTCHA fields, editable tags/search/RSS flags, proxy controls, stats readouts, built-in definition refresh controls, definition source/catalog management controls, and Radarr/Sonarr app-sync controls, definition-keyed GET/POST XML/raw-body search execution with request template filters including `querystring`, `split`, URL decode aliases, and HTML entity and JSON escape filters, search keyword filters including `querystring`, `split`, URL alias/escape filters, and HTML entity and JSON escape filters, search preprocessing filters, response no-results message handling, range template expansion, base template variables, conditional/function template helpers, checkbox config booleans, auth-default config rendering, scalar and list-valued templated request headers, single-object search paths, scalar static request input/category normalization, `caps.categories` dictionary parsing against the standard Newznab category tree, multi-Newznab category mapping expansion, default category fallback, path-scoped category narrowing, path-level inherited input controls, first-pass HTML row/field selector result parsing with simple descendant selector scoping, `rows.after`/`rows.before` merging, row filter support, date header support, field descendant removal, selector case mappings, field selector self-matching, HTML selector attribute operators, case-insensitive HTML selector attribute flags, escaped HTML selector identifiers, HTML selector escaped attribute names, escaped HTML selector delimiters, HTML selector quoted attribute delimiters, HTML selector matching pseudo-classes, HTML selector pseudo-tail simple parts, HTML selector content-state pseudo-classes, HTML selector pseudo-filters, HTML selector positional filters, HTML selector direct-child combinators, HTML void element selectors, HTML selector state pseudo-classes, HTML selector form pseudo-classes, HTML selector visibility pseudo-classes, HTML selector header pseudo-classes, HTML selector root pseudo-classes, HTML selector language pseudo-classes, HTML selector child-position pseudo-classes, HTML selector nth-child pseudo-classes, HTML selector nth-last-child pseudo-classes, HTML selector of-type pseudo-classes, HTML selector only-child pseudo-classes, HTML selector sibling combinators, HTML selector list support, HTML selector template rendering, first-pass JSON response row/field selector parsing with row count/attribute metadata, parent selectors, selector positional filters, selector lists, and selector pseudo-filters, first-pass XML response selector parsing, magnet result-field aliasing, categorydesc result-field mapping, zero volume-factor preservation, field-name modifier handling, optional field fallback preservation, and relative-time, fuzzy-date, formatted-date, Unix timestamp, JSON array-join, validation, diacritics, and filename field filters, first-pass login request execution with pre-seeded login cookies, direct cookie-login rendering, one-url login requests, form login requests, GET method form login submissions, form-login landing request methods and inputs, form login control serialization, selector-resolved form login controls, multipart form login submissions, selector-derived form login values, configured CAPTCHA response submission, automatic simpleCaptcha form handling, login error selectors, login test selectors, manual CAPTCHA and informational auth-field exposure, and session-cookie reuse, and per-indexer category-restricted search fan-out, version-aware built-in definition refresh, URL-backed Cardigann definition source refresh with DB-backed runtime loading, scheduler execution, checksum pinning, and checksum-required catalog manifest import, proxy configuration records applied to outbound requests, indexer search stats and health/backoff state, per-indexer minimum-seeder, query-cooldown, and rolling query/grab-limit controls, authenticated aggregate Torznab/Newznab feeds with offset/extended metadata forwarding, and first-pass Radarr/Sonarr aggregate app sync with scheduler execution, indexer add/update/remove triggers, full-sync stale remote aggregate cleanup, add-only stale mapping preservation, app-side remote setting retention for updates, separate Sonarr anime category sync, and app-specific torrent seed criteria. Milestone 3 still needs live qBittorrent/SABnzbd fixture validation in an environment with those services running, and later milestone 5 work remains required before ARR Hub can honestly claim Prowlarr replacement-grade behavior.

## Current Functionality Inventory

Backend/service surfaces:

- `src/db/schema.ts`: core tables for admin auth, media, profiles, integrations, queue, Plex/session analytics, notifications, plugins, release decisions, scheduler, and onboarding.
- `src/effect/services/MovieService.ts`: CRUD/list/lookup over local movie rows.
- `src/effect/services/SeriesService.ts`: CRUD/list/local lookup, season/episode monitor toggles, and monitored episode calendar queries.
- `src/effect/services/TmdbClient.ts`: movie TMDB search/details/popular/trending plus TV search/details/season hydration.
- `src/effect/services/IndexerService.ts`, `src/effect/services/CardigannDefinitionLoader.ts`, `src/effect/services/CardigannAdapter.ts`, `src/effect/services/TorznabAdapter.ts`, `src/effect/services/IndexerDefinitionSourceService.ts`, and `src/effect/services/IndexerApplicationService.ts`: Torznab/Newznab connection testing and search, generic and curated Cardigann-style first-party definition seeding including Nyaa RSS, Anidex HTML selector, TorrentsCSV JSON selector, SubsPlease JSON selector, Knaben JSON POST body, TorrentDay cookie-auth JSON selector, IPTorrents cookie-auth HTML selector, RetroFlix and SpeedApp.io JSON selectors, BeyondHD JSON POST selector, BitHDTV cookie-auth HTML selector, TorrentBytes POST-login HTML selector, TorrentSyndikat API-key JSON selector, SceneHD passkey JSON selector, SceneTime cookie-auth HTML selector, HD-Space form-login HTML selector, SpeedCD cookie-auth HTML selector, HD-Torrents POST-login HTML selector, FunFile POST-login HTML selector, ImmortalSeed POST-login HTML selector, XSpeeds POST-login HTML selector, Xthor passkey JSON API selector, HDBits username/passkey JSON POST selector, RevolutionTT POST-login HTML selector, PreToMe form-login HTML selector, AnimeTorrents cookie-auth AJAX HTML selector, BakaBT form-login HTML selector, Nebulance JSON-RPC API selector, ShizaProject GraphQL JSON selector, plus Prowlarr-derived Torznab-compatible AnimeTosho, MoreThanTV, HDAccess, and Torrent Network coverage, encrypted definition-specific config/auth values with update-time preservation of omitted stored secrets, first-pass select, checkbox, informational, and manual CAPTCHA auth field parsing/rendering, tag and search/RSS flag persistence, version-aware built-in definition refresh, URL-backed Cardigann definition source refresh with stored raw YAML, SHA-256 provenance/pinning, checksum-required catalog manifest import with required per-source pins, and enabled-source scheduler refresh, first-pass Cardigann GET/POST XML/raw-body search execution with request template filters including `querystring`, `split`, URL decode aliases, and HTML entity and JSON escape filters, search keyword filters including `querystring`, `split`, URL alias/escape filters, and HTML entity and JSON escape filters, search preprocessing filters, response no-results message handling, range template expansion, base template variables, conditional/function template helpers, checkbox config booleans, auth-default config rendering, scalar and list-valued templated request headers, single-object search paths, scalar static request input/category normalization, `caps.categories` dictionary parsing against the standard Newznab category tree, multi-Newznab category mapping expansion, default category fallback, path-scoped category narrowing, path-level inherited input controls, first-pass HTML row/field selector result parsing with simple descendant selector scoping, `rows.after`/`rows.before` merging, row filter support, date header support, field descendant removal, selector case mappings, field selector self-matching, HTML selector attribute operators, case-insensitive HTML selector attribute flags, escaped HTML selector identifiers, HTML selector escaped attribute names, escaped HTML selector delimiters, HTML selector quoted attribute delimiters, HTML selector matching pseudo-classes, HTML selector pseudo-tail simple parts, HTML selector content-state pseudo-classes, HTML selector pseudo-filters, HTML selector positional filters, HTML selector direct-child combinators, HTML void element selectors, HTML selector state pseudo-classes, HTML selector form pseudo-classes, HTML selector visibility pseudo-classes, HTML selector header pseudo-classes, HTML selector root pseudo-classes, HTML selector language pseudo-classes, HTML selector child-position pseudo-classes, HTML selector nth-child pseudo-classes, HTML selector nth-last-child pseudo-classes, HTML selector of-type pseudo-classes, HTML selector only-child pseudo-classes, HTML selector sibling combinators, HTML selector list support, HTML selector template rendering, first-pass JSON response row/field selector parsing with row count/attribute metadata, parent selectors, selector positional filters, selector lists, and selector pseudo-filters, first-pass XML response selector parsing, magnet result-field aliasing, categorydesc result-field mapping, zero volume-factor preservation, field-name modifier handling, optional field fallback preservation, and relative-time, fuzzy-date, formatted-date, Unix timestamp, JSON array-join, validation, diacritics, and filename field filters, and first-pass login request execution with pre-seeded login cookies, direct cookie-login rendering, one-url login requests, form login requests, GET method form login submissions, form-login landing request methods and inputs, form login control serialization, selector-resolved form login controls, multipart form login submissions, selector-derived form login values, configured CAPTCHA response submission, automatic simpleCaptcha form handling, login error selectors, login test selectors, manual CAPTCHA and informational auth-field exposure, and session-cookie reuse, per-indexer category-restricted search fan-out, proxy configuration persistence and outbound application, search stats, first-pass search health/backoff, per-indexer minimum-seeder, query-cooldown, and rolling query/grab-limit policy controls, aggregate protocol capability support, aggregate offset/extended metadata forwarding, and persisted Radarr/Sonarr aggregate app sync with enabled-app scheduler refresh, indexer mutation triggers, full-sync stale remote aggregate cleanup, add-only stale mapping preservation, remote app-side setting retention during updates, separate Sonarr anime category sync, and app-specific torrent seed criteria.
- `src/effect/services/DownloadClientService.ts`, `QBittorrentAdapter.ts`, `SABnzbdAdapter.ts`: add/list/test/grab/queue/remove downloads for qBittorrent and SABnzbd, including persisted completed output paths.
- `src/effect/services/ReleasePolicyEngine.ts`: parses titles, checks allowed quality, custom format score, and basic upgrade scoring.
- `src/effect/services/AcquisitionPipeline.ts`: movie search/evaluate/grab, episode search/evaluate/grab, season pack first search, series search.
- `src/effect/services/MediaImportService.ts`: imports completed movie and episode files from downloader output paths, applies remote path mappings, filters samples, applies copy/move/hardlink settings, builds target names, stores real file paths, media file records, and quality state, supports manual import, scans existing libraries, and previews/applies renames.
- `src/effect/services/DownloadMonitor.ts`: polls download clients, updates queue rows, calls media import for completed linked downloads, leaves failed imports visible in queue, triggers Plex library refresh.
- `src/effect/services/MediaServerService.ts` and `PlexAdapter.ts`: Plex connection, libraries, library sync matching, refresh, active sessions, shared users.
- `src/effect/services/PlexSessionMonitor.ts`: active stream monitoring and notification trigger emission.
- `src/effect/services/NotificationService.ts`: in-app and webhook notification channels.
- `src/effect/services/SchedulerService.ts` and `SchedulerLoop.ts`: recurring RSS/cutoff/download monitor jobs, TV job types, and metadata refresh jobs.
- `src/effect/services/MetadataRefreshService.ts`: refreshes movie and series metadata from TMDB and upserts season/episode data.
- `src/effect/services/ImportService.ts`: one-time setup import from Radarr movies and Sonarr series, including Sonarr seasons, episodes, file paths, monitored state, and existing quality.
- `src/effect/services/PluginLoader.ts`: trusted local plugin loading.

UI surfaces:

- Dashboard, Movies list/detail, TV list/detail, and TV episode calendar.
- Movies: TMDB search/add, edit/delete, monitor toggle, profile/root assignment, manual release evaluate/grab, manual file import, and rename preview/action.
- TV: TMDB metadata search/add with season/episode hydration, manual series add with season/episode scaffolding, edit/delete, show/season/episode monitor toggles, series/season search, episode evaluate/grab, manual episode file import, and series rename preview/action.
- Activity queue/history/users/stats. Queue supports retry, remove with delete-files option, clear error, and blocklist.
- Settings: indexers, download clients, media servers, scheduler, general, media management/root folders/remote path mappings/library scan, notifications, profiles, security, and plugins now have operational UI. Indexer settings also include first-pass Cardigann definition selection, definition-specific config/auth field inputs including select options/defaults, checkbox controls, informational auth notes, and manual CAPTCHA fields without exposing stored secret values, tags, search/RSS toggles, proxy management/assignment controls, stats readouts, built-in definition refresh controls, definition source/catalog management controls with required catalog manifest pins, and Radarr/Sonarr app-sync controls including Sonarr anime category filters.
- Onboarding quickstart and advanced wizard.
- System diagnostics view.

## Vendor Reference Baseline

Use these local vendor areas as feature references:

- Sonarr core: `vendor/sonarr/src/NzbDrone.Core/Tv`, `MediaFiles/EpisodeImport`, `IndexerSearch`, `DecisionEngine/Specifications`, `Download`, `Queue`, `Blocklisting`, `ImportLists`, `Organizer`, `DataAugmentation/Scene`, `DataAugmentation/Xem`, `Notifications`, `RemotePathMappings`, `HealthCheck`.
- Radarr core: `vendor/radarr/src/NzbDrone.Core/Movies`, `MediaFiles/MovieImport`, `IndexerSearch`, `DecisionEngine/Specifications`, `Download`, `Queue`, `Blocklisting`, `ImportLists`, `Organizer`, `MovieStats`, `Notifications`, `RemotePathMappings`, `HealthCheck`.
- Prowlarr core: `vendor/prowlarr/src/NzbDrone.Core/Indexers`, `Indexers/Definitions`, `IndexerProxies`, `IndexerStats`, `IndexerVersions`, `Applications`, `Download`, `History`, `Notifications`.

Important scale differences visible in vendor:

- Radarr has 31 decision-engine specification files; Sonarr has 41. ARR Hub now has a compact release specification module covering high-impact local guardrails, but not the full vendor rule surface.
- Prowlarr has 143 files under `Indexers/Definitions` and 16 first-level definition families. ARR Hub has generic Torznab/Newznab consumption, a small Cardigann-style built-in set including Nyaa RSS, Anidex HTML selector, TorrentsCSV JSON selector, SubsPlease JSON selector, Knaben JSON POST body, TorrentDay cookie-auth JSON selector, IPTorrents cookie-auth HTML selector, RetroFlix and SpeedApp.io JSON selectors, BeyondHD JSON POST selector, BitHDTV cookie-auth HTML selector, TorrentBytes POST-login HTML selector, TorrentSyndikat API-key JSON selector, SceneHD passkey JSON selector, SceneTime cookie-auth HTML selector, HD-Space form-login HTML selector, SpeedCD cookie-auth HTML selector, HD-Torrents POST-login HTML selector, FunFile POST-login HTML selector, ImmortalSeed POST-login HTML selector, XSpeeds POST-login HTML selector, Xthor passkey JSON API selector, HDBits username/passkey JSON POST selector, RevolutionTT POST-login HTML selector, PreToMe form-login HTML selector, AnimeTorrents cookie-auth AJAX HTML selector, BakaBT form-login HTML selector, Nebulance JSON-RPC API selector, ShizaProject GraphQL JSON selector, AnimeTosho, MoreThanTV, HDAccess, and Torrent Network coverage, manually configured URL-backed Cardigann source refresh with scheduler execution, and aggregate app sync, but not broad tracker coverage.
- Sonarr/Radarr support many download client families: qBittorrent, SABnzbd, NZBGet, Transmission, Deluge, rTorrent, uTorrent, Download Station, blackhole, and others. ARR Hub has qBittorrent and SABnzbd.
- Sonarr/Radarr have full media import pipelines with manual import, sample detection, free-space checks, upgrade checks, folder matching, grabbed-release matching, and naming services. ARR Hub now has a deterministic first-pass import pipeline with manual import, remote path mappings, library scan, rename preview/action, and media file records, but still lacks full vendor import rejection depth.

## Replacement-Grade Definition

ARR Hub should be considered viable only when it can do the following without direct database edits or custom scripts:

1. Add, discover, monitor, search, grab, import, rename, upgrade, and remove movies and TV episodes.
2. Manage indexers directly or expose a clear Prowlarr-equivalent indexer aggregation/proxy surface.
3. Connect to common download clients and reliably import completed downloads.
4. Apply release decisions with enough rules to avoid bad grabs and prevent repeated failed grabs.
5. Persist history, blocklists, health, logs, and settings across restarts.
6. Provide an operator UI for the full day-to-day workflow.
7. Run in Docker/NAS environments with correct media/download volume and permission behavior.
8. Either expose compatible Sonarr/Radarr/Prowlarr REST APIs or explicitly document that existing ecosystem clients are not drop-in compatible.

## P0 Release Blockers

### 1. Finish Operator UI For Core Workflows

Current state:

- Core operator pages now exist for settings, movies, TV, profiles, queue, scheduler, and calendar.
- The UI covers the current backend surface for configuration, add/search/manage, manual release inspection, queue actions, and metadata-backed TV adds.
- Deeper UI work now depends mostly on backend surfaces that do not exist yet, especially Prowlarr-scale indexer management, additional download clients, NAS health checks, and any future compatibility APIs. Media import, rename/rescan, and richer release decision reasons now have first-pass UI/backend coverage.

Gap:

- The core UI gap is closed for the current backend, but replacement-grade UI will still need to expose the later backend features as they are built.

Tasks:

- Build CRUD/test forms for indexers, download clients, media servers, root folders, and scheduler config.
- Build movie add/search UI using TMDB search and movie details.
- Build TV add/search UI after TV metadata support exists.
- Build manual search/evaluate/grab UI for movies, series, seasons, and episodes.
- Add edit/delete/monitor toggles, quality profile selection, root folder selection, and status filters.
- Add profile create/edit/delete/apply bundle UI, not just inspect/preview.
- Add queue actions with delete-files option and clear error handling.
- Add scheduler jobs/config UI with pause/resume/retry and recent job details.

Acceptance criteria:

- A fresh install can be configured entirely from UI after onboarding.
- A user can add a movie/show, search, manually inspect releases, grab one, see queue progress, and see the item become available.
- Existing backend procedures have matching user-facing paths or are intentionally internal.

### 2. Build Real Metadata Lifecycle

Current state:

- `TmdbClient` supports movies, TV search/details, and TV season hydration.
- Movie and TV add flows can hydrate metadata before insert.
- Series metadata refresh upserts seasons and episodes while preserving monitored/file state.
- Sonarr import now imports series, seasons, episodes, file status, file paths, monitored flags, air dates, and existing quality.
- The calendar UI is populated from monitored episode air dates.

Gap:

- The minimum metadata lifecycle is implemented, but Sonarr/Radarr parity still requires deeper artwork handling, alternate titles, ratings, availability rules, certification details, provider parity, and local cover caching.

Tasks:

- Add TV metadata provider support. Use TVDB/SkyHook-compatible behavior from `vendor/sonarr/src/NzbDrone.Core/MetadataSource/SkyHook` as the reference, or choose a current API and document credentials.
- Extend schema for external IDs and metadata fields:
  - Movies: imdbId, originalTitle, runtime, release dates, minimum availability, alternate titles, collections, ratings, metadata refresh timestamp.
  - Series: tvdbId plus imdb/tmdb where available, series type, certification, genres, network, runtime, status, alternate titles, metadata refresh timestamp.
  - Episodes: external IDs, season/episode/absolute episode numbers, title, air date/time, overview, monitored state, file linkage.
- Implement metadata refresh jobs for movies and series.
- Implement "Add Movie" and "Add Series" flows that hydrate metadata before insert.
- Fix `ImportService.importFromSonarr` to import episodes, file status, episode file paths, monitored flags, air dates, and existing quality when available.
- Add image handling strategy. At minimum store remote artwork URLs consistently; later add local cover cache like Sonarr/Radarr.

Acceptance criteria:

- Adding a TV show creates seasons and episodes automatically.
- Existing series stay current after metadata refresh.
- Sonarr import preserves episodes and available/missing state.
- Calendar is populated from real episode air dates.

### 3. Implement Media File Import, Rename, And Library Scanning

Current state:

- `DownloadMonitor.checkCompletions` now calls `MediaImportService` for completed queue items linked to movies or episodes.
- qBittorrent and SABnzbd adapters now persist completed output paths into `download_queue.output_path`.
- `MediaImportService` inspects downloaded files, filters sample files, chooses the largest movie file, matches simple episode files by season/episode, copy/move/hardlinks into root folders, applies movie naming settings, writes real `filePath` values, and stores imported quality state.
- Failed imports are left in the queue with a visible error instead of being deleted.
- `RootFolderService` records paths and best-effort disk space only.

Gap:

- This remains one of the largest gaps versus Sonarr/Radarr. ARR Hub now has a usable completed download import foundation with remote path mappings, manual import, media file records, library scan, and rename workflows, but it does not yet have free-space checks, unpack/repair state handling beyond downloader status, full import decision parity, or recycle-bin behavior.

Tasks:

- [x] Create a `MediaImportService` or equivalent with movie and episode import paths.
- Use vendor references:
  - `vendor/radarr/src/NzbDrone.Core/MediaFiles/MovieImport`
  - `vendor/sonarr/src/NzbDrone.Core/MediaFiles/EpisodeImport`
  - `vendor/radarr/src/NzbDrone.Core/Organizer`
  - `vendor/sonarr/src/NzbDrone.Core/Organizer`
- Implement completed download import:
  - [x] Resolve download client output path.
  - [x] Apply remote path mappings.
  - [ ] Wait for unpacking/repair/post-processing to finish beyond downloader status normalization.
  - [x] Enumerate files and filter samples/extras.
  - [x] Parse title and match against grabbed media for basic movie and episode imports.
  - [ ] Reject wrong movie/show/episode, wrong season, split/multi-episode mismatches, low quality, and bad upgrades with Sonarr/Radarr-grade reasons.
  - [x] Move/copy/hardlink into root folder.
  - [x] Build final file name from naming settings for movies and deterministic TV episode naming.
  - [x] Store `filePath`, quality, and media info.
  - [x] Store file size/import date in dedicated media file records.
  - [x] Trigger media server library refresh after successful import.
- [x] Add manual import workflow.
- [x] Add rescan existing library workflow.
- [x] Add rename preview and rename action.
- [x] Add recycle bin/delete behavior or document explicit non-support. Current stance: recycle-bin behavior is explicitly not supported yet; queue delete-files delegates destructive removal to the download client only, and library file deletes remain out of scope until a dedicated safe-delete workflow exists.

Acceptance criteria:

- A completed qBittorrent or SABnzbd download results in a real file in the configured movie/series folder.
- Wrong files remain rejected with visible reasons.
- Repeated scheduler runs are idempotent.
- Existing libraries can be scanned into ARR Hub without coming from downloads.

### 4. Expand Release Decision Engine To Sonarr/Radarr Parity

Current state:

- `ReleasePolicyEngine` now evaluates a focused specification pipeline before scoring and upgrade decisions.
- `QueueService.blocklist` persists `release_blocklist` rows, and future searches reject matching title/download URL/infohash candidates for the same media context.
- `TitleParserService` handles common movie/TV patterns, season packs, proper/repack detection, and first-pass anime absolute episode numbering, with a vendor-inspired fixture corpus.
- Manual search records and displays accepted/skipped/rejected release decisions with clear rejection reasons.

Gap:

- The app is safer than the initial plan baseline, but it is still not Sonarr/Radarr parity. Remaining gaps include language profiles, tagged release profiles, media-file inspection, nuanced proper/repack/version upgrades, scene/XEM mapping, broader anime behavior, and a much larger parser fixture corpus.

Tasks:

- Split decision logic into specification modules modeled after:
  - `vendor/radarr/src/NzbDrone.Core/DecisionEngine/Specifications`
  - `vendor/sonarr/src/NzbDrone.Core/DecisionEngine/Specifications`
- Add persistent blocklist tables and check them during decision evaluation. Implemented for title/download URL/infohash matches by media context.
- Add title/year/ID matching so a release must actually match the target movie/show/episode. Implemented for target title/year/season/episode and first-pass absolute episode matching; external ID matching remains future work.
- Add size checks: minimum size, maximum size, acceptable size by runtime/quality, free disk space. Implemented fixed minimum/maximum and root-folder free-space checks; runtime/quality-specific size curves remain future work.
- Add protocol checks and per-indexer/per-download-client protocol restrictions. Implemented global allowed protocol settings and enabled download client protocol availability checks.
- Add queue conflict checks to avoid duplicate grabs. Implemented for active queue rows in movie/series/episode context.
- Add retention/minimum age/delay profile behavior. Implemented configurable minimum age and retention gates; full delay profile scheduling remains future work.
- Add torrent seed/leech/ratio/time constraints. Implemented configurable minimum seeders; ratio/time constraints remain future work.
- Add release restrictions: required, ignored, preferred terms, tags. Implemented global required/ignored/preferred terms; tag-scoped profiles remain future work.
- Add language support if replacement scope includes non-English libraries.
- Add hardcoded subtitle/sample/raw disk checks.
- Add repack/proper handling.
- Add TV-specific checks:
  - air date gating,
  - season pack only / full season,
  - multi-season packs,
  - split episodes,
  - same episode/season already grabbed,
  - anime absolute episode and version upgrades,
  - scene/XEM mapping.
    First-pass coverage now rejects unaired episode grabs, non-season-pack season results, multi-season packs, split/multi-episode single searches, active queue duplicates, and matching anime absolute episode releases. Anime version upgrades and scene/XEM mapping remain future work.
- Store and display every rejection reason in manual search.

Acceptance criteria:

- Manual search shows accepted/skipped/rejected decisions with clear reasons.
- Blocklisted releases are never grabbed again unless manually cleared.
- The unit suite covers each decision specification and key Sonarr/Radarr edge cases.

### 5. Decide Prowlarr Replacement Scope

Current state:

- ARR Hub can consume Torznab/Newznab endpoints.
- ARR Hub now seeds generic first-party Torznab/Newznab and small curated Cardigann-style YAML definition records including Nyaa RSS, Anidex HTML selector, TorrentsCSV JSON selector, SubsPlease JSON selector, Knaben JSON POST body, TorrentDay cookie-auth JSON selector, IPTorrents cookie-auth HTML selector, RetroFlix and SpeedApp.io JSON selectors, BeyondHD JSON POST selector, BitHDTV cookie-auth HTML selector, TorrentBytes POST-login HTML selector, TorrentSyndikat API-key JSON selector, SceneHD passkey JSON selector, SceneTime cookie-auth HTML selector, HD-Space form-login HTML selector, SpeedCD cookie-auth HTML selector, HD-Torrents POST-login HTML selector, FunFile POST-login HTML selector, ImmortalSeed POST-login HTML selector, XSpeeds POST-login HTML selector, Xthor passkey JSON API selector, HDBits username/passkey JSON POST selector, RevolutionTT POST-login HTML selector, PreToMe form-login HTML selector, AnimeTorrents cookie-auth AJAX HTML selector, BakaBT form-login HTML selector, Nebulance JSON-RPC API selector, ShizaProject GraphQL JSON selector, AnimeTosho, MoreThanTV, HDAccess, and Torrent Network coverage, stores encrypted definition-specific config/auth values for adapters, exposes first-pass definition selection, config/auth fields including select options/defaults, checkbox controls, informational auth notes, and manual CAPTCHA fields, tags, search/RSS flags, proxy controls, stats readouts, built-in definition refresh controls, definition source/catalog controls, and Radarr/Sonarr app-sync controls in Settings without revealing saved secrets, refreshes built-in definition versions with created/updated/unchanged reporting, refreshes manually configured URL-backed Cardigann definition sources into DB-backed runtime definitions with checksum provenance and optional SHA-256 pin verification, imports catalog manifests only when the manifest SHA-256 pin matches and every entry carries a source SHA-256 pin, refreshes enabled definition sources from the scheduler, executes first-pass definition-keyed Cardigann GET/POST XML/raw-body searches with request template filters including `querystring`, `split`, URL decode aliases, and HTML entity and JSON escape filters, search keyword filters including `querystring`, `split`, URL alias/escape filters, and HTML entity and JSON escape filters, search preprocessing filters, response no-results message handling, range template expansion, base template variables, conditional/function template helpers, checkbox config booleans, auth-default config rendering, scalar and list-valued templated request headers, single-object search paths, scalar static request input/category normalization, `caps.categories` dictionary parsing against the standard Newznab category tree, multi-Newznab category mapping expansion, default category fallback, path-scoped category narrowing, path-level inherited input controls, first-pass HTML row/field selector result parsing with simple descendant selector scoping, `rows.after`/`rows.before` merging, row filter support, date header support, field descendant removal, selector case mappings, field selector self-matching, HTML selector attribute operators, case-insensitive HTML selector attribute flags, escaped HTML selector identifiers, HTML selector escaped attribute names, escaped HTML selector delimiters, HTML selector quoted attribute delimiters, HTML selector matching pseudo-classes, HTML selector pseudo-tail simple parts, HTML selector content-state pseudo-classes, HTML selector pseudo-filters, HTML selector positional filters, HTML selector direct-child combinators, HTML void element selectors, HTML selector state pseudo-classes, HTML selector form pseudo-classes, HTML selector visibility pseudo-classes, HTML selector header pseudo-classes, HTML selector root pseudo-classes, HTML selector language pseudo-classes, HTML selector child-position pseudo-classes, HTML selector nth-child pseudo-classes, HTML selector nth-last-child pseudo-classes, HTML selector of-type pseudo-classes, HTML selector only-child pseudo-classes, HTML selector sibling combinators, HTML selector list support, HTML selector template rendering, first-pass JSON response row/field selector parsing with row count/attribute metadata, parent selectors, selector positional filters, selector lists, and selector pseudo-filters, first-pass XML response selector parsing, magnet result-field aliasing, categorydesc result-field mapping, zero volume-factor preservation, field-name modifier handling, optional field fallback preservation, and relative-time, fuzzy-date, formatted-date, Unix timestamp, JSON array-join, validation, diacritics, and filename field filters, and first-pass login request execution with pre-seeded login cookies, direct cookie-login rendering, one-url login requests, form login requests, GET method form login submissions, form-login landing request methods and inputs, form login control serialization, selector-resolved form login controls, multipart form login submissions, selector-derived form login values, configured CAPTCHA response submission, automatic simpleCaptcha form handling, login error selectors, login test selectors, manual CAPTCHA and informational auth-field exposure, and session-cookie reuse, persists and applies indexer proxy configuration records, records search statistics and first-pass search health/backoff state, enforces first-pass per-indexer category-restricted search fan-out, minimum-seeder, query-cooldown, and rolling query/grab-limit policies, exposes authenticated aggregate Torznab/Newznab XML feeds with offset/extended metadata forwarding at `/api/indexers/aggregate/torznab` and `/api/indexers/aggregate/newznab`, and persists Radarr/Sonarr application records for aggregate app sync with enabled-app scheduler refresh, indexer mutation triggers, full-sync stale remote aggregate cleanup, add-only stale mapping preservation, app-side tags/download-client/custom-field retention during remote updates, separate Sonarr standard/anime category fields, and app-specific torrent seed criteria.
- There is no broad first-party tracker catalogue, full Cardigann selector/login runtime beyond first-pass HTML selector/attribute-operator/attribute-flag/escaping/escaped-attribute-name/escaped-delimiter/quoted-attribute-delimiter/matching-pseudo-class/pseudo-tail/content-state-pseudo-class/case/pseudo-filter/positional-filter/direct-child-combinator/void-element/state-pseudo-class/form-pseudo-class/visibility-pseudo-class/header-pseudo-class/root-pseudo-class/language-pseudo-class/child-position-pseudo-class/nth-child-pseudo-class/nth-last-child-pseudo-class/of-type-pseudo-class/only-child-pseudo-class/sibling-combinator/selector-list/template-rendering/row-before-after-merge/row-filter/date-header/field-filter features, JSON response selector parsing with row count/attribute metadata, parent selectors, selector positional filters, selector lists, and selector pseudo-filters, XML response selector parsing, magnet result-field aliasing, categorydesc result-field mapping, zero volume-factor preservation, field-name modifier handling, optional field fallback preservation, search preprocessing filters, response no-results message handling, and cookie/one-url/form login execution with GET method submissions, form-login landing request methods/inputs, form-control serialization, selector-resolved controls, multipart forms, selector-derived form values, configured CAPTCHA responses, simpleCaptcha forms, manual CAPTCHA auth fields, informational auth notes, and login test selectors, richer indexer-specific auth UX beyond first-pass cookie/2FA notes, full rate-limit policy engine beyond query cooldowns and rolling query/grab limits, full trusted first-party remote definition catalogue distribution pipeline, or full Prowlarr app-sync parity for richer per-indexer and app-specific sync semantics.
- Product stance is Option A: ARR Hub should replace Prowlarr directly. Current Torznab/Newznab upstream consumption remains useful for migration and compatibility, but it is not the final replacement boundary.

Gap:

- If ARR Hub is meant to be a full Prowlarr replacement, it needs substantial first-party indexer infrastructure rather than only upstream Torznab/Newznab consumption.

Decision context:

- Option A is selected because the product goal is a true all-in-one replacement for Sonarr, Radarr, and Prowlarr without requiring users to keep Prowlarr installed upstream.
- Option B would be smaller and lower risk because ARR Hub could rely on external Torznab/Newznab providers, but it would weaken the replacement claim and leave indexer catalogue/proxy/app-sync behavior outside the app.
- The cost of Option A is ongoing maintenance: ARR Hub must own a moving catalogue of public/private tracker definitions, Cardigann/YAML support, proxies, rate limits, stats, definition updates, and mature app sync.
- Current Torznab/Newznab support should stay as a compatibility path, but not as the endpoint of the roadmap.

Tasks:

- [x] Decide the product stance:
  - Option A: ARR Hub replaces Prowlarr directly. Implement indexer definitions and proxy endpoints. Selected.
  - Option B: ARR Hub intentionally uses Prowlarr-compatible Torznab/Newznab upstreams. Not selected as the final product direction.
- [x] Update README and indexer UI copy to avoid claiming Prowlarr replacement before the decision is made.
- [ ] Implement Option A:
  - [x] Add a persisted first-party indexer definition model seeded with generic Torznab/Newznab definitions after reviewing `vendor/prowlarr/src/NzbDrone.Core/Indexers/Definitions`.
  - [x] Add Cardigann/YAML definition support with a small curated fixture set.
  - [x] Add first-pass Cardigann/YAML GET/XML request execution for definition-keyed indexers.
  - [x] Add first-pass Cardigann/YAML POST form request execution for definition-keyed indexers.
  - [x] Add first-pass Cardigann/YAML request header template execution for definition-keyed indexers.
  - [x] Add first-pass Cardigann header list parsing for request headers.
  - [x] Add first-pass Cardigann/YAML request template filters for definition-keyed indexers.
  - [x] Add first-pass Cardigann search keyword filters for definition-keyed indexers.
  - [x] Add first-pass Cardigann `querystring` support for request template and search keyword filters.
  - [x] Add first-pass Cardigann `split` support for request template and search keyword filters.
  - [x] Add first-pass Cardigann HTML entity filter support for request templates and search keywords.
  - [x] Add first-pass Cardigann search preprocessing filter support.
  - [x] Add first-pass Cardigann response no-results message handling.
  - [x] Add first-pass Cardigann URL decode/alias filter support for request templates and search keywords.
  - [x] Add first-pass Cardigann range template expansion for repeated request inputs.
  - [x] Add first-pass Cardigann base template variables for request templates.
  - [x] Add first-pass Cardigann conditional/function template helpers for request templates.
  - [x] Add first-pass Cardigann `caps.categories` dictionary parsing against the standard Newznab category tree.
  - [x] Add first-pass Cardigann multi-Newznab category mapping expansion.
  - [x] Add first-pass Cardigann default category mapping fallback.
  - [x] Add first-pass Cardigann path-scoped category narrowing for request templates.
  - [x] Add first-pass Cardigann path-level inherited input controls for search paths.
  - [x] Add first-pass Cardigann HTML row/field selector result parsing.
  - [x] Add first-pass Cardigann HTML descendant selector scoping.
  - [x] Add first-pass Cardigann HTML `rows.after`/`rows.before` merging.
  - [x] Add first-pass Cardigann HTML row filter support.
  - [x] Add first-pass Cardigann HTML date header support.
  - [x] Add first-pass Cardigann HTML field descendant removal.
  - [x] Add first-pass Cardigann HTML selector case mappings.
  - [x] Add first-pass Cardigann HTML field selector self-matching.
  - [x] Add first-pass Cardigann HTML attribute operator support.
  - [x] Add first-pass Cardigann HTML attribute selector flag support.
  - [x] Add first-pass Cardigann HTML selector escaping support.
  - [x] Add first-pass Cardigann HTML escaped attribute-name selector support.
  - [x] Add first-pass Cardigann HTML matching pseudo selector support.
  - [x] Add first-pass Cardigann HTML escaped selector delimiter support.
  - [x] Add first-pass Cardigann HTML quoted attribute delimiter support.
  - [x] Add first-pass Cardigann HTML pseudo selector tail support.
  - [x] Cover first-pass Cardigann HTML content-state pseudo selector support.
  - [x] Add first-pass Cardigann HTML selector pseudo-filter support.
  - [x] Add first-pass Cardigann HTML positional selector filter support.
  - [x] Add first-pass Cardigann HTML selector-list support.
  - [x] Add first-pass Cardigann HTML direct-child selector support.
  - [x] Add first-pass Cardigann HTML void element and state pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML form pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML visibility pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML header pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML root pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML language pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML child-position pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML nth-child pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML nth-last-child pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML of-type pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML only-child pseudo-class selector support.
  - [x] Add first-pass Cardigann HTML sibling combinator selector support.
  - [x] Add first-pass Cardigann HTML selector template rendering.
  - [x] Add first-pass Cardigann JSON response row/field selector parsing.
  - [x] Add first-pass Cardigann JSON row count/attribute metadata support.
  - [x] Add first-pass Cardigann JSON parent selector support.
  - [x] Add first-pass Cardigann JSON positional selector support.
  - [x] Add first-pass Cardigann JSON selector-list support.
  - [x] Add first-pass Cardigann JSON selector pseudo-filter support.
  - [x] Add first-pass Cardigann XML response selector parsing.
  - [x] Add first-pass Cardigann `magnet` result-field aliasing.
  - [x] Add first-pass Cardigann `categorydesc` result-field mapping.
  - [x] Preserve Cardigann zero volume factors for freeleech-style result fields.
  - [x] Add first-pass Cardigann field-name modifier handling.
  - [x] Preserve existing Cardigann field values when optional selectors are empty.
  - [x] Add first-pass Cardigann relative-time field filter support.
  - [x] Add first-pass Cardigann `dateparse`/`timeparse` field filter support.
  - [x] Add first-pass additional Cardigann field filter support.
  - [x] Add first-pass Cardigann `jsonjoinarray` filter support.
  - [x] Add first-pass Cardigann login request execution with session-cookie reuse.
  - [x] Add first-pass Cardigann cookie-login rendering and pre-seeded login cookies.
  - [x] Add first-pass Cardigann login error selector handling.
  - [x] Add first-pass Cardigann one-url login request support.
  - [x] Add first-pass Cardigann form login request support.
  - [x] Add first-pass Cardigann GET method form login submission support.
  - [x] Add first-pass Cardigann form-login landing request method/input support.
  - [x] Add first-pass Cardigann form login control serialization.
  - [x] Add first-pass Cardigann form login selector-control resolution.
  - [x] Add first-pass Cardigann multipart form login support.
  - [x] Add first-pass Cardigann form selector input support.
  - [x] Add first-pass Cardigann login test selector support.
  - [x] Add first-pass Cardigann form login CAPTCHA response submission support.
  - [x] Add first-pass Cardigann automatic simpleCaptcha form login support.
  - [x] Add first-pass Cardigann CAPTCHA auth field exposure for Settings.
  - [x] Add first-pass Cardigann informational auth field exposure for Settings.
  - [x] Add first-pass encrypted definition-specific config/auth values for indexer adapters.
  - [x] Add first-pass definition-specific config/auth field UI for indexer settings.
  - [x] Add first-pass Cardigann checkbox auth field parsing, Settings UI, and boolean template rendering.
  - [x] Render Cardigann auth field defaults into request templates when saved config values are omitted.
  - [x] Add first-pass indexer tags and search/RSS enable controls to Settings.
  - [x] Add the first real public RSS-backed Cardigann definition to the curated built-in catalogue.
  - [x] Expand the curated built-in set beyond Nyaa with Prowlarr-derived Torznab-compatible definitions.
  - [x] Add HDAccess to the curated Cardigann built-in catalogue.
  - [x] Add Anidex to the curated Cardigann built-in catalogue with first-pass HTML selector coverage.
  - [x] Add TorrentsCSV to the curated Cardigann built-in catalogue with first-pass JSON selector coverage.
  - [x] Add SubsPlease to the curated Cardigann built-in catalogue with first-pass JSON selector coverage.
  - [x] Add Knaben to the curated Cardigann built-in catalogue with first-pass JSON POST body coverage.
  - [x] Add TorrentDay to the curated Cardigann built-in catalogue with first-pass cookie-auth JSON selector coverage.
  - [x] Add IPTorrents to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage.
  - [x] Add RetroFlix to the curated Cardigann built-in catalogue with first-pass SpeedApp JSON selector coverage.
  - [x] Add SpeedApp.io to the curated Cardigann built-in catalogue with first-pass SpeedApp JSON selector coverage and Prowlarr-derived category mappings.
  - [x] Add BeyondHD to the curated Cardigann built-in catalogue with first-pass JSON POST coverage and Prowlarr-derived category mappings.
  - [x] Add BitHDTV to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add TorrentBytes to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add SceneHD to the curated Cardigann built-in catalogue with first-pass passkey JSON selector coverage and Prowlarr-derived category mappings.
  - [x] Add SceneTime to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add HD-Space to the curated Cardigann built-in catalogue with first-pass form-login HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add SpeedCD to the curated Cardigann built-in catalogue with first-pass cookie-auth HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add HD-Torrents to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add FunFile to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add ImmortalSeed to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage, freeleech filtering, and Prowlarr-derived category mappings.
  - [x] Add XSpeeds to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage, freeleech filtering, and Prowlarr-derived category mappings.
  - [x] Add RevolutionTT to the curated Cardigann built-in catalogue with first-pass POST-login HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add PreToMe to the curated Cardigann built-in catalogue with first-pass form-login HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add AnimeTorrents to the curated Cardigann built-in catalogue with first-pass cookie-auth AJAX HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add BakaBT to the curated Cardigann built-in catalogue with first-pass form-login HTML selector coverage and Prowlarr-derived category mappings.
  - [x] Add Nebulance to the curated Cardigann built-in catalogue with first-pass JSON-RPC API selector coverage and Prowlarr-derived TV category mappings.
  - [x] Add ShizaProject to the curated Cardigann built-in catalogue with first-pass GraphQL JSON selector coverage and Prowlarr-derived category mappings.
  - [ ] Expand the definition catalogue into broad real Cardigann-style tracker coverage.
  - [ ] Add full Cardigann selector/login parity, richer cookie/2FA auth UX beyond informational notes, category mapping/caps parity, priority, and mature per-indexer/app-specific sync semantics.
  - [x] Persist indexer proxy configuration records modeled after `vendor/prowlarr/src/NzbDrone.Core/IndexerProxies`: HTTP, SOCKS4, SOCKS5, FlareSolverr.
  - [x] Apply HTTP/SOCKS/FlareSolverr proxy settings to outbound indexer requests.
  - [x] Add first-pass indexer proxy management and assignment controls to Settings.
  - [x] Add first-pass retry/backoff and automatic disable/health status for search failures.
  - [x] Honor per-indexer category restrictions during search request fan-out.
  - [x] Add first-pass per-indexer minimum-seeder and query-cooldown policy controls.
  - [x] Add first-pass per-indexer rolling query-limit policy controls.
  - [x] Add first-pass per-indexer rolling grab-limit policy controls for automatic grabs.
  - [x] Add first-pass indexer search statistics from `vendor/prowlarr/src/NzbDrone.Core/IndexerStats`.
  - [x] Add first-pass indexer statistics readouts to Settings.
  - [x] Add first-pass built-in definition version refresh modeled after `vendor/prowlarr/src/NzbDrone.Core/IndexerVersions`.
  - [x] Add first-pass Settings UI for built-in definition refresh.
  - [x] Add first-pass URL-backed Cardigann definition source refresh and DB-backed runtime loading.
  - [x] Add scheduler-driven refresh for enabled URL-backed Cardigann definition sources.
  - [x] Add checksum provenance and optional SHA-256 pin verification for URL-backed Cardigann definition sources.
  - [x] Add first-pass checksum-pinned catalog manifest import for URL-backed definition sources.
  - [x] Require catalog manifest SHA-256 pins before importing remote definition source lists.
  - [x] Add first-pass Settings UI for URL-backed definition sources and checksum-pinned catalog imports.
  - [x] Expose authenticated aggregate Torznab/Newznab endpoints for external apps if ARR Hub should act like Prowlarr.
  - [x] Forward aggregate Torznab/Newznab pagination and extended metadata through upstream adapters and Cardigann templates.
  - [x] Add first-pass persisted Radarr/Sonarr aggregate app sync behavior from `vendor/prowlarr/src/NzbDrone.Core/Applications` if external Sonarr/Radarr instances should still be supported.
  - [x] Add scheduler-driven Radarr/Sonarr aggregate app sync for enabled application records.
  - [x] Trigger enabled Radarr/Sonarr aggregate app sync after indexer add/update/remove mutations.
  - [x] Prune stale remote aggregate app indexers when a full sync finds no eligible local indexers/categories for that protocol.
  - [x] Preserve stale remote aggregate mappings during add-only sync when no eligible local indexers/categories remain for that protocol.
  - [x] Add first-pass app-specific torrent seed criteria sync for aggregate Radarr/Sonarr indexers.
  - [x] Preserve existing app-side tags, download client assignment, and non-managed remote fields during aggregate app indexer updates.
  - [x] Separate Sonarr standard and anime category filters during aggregate app indexer sync.
  - [x] Add first-pass Radarr/Sonarr indexer application sync controls to Settings.

Acceptance criteria:

- Product claims make clear that ARR Hub intends to replace Prowlarr, while distinguishing planned replacement work from currently shipped behavior.
- Users are not told ARR Hub ships a Prowlarr-scale tracker/indexer catalogue, mature proxy/app-sync parity, or stats surface until those features exist.
- Searches still return normalized releases with reliable categories, protocol, seeders, age, infohash, and download URLs from configured upstreams.

### 6. Expand Download Client Coverage And Completed Download Control

Current state:

- Built-in download clients are qBittorrent and SABnzbd.
- Client settings are minimal.
- There are no remote path mappings.

Gap:

- Sonarr/Radarr users commonly rely on Transmission, Deluge, rTorrent, uTorrent, NZBGet, Download Station, blackhole folders, and remote path mappings.

Tasks:

- Add first-party adapters for at least:
  - Transmission,
  - Deluge,
  - NZBGet,
  - torrent blackhole,
  - usenet blackhole.
- Add remote path mappings with host/client/source/destination fields.
- Add per-client categories/tags, priority, recent priority, add-paused, remove-completed, and remove-failed options where supported.
- Add client-specific validation and UI fields.
- Improve qBittorrent hash detection. Returning `"unknown"` as a fallback external ID is unsafe for repeated grabs.
- Track completed download history separately from active queue.

Acceptance criteria:

- Common Docker/NAS setups with separate download and media containers can import correctly.
- Removing a queue item can optionally remove files from the download client and is reflected locally.

### 7. Add True RSS Sync And Wanted/Cutoff Search Behavior

Current state:

- `SchedulerLoop` job `rss_sync` loops over every wanted movie and performs active title search.
- `tv_rss_sync` loops over every wanted episode and performs active search.
- There is no recent-release cache or true RSS feed processing.

Gap:

- Sonarr/Radarr RSS sync does not repeatedly active-search every wanted item. It consumes recent releases, matches them against wanted monitored media, and decides whether to grab.

Tasks:

- Add indexer RSS/recent feed support distinct from active search.
- Store recent releases with indexer/source metadata.
- Match recent releases to movies/episodes before decision evaluation.
- Add per-indexer RSS/search enable flags. First-pass persisted flags and Settings controls are implemented; true RSS/recent feed processing still remains.
- Add backoff and health checks for failing RSS endpoints.
- Add cutoff unmet queries for movies and episodes based on profile cutoff state.

Acceptance criteria:

- RSS sync can grab a newly posted release for monitored media without active-searching the entire library.
- Search missing/cutoff jobs can be manually scheduled and observed in the UI.

### 8. Persist Operational History And Logs

Current state:

- Plex playback history is persisted.
- Release decisions are persisted.
- Diagnostics logs are in-memory only.
- There is no full history of grabs, imports, renames, deletes, failed downloads, blocklist additions, metadata refreshes, or settings changes.

Gap:

- Sonarr/Radarr/Prowlarr expose history for debugging and auditing. ARR Hub cannot yet answer "what happened to this movie/episode/download?"

Tasks:

- Add domain history tables for:
  - grabbed,
  - download failed,
  - imported,
  - import failed,
  - renamed,
  - deleted,
  - blocklisted,
  - metadata refreshed,
  - indexer/download client health changes,
  - notification deliveries.
- Persist structured logs or add a log-file ingestion/viewing path.
- Link history rows to media, episode, release, indexer, download client, and scheduler job where possible.
- Add history filters in UI.

Acceptance criteria:

- Every automated action has a history row with timestamps and useful context.
- Logs survive process restart or are explicitly sourced from a persistent log file.

### 9. Harden Security And API Boundaries

Current state:

- Local admin login and API keys exist.
- tRPC app procedures are authenticated after onboarding.
- Onboarding and import routers are public because they are setup flows.
- There is no Sonarr/Radarr/Prowlarr-compatible REST API.

Gap:

- Replacement-grade software needs clear API boundaries, ecosystem compatibility decisions, and setup-only endpoint hardening.

Tasks:

- Gate setup/import public procedures so they reject once setup is complete, including connection-test endpoints where appropriate.
- Add rate limiting or lockout for login.
- Add password change/reset flow.
- Add API key scoping if external API compatibility is implemented.
- Decide whether to implement compatible `/api/v3` Sonarr/Radarr-style endpoints and Prowlarr-style `/api/v1`/Torznab endpoints.
- Add OpenAPI or equivalent docs for public APIs.
- Audit secret redaction in errors, logs, diagnostics, and UI.

Acceptance criteria:

- After onboarding, unauthenticated setup/import mutation attempts fail.
- External integrations have a documented API path.
- No API key, token, password, cookie, or webhook secret is returned in normal logs or diagnostics.

### 10. Deployment, Storage, And NAS Readiness

Current state:

- `Dockerfile` and `compose.yml` exist.
- Compose only mounts `/data`.
- There is no explicit media/download volume and permission model.

Gap:

- A practical Arr replacement must run on Docker/NAS hosts with stable UID/GID, media/download mounts, and backup/restore behavior.

Tasks:

- Add compose examples for media and downloads volumes.
- Add UID/GID/PUID/PGID or documented runtime user behavior.
- Add backup/restore docs and possibly scheduled backup jobs.
- Add data migration checks and startup failure messages.
- Add health checks for root folder accessibility and write permissions.
- Add `.env.example`.

Acceptance criteria:

- A user can deploy via compose, mount downloads/media, import files, and restart without losing access to encrypted credentials.
- Health view reports folder permission issues clearly.

## P1 Functional Gaps

### Import Lists

Current state:

- Only one-time setup import from Radarr and Sonarr exists.

Gap:

- Radarr/Sonarr import lists are ongoing sources of wanted items.

Tasks:

- Add continuous import lists modeled after:
  - Radarr: `vendor/radarr/src/NzbDrone.Core/ImportLists`
  - Sonarr: `vendor/sonarr/src/NzbDrone.Core/ImportLists`
- Prioritize Trakt, TMDB lists, RSS/custom lists, Plex watchlists, Radarr/Sonarr import lists, and exclusions.
- Add sync schedule, preview, auto-add controls, root folder/profile defaults, and exclusions.

### Notifications

Current state:

- In-app and webhook channels exist.
- Event coverage is mostly Plex monitoring and notification delivery records.

Gap:

- Sonarr/Radarr/Prowlarr notify on grab, import, upgrade, rename, health issues, application updates, failures, manual interaction required, and more, across many providers.

Tasks:

- Add event emissions for grab/import/upgrade/fail/blocklist/health/update.
- Add provider adapters for Discord, Slack, Telegram, email/SMTP, Notifiarr, Ntfy, Pushover, Gotify, Apprise, and custom scripts.
- Add per-event notification settings and test-send UI.

### Tags, Filters, And Auto Tagging

Current state:

- No tags table or auto-tagging behavior was found.

Gap:

- Tags drive restrictions, indexer/client assignment, import lists, notifications, custom filters, and automation.

Tasks:

- Add tags schema and UI.
- Attach tags to movies, series, indexers, download clients, notifications, import lists, release profiles, and delay profiles.
- Add custom filters and auto-tagging rules modeled after Sonarr/Radarr `AutoTagging` and `CustomFilters`.

### Health Checks

Current state:

- Integration health is recorded when tests are run and aggregated in diagnostics.

Gap:

- Sonarr/Radarr/Prowlarr have many proactive health checks.

Tasks:

- Add checks for root folder missing/unwritable, indexer search/RSS failures, all-indexers-disabled, download client unavailable, remote path missing, download client not removing completed downloads, clock skew, app data path, update availability, and import mechanism problems.
- Show checks in System and relevant settings pages.

### Backup, Update, And Maintenance Jobs

Current state:

- No first-class backup/update workflow beyond Docker docs and Drizzle migrations.

Gap:

- Existing Arr apps have backup, update, housekeeping, and migration operational flows.

Tasks:

- Add scheduled database backups.
- Add backup download/restore UI.
- Add housekeeping jobs for old jobs, old logs, old release decisions, stale queue, old notifications, and old sessions.
- Add update status display or explicitly document container-only updates.

## P2 Compatibility And Polish

### API Compatibility

Decision needed:

- If "replacement" means external tools can point at ARR Hub, implement REST compatibility for relevant Sonarr/Radarr/Prowlarr endpoints.
- If not, document "not API-compatible with Sonarr/Radarr/Prowlarr" prominently.

Recommended minimum:

- Compatible read/write endpoints for movies, series, episodes, queue, history, wanted, calendar, commands, indexers, download clients, root folders, quality profiles, custom formats, tags, system status, and health.
- Prowlarr aggregate Torznab/Newznab endpoints.

### Plugin System

Current state:

- Trusted local in-process plugins exist.

Gaps:

- No sandboxing, no author docs, no compatibility versioning, no marketplace/distribution flow.

Tasks:

- Add plugin author documentation.
- Add capability version negotiation.
- Add plugin log/health UI.
- Decide whether plugins can cover indexer definitions or only adapters.

### Plex/Tautulli Scope

Current state:

- Plex live session/history/user/stats functionality is stronger than a normal Sonarr/Radarr/Prowlarr replacement requirement.

Recommendation:

- Keep Plex analytics as a differentiator, but do not let it block core Arr replacement work.
- If pursuing Tautulli replacement later, create a separate milestone.

## Schema Gaps To Add

Likely new tables or table expansions:

- `movie_files`, `episode_files`, `media_info`, `extra_files`, `subtitle_files`.
- `blocklist` with media linkage, source title, protocol, indexer, infohash, reason.
- `history` for grab/import/rename/delete/fail/metadata events.
- `remote_path_mappings`.
- `tags` and join tables.
- `delay_profiles`, `release_profiles`, `quality_definitions`.
- `import_lists`, `import_list_items`, `import_exclusions`.
- `indexer_definitions`, `indexer_categories`, `indexer_stats`, `indexer_proxy`, `indexer_definition_versions`.
- `download_history` or completed download tracking.
- `naming_config`.
- `backups`.
- Expanded metadata fields for movies, series, seasons, and episodes.

## Recommended Agent Implementation Sequence

### Milestone 1: Make The Current Backend Operable

Goal: expose existing capabilities through UI before deep backend rewrites.

Tasks:

1. Done: finish Settings UI for indexers/download clients/media servers/scheduler/general/media-management/root folders.
2. Done: add Movies UI with TMDB search, add, edit, delete, monitor toggle, profile/root folder assignment, manual search/evaluate/grab.
3. Done: add TV UI using existing local series model with manual series/season/episode scaffolding, edit, delete, monitor toggles, and manual episode/season/series search.
4. Done: add profile CRUD/apply-bundle UI.
5. Done: add persisted e2e browser smoke tests for onboarding, integration settings, add movie, add TV, manual search display, queue page.

Acceptance:

- No primary nav settings page is a placeholder.
- Main app can be demoed without tRPC scripts.

### Milestone 2: TV Metadata And Sonarr Import Completion

Goal: make TV library management real.

Tasks:

1. Add TV metadata provider service.
2. Create add-series flow that fetches seasons/episodes.
3. Add metadata refresh jobs.
4. Extend Sonarr import to fetch/import episodes and existing episode files.
5. Add calendar UI using real episode data.

Acceptance:

- Importing from Sonarr preserves show/season/episode wanted and available state.
- Adding a new show creates all current episode rows.

### Milestone 3: Completed Download Import Pipeline

Goal: stop faking imports.

Tasks:

1. [x] Add dedicated media file model for size/import date/media info history.
2. [x] Add import service.
3. [x] Add remote path mappings.
4. [x] Implement qBittorrent/SAB completed path resolution.
5. [x] Implement basic movie import and episode import decisions.
6. [x] Implement move/copy/hardlink and naming config.
7. [x] Add manual import UI.
8. [x] Add library rescan workflow.
9. [x] Add rename preview and rename action.

Acceptance:

- Unit coverage verifies copy, move, hardlink, sample filtering, episode matching, and missing output path failures.
- Deterministic unit coverage verifies remote path mappings, media file records, library scanning, and movie/series renames.
- Live qBittorrent/SAB smoke tests should download a fixture file and import it into a media root when those services are available.
- The database records real file paths and quality.

### Milestone 4: Decision Engine Hardening

Goal: reduce bad grabs and repeated failures.

Tasks:

1. [x] Add blocklist table and enforcement.
2. [x] Port high-impact decision specs first: title match, size, free space, queue conflict, protocol, retention, seeding, release restrictions.
3. [x] Add first-pass TV edge specs: full season, multi-season, split episode, same episodes, and anime absolute episode matching. Scene/XEM mapping and anime version upgrades remain explicit future parity gaps.
4. [x] Expand parser test corpus from vendor tests and fixtures.

Acceptance:

- Manual search decisions are explainable and stable.
- Blocklisting a failed queue item prevents re-grabbing the same title/infohash.
- Unit coverage verifies blocklist matching, title/year/episode mismatches, size/free-space, protocol availability, queue conflicts, age/retention, release terms, unsafe artifacts, TV edge checks, and vendor-inspired parser cases.

### Milestone 5: Prowlarr Replacement Foundation

Goal: begin the selected Option A path to replace Prowlarr directly.

Tasks:

1. [x] Decide Option A or B from P0 section 5. Option A is selected.
2. [ ] Implement first-party indexer definitions, proxies, stats, and aggregate endpoints. First-pass persisted generic definitions, small Cardigann-style YAML fixtures including Nyaa RSS, Anidex HTML selector, TorrentsCSV JSON selector, SubsPlease JSON selector, Knaben JSON POST body, TorrentDay cookie-auth JSON selector, IPTorrents cookie-auth HTML selector, RetroFlix and SpeedApp.io JSON selectors, BeyondHD JSON POST selector, BitHDTV cookie-auth HTML selector, TorrentBytes POST-login HTML selector, TorrentSyndikat API-key JSON selector, SceneHD passkey JSON selector, SceneTime cookie-auth HTML selector, HD-Space form-login HTML selector, SpeedCD cookie-auth HTML selector, HD-Torrents POST-login HTML selector, FunFile POST-login HTML selector, ImmortalSeed POST-login HTML selector, XSpeeds POST-login HTML selector, Xthor passkey JSON API selector, HDBits username/passkey JSON POST selector, RevolutionTT POST-login HTML selector, PreToMe form-login HTML selector, AnimeTorrents cookie-auth AJAX HTML selector, BakaBT form-login HTML selector, Nebulance JSON-RPC API selector, ShizaProject GraphQL JSON selector, AnimeTosho, MoreThanTV, HDAccess, and Torrent Network coverage, encrypted definition-specific config/auth values with Settings UI inputs including select options/defaults, checkbox controls, informational auth notes, and manual CAPTCHA fields, editable tags/search/RSS flags, proxy controls, stats readouts, version-aware built-in definition refresh controls, definition source/catalog management controls, and Radarr/Sonarr app-sync controls, URL-backed Cardigann definition source refresh, DB-backed Cardigann runtime loading, scheduler-driven enabled-source refresh, definition-source checksum provenance/pinning, checksum-required catalog manifest import, GET/POST XML/raw-body Cardigann search execution with request template filters including `querystring`, `split`, URL decode aliases, and HTML entity and JSON escape filters, search keyword filters including `querystring`, `split`, URL alias/escape filters, and HTML entity and JSON escape filters, search preprocessing filters, response no-results message handling, range template expansion, base template variables, conditional/function template helpers, checkbox config booleans, auth-default config rendering, and scalar/list-valued templated request headers, Cardigann `caps.categories` dictionary parsing, multi-Newznab category mapping expansion, default category fallback, path-scoped category narrowing, path-level inherited input controls, first-pass HTML row/field selector result parsing with simple descendant selector scoping, `rows.after`/`rows.before` merging, row filter support, date header support, field descendant removal, selector case mappings, field selector self-matching, HTML selector attribute operators, case-insensitive HTML selector attribute flags, escaped HTML selector identifiers, HTML selector escaped attribute names, escaped HTML selector delimiters, HTML selector quoted attribute delimiters, HTML selector matching pseudo-classes, HTML selector pseudo-tail simple parts, HTML selector content-state pseudo-classes, HTML selector pseudo-filters, HTML selector positional filters, HTML selector direct-child combinators, HTML void element selectors, HTML selector state pseudo-classes, HTML selector form pseudo-classes, HTML selector visibility pseudo-classes, HTML selector header pseudo-classes, HTML selector root pseudo-classes, HTML selector language pseudo-classes, HTML selector child-position pseudo-classes, HTML selector nth-child pseudo-classes, HTML selector nth-last-child pseudo-classes, HTML selector of-type pseudo-classes, HTML selector only-child pseudo-classes, HTML selector sibling combinators, HTML selector list support, HTML selector template rendering, first-pass JSON response row/field selector parsing with row count/attribute metadata, parent selectors, selector positional filters, selector lists, and selector pseudo-filters, first-pass XML response selector parsing, magnet result-field aliasing, categorydesc result-field mapping, zero volume-factor preservation, field-name modifier handling, optional field fallback preservation, and relative-time, fuzzy-date, formatted-date, Unix timestamp, JSON array-join, validation, diacritics, and filename field filters, first-pass login request execution with pre-seeded login cookies, direct cookie-login rendering, one-url login requests, form login requests, GET method form login submissions, form-login landing request methods and inputs, form login control serialization, selector-resolved form login controls, multipart form login submissions, selector-derived form login values, configured CAPTCHA response submission, automatic simpleCaptcha form handling, login error selectors, login test selectors, manual CAPTCHA and informational auth-field exposure, and session-cookie reuse, per-indexer category-restricted search fan-out, proxy config records applied to outbound requests, search stats, search health/backoff handling, minimum-seeder/query-cooldown/rolling-query/grab-limit policy controls, aggregate feeds with offset/extended metadata forwarding, scheduled Radarr/Sonarr aggregate app sync, indexer mutation-triggered app sync, full-sync stale remote aggregate cleanup, add-only stale mapping preservation, remote app-side setting retention during app sync updates, separate Sonarr anime category sync, and app-specific torrent seed criteria are complete; broad tracker definitions, full Cardigann selector/login/auth UX parity, full policy parity, full trusted first-party remote catalogue distribution, and full Prowlarr app-sync parity for richer per-indexer and app-specific sync semantics remain.
3. [x] Update docs/UI copy to describe current Torznab/Newznab behavior without claiming replacement-grade Prowlarr support.
4. [x] After review, start with aggregate Torznab/Newznab endpoints and a small first-party definition pipeline before broad tracker coverage.

Acceptance:

- Product claims match actual behavior.
- ARR Hub can move toward Prowlarr replacement without implying the current build already ships the full indexer catalogue/proxy surface.

### Milestone 6: Download Client Coverage And NAS Hardening

Goal: support common home-server deployments.

Tasks:

1. Add Transmission, Deluge, NZBGet, and blackhole adapters.
2. Add Docker volume examples for `/downloads`, `/movies`, `/tv`.
3. Add UID/GID or permission docs.
4. Add root folder permission health checks.

Acceptance:

- A typical Docker Compose stack can run ARR Hub plus qBittorrent/SAB/Transmission and import files into mounted media paths.

## Documentation Updates Required

Update `README.md` after each milestone:

- Replace optimistic "Available UI Validation Surfaces" statements that are not true for placeholder pages.
- Add clear "current limitations" until replacement-grade work is complete.
- Document API compatibility stance.
- Document Docker volume and permission setup.
- Document required metadata provider API keys.
- Document how to migrate from Sonarr/Radarr/Prowlarr.

## Known Risk Areas

- Scope risk: replacing Sonarr, Radarr, and Prowlarr is three mature products worth of behavior. Keep milestones narrow and acceptance-driven.
- Parser risk: title parsing and release matching have many edge cases. Build a large fixture corpus early.
- File operation risk: import/move/hardlink behavior can destroy user data if wrong. Implement dry-run/manual import and extensive tests before auto-importing.
- Docker/NAS risk: permission and path mapping issues will dominate real deployments. Test with containerized download clients and mounted volumes.
- Prowlarr risk: maintaining indexer definitions is ongoing work, not a one-time feature.

## Immediate Next Step For The Next Agent

Continue Milestone 5: expand the selected Option A Prowlarr replacement foundation beyond the first-pass aggregate feeds, offset/extended metadata forwarding, generic definitions, encrypted definition-specific config/auth values with Settings UI inputs including select options/defaults, checkbox controls, informational auth notes, and manual CAPTCHA fields, editable tags/search/RSS flags, proxy controls, stats readouts, built-in definition refresh controls, definition source/catalog management controls, and Radarr/Sonarr app-sync controls, Settings-triggered built-in and scheduled URL-backed Cardigann definition refresh including Nyaa RSS, Anidex HTML selector, TorrentsCSV JSON selector, SubsPlease JSON selector, Knaben JSON POST body, TorrentDay cookie-auth JSON selector, IPTorrents cookie-auth HTML selector, RetroFlix and SpeedApp.io JSON selectors, BeyondHD JSON POST selector, BitHDTV cookie-auth HTML selector, TorrentBytes POST-login HTML selector, TorrentSyndikat API-key JSON selector, SceneHD passkey JSON selector, SceneTime cookie-auth HTML selector, HD-Space form-login HTML selector, SpeedCD cookie-auth HTML selector, HD-Torrents POST-login HTML selector, FunFile POST-login HTML selector, ImmortalSeed POST-login HTML selector, XSpeeds POST-login HTML selector, Xthor passkey JSON API selector, HDBits username/passkey JSON POST selector, RevolutionTT POST-login HTML selector, PreToMe form-login HTML selector, AnimeTorrents cookie-auth AJAX HTML selector, BakaBT form-login HTML selector, Nebulance JSON-RPC API selector, ShizaProject GraphQL JSON selector, AnimeTosho, MoreThanTV, HDAccess, and Torrent Network coverage, checksum-pinned source provenance and checksum-required catalog manifest import, Cardigann fixture loader/runtime with GET/POST XML/raw-body/header execution, scalar/list-valued request headers, request template filters including `querystring`, `split`, URL decode aliases, and HTML entity and JSON escape filters, search keyword filters including `querystring`, `split`, URL alias/escape filters, and HTML entity and JSON escape filters, search preprocessing filters, response no-results message handling, range template expansion, base template variables, conditional/function template helpers, checkbox config booleans, auth-default config rendering, `caps.categories` dictionary parsing, multi-Newznab category mapping expansion, default category fallback, path-scoped category narrowing, path-level inherited input controls, first-pass HTML row/field selector result parsing with simple descendant selector scoping, `rows.after`/`rows.before` merging, row filter support, date header support, field descendant removal, selector case mappings, field selector self-matching, HTML selector attribute operators, case-insensitive HTML selector attribute flags, escaped HTML selector identifiers, HTML selector escaped attribute names, escaped HTML selector delimiters, HTML selector quoted attribute delimiters, HTML selector matching pseudo-classes, HTML selector pseudo-tail simple parts, HTML selector content-state pseudo-classes, HTML selector pseudo-filters, HTML selector positional filters, HTML selector direct-child combinators, HTML void element selectors, HTML selector state pseudo-classes, HTML selector form pseudo-classes, HTML selector visibility pseudo-classes, HTML selector header pseudo-classes, HTML selector root pseudo-classes, HTML selector language pseudo-classes, HTML selector child-position pseudo-classes, HTML selector nth-child pseudo-classes, HTML selector nth-last-child pseudo-classes, HTML selector of-type pseudo-classes, HTML selector only-child pseudo-classes, HTML selector sibling combinators, HTML selector list support, HTML selector template rendering, first-pass JSON response row/field selector parsing with row count/attribute metadata, parent selectors, selector positional filters, selector lists, and selector pseudo-filters, first-pass XML response selector parsing, magnet result-field aliasing, categorydesc result-field mapping, zero volume-factor preservation, field-name modifier handling, optional field fallback preservation, and relative-time, fuzzy-date, formatted-date, Unix timestamp, JSON array-join, validation, diacritics, and filename field filters, first-pass login request execution with pre-seeded login cookies, direct cookie-login rendering, one-url login requests, form login requests, GET method form login submissions, form-login landing request methods and inputs, form login control serialization, selector-resolved form login controls, multipart form login submissions, selector-derived form login values, configured CAPTCHA response submission, automatic simpleCaptcha form handling, login error selectors, login test selectors, manual CAPTCHA and informational auth-field exposure, and session-cookie reuse, per-indexer category-restricted search fan-out, proxy execution, search health/backoff handling, minimum-seeder/query-cooldown/rolling-query/grab-limit policy controls, and scheduled plus mutation-triggered aggregate Radarr/Sonarr app sync with full-sync stale remote cleanup, add-only stale mapping preservation, app-side remote setting retention during updates, separate Sonarr anime category sync, and app-specific torrent seed criteria.

Recommended order:

1. Review the Option A scope and acceptance criteria in P0 section 5.
2. Continue expanding the curated Cardigann built-in set into broader tracker coverage and fuller Cardigann selector/login support.
3. Promote the first-pass catalog manifest importer into a curated trusted catalogue distribution model and harden app sync toward fuller Prowlarr per-indexer/app-specific parity.
4. Harden per-indexer policy controls beyond first-pass search backoff, minimum seeders, query cooldowns, rolling query limits, and rolling grab limits.
