/**
 * Layout Component - Reusable layout for all pages
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

interface LayoutProps {
  title: string;
  description?: string;
  children: JSX.Element | JSX.Element[] | string;
  showNavigation?: boolean;
  activeRoute?: string;
}

export const Layout = ({
  title,
  description = "ServiceNow Analytics Dashboard - Real-time monitoring and data processing",
  children,
  showNavigation = true,
  activeRoute = "/"
}: LayoutProps) => (
  <html lang="en" class="h-full">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content={description} />
      <title>{title}</title>
      <link href="/public/styles.css" rel="stylesheet" />
      <script src="https://unpkg.com/htmx.org@1.9.10" defer></script>
      <script src="https://unpkg.com/htmx.org/dist/ext/sse.js" defer></script>
      <script src="https://unpkg.com/alpinejs@3.13.3/dist/cdn.min.js" defer></script>
      <script src="https://unpkg.com/chart.js@4.4.0/dist/chart.min.js" defer></script>
    </head>
    <body class="h-full bg-gray-50 font-sans antialiased">
      <div id="app" class="min-h-screen flex flex-col">
        {showNavigation && <Navigation activeRoute={activeRoute} />}
        <main class="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
      <script src="/public/js/dashboard.js"></script>
    </body>
  </html>
);

// Navigation component
interface NavigationProps {
  activeRoute: string;
}

const Navigation = ({ activeRoute }: NavigationProps) => (
  <nav class="bg-white shadow-sm border-b border-gray-200">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
            </div>
            <h1 class="text-xl font-semibold text-gray-900">ServiceNow Analytics</h1>
          </div>

          {/* Navigation Links */}
          <div class="hidden md:flex items-center space-x-8 ml-8">
            <NavLink href="/" active={activeRoute === "/"}>Dashboard</NavLink>
            <NavLink href="/dashboard/incidents" active={activeRoute === "/dashboard/incidents"}>Incidents</NavLink>
            <NavLink href="/dashboard/problems" active={activeRoute === "/dashboard/problems"}>Problems</NavLink>
            <NavLink href="/dashboard/changes" active={activeRoute === "/dashboard/changes"}>Changes</NavLink>
            <NavLink href="/real-time/monitoring" active={activeRoute === "/real-time/monitoring"}>Real-time</NavLink>
          </div>
        </div>

        {/* Status Indicators */}
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span class="text-sm text-gray-600">Connected</span>
          </div>

          {/* Notification Bell */}
          <button class="relative p-2 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-md">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5z"></path>
            </svg>
            <span class="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white"></span>
          </button>
        </div>
      </div>
    </div>
  </nav>
);

// Navigation Link component
interface NavLinkProps {
  href: string;
  active: boolean;
  children: string;
}

const NavLink = ({ href, active, children }: NavLinkProps) => (
  <a
    href={href}
    class={active ? "nav-link-active" : "nav-link-inactive"}
  >
    {children}
  </a>
);