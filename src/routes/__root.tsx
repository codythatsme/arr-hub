import { TanStackDevtools, type TanStackDevtoolsReactPlugin } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query"

import type { TRPCRouter } from "#/integrations/trpc/router"

import { AuthGuard, useHideShell } from "../components/auth-guard"
import { AppSidebar } from "../components/sidebar/app-sidebar"
import { Separator } from "../components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../components/ui/sidebar"
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools"
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider"

import appCss from "../styles.css?url"

const devtoolsConfig = { position: "bottom-right" as const }
const devtoolsPlugins: Array<TanStackDevtoolsReactPlugin> = [
  {
    name: "Tanstack Router",
    render: <TanStackRouterDevtoolsPanel />,
  },
  TanStackQueryDevtools,
]

interface MyRouterContext {
  queryClient: QueryClient

  trpc: TRPCOptionsProxy<TRPCRouter>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "arr-hub",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <TanStackQueryProvider>
          <AuthGuard>
            <Shell>{children}</Shell>
          </AuthGuard>
          <TanStackDevtools config={devtoolsConfig} plugins={devtoolsPlugins} />
        </TanStackQueryProvider>
        <Scripts />
      </body>
    </html>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const hideShell = useHideShell()

  if (hideShell) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
