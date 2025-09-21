/**
 * Main Layout with Glass Navigation and Modern Design
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  MainNavigation,
  SearchOverlay,
  NavigationIcons,
  NavigationScript,
} from "../components/Navigation";

interface MainLayoutProps {
  title?: string;
  currentPath: string;
  children: JSX.Element | string;
  user?: {
    name: string;
    avatar?: string;
    role?: string;
  };
  showSearch?: boolean;
  additionalHead?: JSX.Element | string;
  bodyClass?: string;
}

export const MainLayout = ({
  title = "ServiceNow Analytics",
  currentPath,
  children,
  user,
  showSearch = true,
  additionalHead = "",
  bodyClass = "",
}: MainLayoutProps) => {
  // Navigation configuration
  const navigationItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      href: "/",
      icon: NavigationIcons.Dashboard,
      description: "Real-time analytics and metrics",
    },
    {
      id: "incidents",
      label: "Incidents",
      href: "/incidents",
      icon: NavigationIcons.Incidents,
      badge: "24",
      description: "Incident management and tracking",
    },
    {
      id: "problems",
      label: "Problems",
      href: "/problems",
      icon: NavigationIcons.Problems,
      badge: "5",
      description: "Problem investigation and resolution",
    },
    {
      id: "changes",
      label: "Changes",
      href: "/changes",
      icon: NavigationIcons.Changes,
      badge: "12",
      description: "Change requests and implementations",
    },
    {
      id: "analytics",
      label: "Analytics",
      href: "/analytics",
      icon: NavigationIcons.Analytics,
      description: "Advanced analytics and reporting",
    },
    {
      id: "reports",
      label: "Reports",
      href: "/reports",
      icon: NavigationIcons.Reports,
      description: "Generate and view reports",
    },
  ];

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} | BunSNC</title>

        <!-- CSS Imports -->
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="/public/styles/modern-glass.css">
        <script src="https://cdn.tailwindcss.com"></script>

        <!-- HTMX -->
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>

        <!-- PWA Meta -->
        <meta name="theme-color" content="#667eea">
        <meta name="description" content="Modern ServiceNow Analytics Platform">

        <!-- Favicon -->
        <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23667eea'%3e%3cpath d='M13 3V9H21L11 23V17H3L13 3Z'/%3e%3c/svg%3e">

        <!-- Additional head content -->
        ${additionalHead}

        <!-- TailwindCSS Config -->
        <script>
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  sans: ['Inter', 'system-ui', 'sans-serif'],
                },
                animation: {
                  'float': 'float 6s ease-in-out infinite',
                  'fade-in': 'fadeIn 0.3s ease-out',
                  'slide-up': 'slideUp 0.4s ease-out',
                  'pulse-slow': 'pulse 3s ease-in-out infinite',
                },
                backdropBlur: {
                  'xs': '2px',
                }
              }
            }
          }
        </script>
      </head>

      <body class="font-sans ${bodyClass}">
        <!-- Navigation -->
        ${MainNavigation({
          items: navigationItems,
          currentPath,
          user,
          showSearch,
        })}

        <!-- Search Overlay -->
        ${showSearch ? SearchOverlay() : ""}

        <!-- Main Content -->
        <main class="min-h-screen pt-20 pb-8">
          <div class="container mx-auto px-4">
            ${children}
          </div>
        </main>

        <!-- Footer -->
        <footer class="glass-card mx-4 mb-4 p-6 text-center">
          <div class="flex flex-col md:flex-row justify-between items-center text-white/60 text-sm">
            <div class="mb-2 md:mb-0">
              <span class="gradient-text font-semibold">BunSNC</span> - Modern ServiceNow Analytics Platform
            </div>
            <div class="flex items-center space-x-4">
              <span>v2.0.0</span>
              <span>•</span>
              <span>Built with Bun + Elysia</span>
              <span>•</span>
              <div class="flex items-center space-x-1">
                <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Live</span>
              </div>
            </div>
          </div>
        </footer>

        <!-- SSE Connection for Real-time Updates -->
        <div
          hx-ext="sse"
          sse-connect="/events/stream"
          sse-swap="incident-count"
          hx-target="#incident-count"
        ></div>

        <!-- Navigation Scripts -->
        ${NavigationScript()}

        <!-- Global Scripts -->
        <script>
          // Initialize HTMX
          document.body.addEventListener('htmx:configRequest', function(evt) {
            evt.detail.headers['X-Requested-With'] = 'HTMX';
          });

          // Global notification system
          window.showNotification = function(message, type = 'info', duration = 5000) {
            const notification = document.createElement('div');
            notification.className = \`
              fixed top-24 right-4 z-50 p-4 rounded-lg shadow-lg glass-card
              transform translate-x-full transition-transform duration-300
              \${type === 'success' ? 'border-green-400' :
                type === 'error' ? 'border-red-400' :
                type === 'warning' ? 'border-yellow-400' : 'border-blue-400'}
            \`;
            notification.innerHTML = \`
              <div class="flex items-center space-x-3">
                <div class="flex-shrink-0">
                  \${type === 'success' ? '✅' :
                    type === 'error' ? '❌' :
                    type === 'warning' ? '⚠️' : 'ℹ️'}
                </div>
                <div class="text-white text-sm">\${message}</div>
                <button onclick="this.parentElement.parentElement.remove()" class="text-white/60 hover:text-white ml-4">×</button>
              </div>
            \`;

            document.body.appendChild(notification);

            // Slide in
            setTimeout(() => {
              notification.classList.remove('translate-x-full');
            }, 100);

            // Auto remove
            if (duration > 0) {
              setTimeout(() => {
                notification.classList.add('translate-x-full');
                setTimeout(() => notification.remove(), 300);
              }, duration);
            }
          };

          // Handle HTMX events
          document.body.addEventListener('htmx:afterRequest', function(evt) {
            if (evt.detail.successful) {
              // Add success feedback if needed
              const target = evt.detail.target;
              if (target && target.dataset.successMessage) {
                window.showNotification(target.dataset.successMessage, 'success');
              }
            } else {
              window.showNotification('Request failed. Please try again.', 'error');
            }
          });

          // Lazy loading observer
          const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                entry.target.classList.add('loaded');
                observer.unobserve(entry.target);
              }
            });
          }, {
            threshold: 0.1,
            rootMargin: '50px'
          });

          // Observe all lazy load items
          document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.lazy-load-item').forEach(item => {
              lazyLoadObserver.observe(item);
            });
          });

          // Enhanced error handling
          window.addEventListener('error', function(e) {
            console.error('Global error:', e.error);
            if (!window.navigator.onLine) {
              window.showNotification('You are offline. Some features may not work.', 'warning');
            }
          });

          // Network status
          window.addEventListener('online', () => {
            window.showNotification('Connection restored', 'success', 3000);
          });

          window.addEventListener('offline', () => {
            window.showNotification('You are offline', 'warning', 0);
          });

          // Service Worker registration for PWA (future enhancement)
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => {
              console.log('ServiceWorker registration failed: ', err);
            });
          }
        </script>
      </body>
    </html>
  `;
};

// Helper function to create page metadata
export const createPageMeta = (options: {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
}) => {
  return `
    <meta name="description" content="${options.description || "Modern ServiceNow Analytics Platform"}">
    <meta property="og:title" content="${options.title || "ServiceNow Analytics"} | BunSNC">
    <meta property="og:description" content="${options.description || "Modern ServiceNow Analytics Platform"}">
    <meta property="og:image" content="${options.ogImage || "/public/images/og-image.png"}">
    <meta property="og:type" content="website">
    ${options.canonical ? `<link rel="canonical" href="${options.canonical}">` : ""}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${options.title || "ServiceNow Analytics"} | BunSNC">
    <meta name="twitter:description" content="${options.description || "Modern ServiceNow Analytics Platform"}">
  `;
};
