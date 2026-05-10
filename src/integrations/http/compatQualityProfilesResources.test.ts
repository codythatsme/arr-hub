import { describe, expect, it } from "vitest"

import type { ProfileWithDetails } from "#/effect/services/ProfileService"

import {
  profileInputFromCompatibleResource,
  qualityProfileResource,
} from "./compatQualityProfilesResources"

describe("compatible quality profile resources", () => {
  it("maps local profile details to an Arr-style quality profile resource", () => {
    const now = new Date("2026-05-10T00:00:00.000Z")
    const details: ProfileWithDetails = {
      profile: {
        id: 10,
        name: "HD",
        upgradeAllowed: true,
        minFormatScore: 0,
        cutoffFormatScore: 100,
        minUpgradeFormatScore: 1,
        isDefault: false,
        appliedBundleId: null,
        appliedBundleVersion: null,
        createdAt: now,
        updatedAt: now,
      },
      qualityItems: [
        {
          id: 1,
          profileId: 10,
          qualityName: null,
          groupName: "WEB 1080p",
          weight: 1,
          allowed: true,
        },
        {
          id: 2,
          profileId: 10,
          qualityName: "WEBDL-1080p",
          groupName: "WEB 1080p",
          weight: 2,
          allowed: true,
        },
        {
          id: 3,
          profileId: 10,
          qualityName: "WEBRip-1080p",
          groupName: "WEB 1080p",
          weight: 3,
          allowed: false,
        },
        {
          id: 4,
          profileId: 10,
          qualityName: "Bluray-1080p",
          groupName: null,
          weight: 4,
          allowed: true,
        },
      ],
      formatScores: [{ id: 1, profileId: 10, customFormatId: 7, score: 250 }],
    }

    const resource = qualityProfileResource(details, new Map([[7, "HDR"]]))

    expect(resource).toMatchObject({
      id: 10,
      name: "HD",
      upgradeAllowed: true,
      cutoff: 4,
      cutoffFormatScore: 100,
      formatItems: [{ format: 7, name: "HDR", score: 250 }],
    })
    expect(resource.items[0]).toMatchObject({
      id: 1,
      name: "WEB 1080p",
      quality: null,
      items: [
        { id: 2, name: "WEBDL-1080p", quality: { id: 2, name: "WEBDL-1080p" } },
        { id: 3, name: "WEBRip-1080p", quality: { id: 3, name: "WEBRip-1080p" } },
      ],
    })
    expect(resource.items[1]).toMatchObject({
      id: 4,
      name: "Bluray-1080p",
      quality: { id: 4, name: "Bluray-1080p" },
    })
  })

  it("maps Arr-style quality profile bodies into local profile input", () => {
    const input = profileInputFromCompatibleResource({
      name: "HD",
      upgradeAllowed: true,
      minFormatScore: 10,
      cutoffFormatScore: 100,
      minUpgradeFormatScore: 5,
      isDefault: true,
      items: [
        {
          name: "WEB 1080p",
          allowed: true,
          items: [
            {
              name: "WEBDL-1080p",
              quality: { id: 2, name: "WEBDL-1080p" },
              allowed: true,
            },
          ],
        },
        {
          name: "Bluray-1080p",
          quality: { id: 4, name: "Bluray-1080p" },
          allowed: false,
        },
      ],
      formatItems: [{ format: 7, score: 250 }],
    })

    expect(input).toEqual({
      name: "HD",
      upgradeAllowed: true,
      minFormatScore: 10,
      cutoffFormatScore: 100,
      minUpgradeFormatScore: 5,
      isDefault: true,
      qualityItems: [
        { qualityName: null, groupName: "WEB 1080p", weight: 1, allowed: true },
        { qualityName: "WEBDL-1080p", groupName: "WEB 1080p", weight: 2, allowed: true },
        { qualityName: "Bluray-1080p", groupName: null, weight: 3, allowed: false },
      ],
      formatScores: [{ customFormatId: 7, score: 250 }],
    })
  })

  it("rejects create bodies without a name", () => {
    expect(profileInputFromCompatibleResource({ upgradeAllowed: true })).toEqual({
      error: "name is required",
    })
  })
})
