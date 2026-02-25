"use client";

import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/app/components/ui/navigation-menu";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/app/context/AuthContext";

function ListItem({
  title,
  children,
  href,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & { href: string }) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link href={href}>
          <div className="flex flex-col gap-1 text-sm">
            <div className="leading-none font-medium">{title}</div>
            <div className="text-muted-foreground line-clamp-2">{children}</div>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}

export const NavBar = () => {
  const auth = useAuth();

  const logout = async () => {
    await auth.handleLogout();
  };

  return (
    <div className="min-w-screen p-2 h-20">
      <div className="flex items-center h-full border border-gray-400 rounded-lg">
        <NavigationMenu className="px-5">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Something</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="w-96">
                  <ListItem href="/docs" title="Introduction">
                    Re-usable components built with Tailwind CSS.
                  </ListItem>
                  <ListItem href="/docs/installation" title="Installation">
                    How to install dependencies and structure your app.
                  </ListItem>
                  <ListItem
                    href="/docs/primitives/typography"
                    title="Typography"
                  >
                    Styles for headings, paragraphs, lists...etc
                  </ListItem>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Button variant="link" onClick={logout}>
                  Logout
                </Button>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </div>
  );
};
