import type { TRPCRouterRecord } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"

import { OnboardingService } from "#/effect/services/OnboardingService"

import { publicProcedure, runEffect } from "../init"

const adminInput = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
})

const capabilitiesInput = z.object({
  movies: z.boolean(),
  tv: z.boolean(),
})

const profilesInput = z.object({
  bundleId: z.string(),
})

const rootFoldersInput = z.object({
  movies: z.string().optional(),
  tv: z.string().optional(),
})

const indexerInput = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  priority: z.number().int().min(1).max(100).optional(),
  categories: z.array(z.number().int()).optional(),
})

const downloadClientInput = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string(),
  password: z.string(),
  useSsl: z.boolean().optional(),
  category: z.string().optional(),
})

const mediaServerInput = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  token: z.string().min(1),
  useSsl: z.boolean().optional(),
})

const quickstartInput = adminInput.extend({
  moviesRootFolder: z.string().optional(),
  tvRootFolder: z.string().optional(),
  indexer: indexerInput.optional(),
  downloadClient: downloadClientInput.optional(),
  mediaServer: mediaServerInput.optional(),
})

const skipInput = z.object({
  step: z.enum([
    "admin",
    "capabilities",
    "profiles",
    "root_folders",
    "indexers",
    "download_client",
    "media_server",
    "import",
    "review",
  ]),
})

export const onboardingRouter = {
  status: publicProcedure.query(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        return yield* svc.getStatus()
      }),
    ),
  ),

  quickstart: publicProcedure.input(quickstartInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        return yield* svc.runQuickstart(input)
      }),
    ),
  ),

  startWizard: publicProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.startWizard()
      }),
    ),
  ),

  submitAdmin: publicProcedure.input(adminInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        return yield* svc.submitAdmin(input)
      }),
    ),
  ),

  submitCapabilities: publicProcedure.input(capabilitiesInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.submitCapabilities(input)
      }),
    ),
  ),

  submitProfiles: publicProcedure.input(profilesInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.submitProfiles(input)
      }),
    ),
  ),

  submitRootFolders: publicProcedure.input(rootFoldersInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.submitRootFolders(input)
      }),
    ),
  ),

  submitIndexer: publicProcedure.input(indexerInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.submitIndexer(input)
      }),
    ),
  ),

  submitDownloadClient: publicProcedure.input(downloadClientInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.submitDownloadClient(input)
      }),
    ),
  ),

  submitMediaServer: publicProcedure.input(mediaServerInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.submitMediaServer(input)
      }),
    ),
  ),

  skip: publicProcedure.input(skipInput).mutation(({ input }) =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.skipStep(input.step)
      }),
    ),
  ),

  back: publicProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.goBack()
      }),
    ),
  ),

  complete: publicProcedure.mutation(() =>
    runEffect(
      Effect.gen(function* () {
        const svc = yield* OnboardingService
        yield* svc.complete()
      }),
    ),
  ),
} satisfies TRPCRouterRecord
