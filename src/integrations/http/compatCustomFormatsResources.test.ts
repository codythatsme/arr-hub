import { describe, expect, it } from "vitest"

import {
  customFormatInputFromCompatibleResource,
  customFormatResource,
  customFormatUpdateFromCompatibleResource,
} from "./compatCustomFormatsResources"

describe("compatible custom format resources", () => {
  it("maps local custom formats to Arr-style custom format resources", () => {
    expect(
      customFormatResource({
        format: { id: 1, name: "x265", includeWhenRenaming: true },
        specs: [
          {
            id: 2,
            name: "Release title",
            field: "releaseTitle",
            pattern: "[xh]\\.?265|hevc",
            negate: false,
            required: true,
          },
        ],
      }),
    ).toEqual({
      id: 1,
      name: "x265",
      includeCustomFormatWhenRenaming: true,
      specifications: [
        {
          id: 2,
          name: "Release title",
          implementation: "ReleaseTitleSpecification",
          implementationName: "Release Title",
          infoLink: "https://wiki.servarr.com/settings#custom-formats",
          negate: false,
          required: true,
          fields: [
            {
              order: 0,
              name: "value",
              label: "Regular Expression",
              unit: null,
              helpText: null,
              helpTextWarning: null,
              helpLink: null,
              value: "[xh]\\.?265|hevc",
              type: "textbox",
              advanced: false,
              selectOptions: null,
              selectOptionsProviderAction: null,
              section: null,
              hidden: null,
              privacy: "normal",
              placeholder: null,
              isFloat: false,
            },
          ],
          presets: null,
        },
      ],
    })
  })

  it("maps Arr-style bodies into local custom format input", () => {
    expect(
      customFormatInputFromCompatibleResource({
        name: "Source",
        includeCustomFormatWhenRenaming: false,
        specifications: [
          {
            name: "BluRay",
            implementation: "SourceSpecification",
            negate: false,
            required: true,
            fields: [{ name: "value", value: 9 }],
          },
        ],
      }),
    ).toEqual({
      name: "Source",
      includeWhenRenaming: false,
      specs: [
        {
          name: "BluRay",
          field: "source",
          pattern: "bluray",
          negate: false,
          required: true,
        },
      ],
    })
  })

  it("accepts local-style specs for compatibility with existing callers", () => {
    expect(
      customFormatInputFromCompatibleResource({
        name: "BR-DISK",
        includeWhenRenaming: true,
        specs: [
          {
            name: "BR-DISK",
            field: "qualityModifier",
            pattern: "brdisk",
            negate: false,
            required: true,
          },
        ],
      }),
    ).toEqual({
      name: "BR-DISK",
      includeWhenRenaming: true,
      specs: [
        {
          name: "BR-DISK",
          field: "qualityModifier",
          pattern: "brdisk",
          negate: false,
          required: true,
        },
      ],
    })
  })

  it("maps partial updates without requiring specifications", () => {
    expect(
      customFormatUpdateFromCompatibleResource({ includeCustomFormatWhenRenaming: true }),
    ).toEqual({ includeWhenRenaming: true })
  })

  it("rejects creates without conditions", () => {
    expect(customFormatInputFromCompatibleResource({ name: "Empty", specifications: [] })).toEqual({
      error: "specifications must contain at least one condition",
    })
  })
})
