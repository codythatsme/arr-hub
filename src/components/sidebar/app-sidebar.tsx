import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Globe } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { topLevelItems, collapsibleGroups, bottomItems } from './nav-data'
import type { NavGroup, NavItem } from './nav-data'

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  function isActive(to: string): boolean {
    if (to === '/') return pathname === '/'
    // strip trailing slash for comparison
    const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
    const normalizedTo = to.endsWith('/') ? to.slice(0, -1) : to
    return normalizedPath === normalizedTo
  }

  function isGroupActive(basePath: string): boolean {
    return pathname.startsWith(basePath)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Globe className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">arr-hub</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Top-level items */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {topLevelItems.map((item) => (
                <TopLevelNavItem
                  key={item.to}
                  item={item}
                  active={isActive(item.to)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Collapsible groups */}
        {collapsibleGroups.map((group) => (
          <CollapsibleNavGroup
            key={group.label}
            group={group}
            isGroupOpen={isGroupActive(group.basePath)}
            isActive={isActive}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {bottomItems.map((item) => (
            <TopLevelNavItem
              key={item.to}
              item={item}
              active={isActive(item.to)}
            />
          ))}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

function TopLevelNavItem({
  item,
  active,
}: {
  item: NavItem
  active: boolean
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
        <Link to={item.to}>
          <item.icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function CollapsibleNavGroup({
  group,
  isGroupOpen,
  isActive,
}: {
  group: NavGroup
  isGroupOpen: boolean
  isActive: (to: string) => boolean
}) {
  return (
    <Collapsible defaultOpen={isGroupOpen} className="group/collapsible">
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center">
            <group.icon className="mr-2 size-4" />
            {group.label}
            <ChevronRight className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenuSub>
              {group.items.map((item) => (
                <SidebarMenuSubItem key={item.to}>
                  <SidebarMenuSubButton asChild isActive={isActive(item.to)}>
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
