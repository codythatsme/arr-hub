import { describe, expect, it } from "vitest"

import {
  rootFolderInputFromCompatibleResource,
  rootFolderResource,
} from "./compatRootFoldersResources"

describe("compatible root folder resources", () => {
  it("maps local root folders to Arr-style root folder resources", () => {
    expect(
      rootFolderResource({
        id: 1,
        path: "/media/movies",
        freeSpaceBytes: 100,
        totalSpaceBytes: 1000,
      }),
    ).toEqual({
      id: 1,
      path: "/media/movies",
      accessible: true,
      freeSpace: 100,
      totalSpace: 1000,
      unmappedFolders: [],
    })
  })

  it("marks folders without disk space as inaccessible", () => {
    expect(
      rootFolderResource({
        id: 2,
        path: "/missing",
        freeSpaceBytes: 0,
        totalSpaceBytes: 0,
      }),
    ).toMatchObject({
      accessible: false,
      freeSpace: 0,
      totalSpace: 0,
    })
  })

  it("maps Arr-style bodies into local root folder input", () => {
    expect(rootFolderInputFromCompatibleResource({ path: "/media/tv" })).toEqual({
      path: "/media/tv",
    })
  })

  it("rejects bodies without a path", () => {
    expect(rootFolderInputFromCompatibleResource({})).toEqual({ error: "path is required" })
  })
})
