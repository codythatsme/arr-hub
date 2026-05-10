export interface RootFolderLike {
  readonly id: number
  readonly path: string
  readonly freeSpaceBytes: number | null
  readonly totalSpaceBytes: number | null
}

export interface CompatibleRootFolderResource {
  readonly id: number
  readonly path: string
  readonly accessible: boolean
  readonly freeSpace: number | null
  readonly totalSpace: number | null
  readonly unmappedFolders: ReadonlyArray<unknown>
}

export interface RootFolderBodyError {
  readonly error: string
}

export interface RootFolderInput {
  readonly path: string
}

export function rootFolderResource(folder: RootFolderLike): CompatibleRootFolderResource {
  const totalSpace = folder.totalSpaceBytes ?? null

  return {
    id: folder.id,
    path: folder.path,
    accessible: totalSpace !== null && totalSpace > 0,
    freeSpace: folder.freeSpaceBytes ?? null,
    totalSpace,
    unmappedFolders: [],
  }
}

export function rootFolderInputFromCompatibleResource(
  body: unknown,
): RootFolderInput | RootFolderBodyError {
  if (!isObject(body)) return { error: "root folder body is required" }
  const path = body.path
  if (typeof path !== "string" || path.trim().length === 0) {
    return { error: "path is required" }
  }
  return { path }
}

function isObject(value: unknown): value is { readonly path?: unknown } {
  return typeof value === "object" && value !== null
}
