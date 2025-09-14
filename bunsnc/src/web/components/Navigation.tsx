/**
 * Modern Navigation Component with Glass Design
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: JSX.Element;
  active?: boolean;
  badge?: string | number;
  description?: string;
}

interface NavigationProps {
  items: NavigationItem[];
  currentPath: string;
  user?: {
    name: string;
    avatar?: string;
    role?: string;
  };
  showSearch?: boolean;
  onSearchToggle?: () => void;
}

export const MainNavigation = ({
  items,
  currentPath,
  user,
  showSearch = true,
  onSearchToggle
}: NavigationProps) => {
  const isActive = (href: string) => currentPath === href || currentPath.startsWith(href + '/');

  return (
    <nav class="glass-nav fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div class="flex items-center space-x-6 px-6 py-3">

        {/* Logo/Brand */}
        <div class="flex items-center space-x-2">
          <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 3V9H21L11 23V17H3L13 3Z" />
            </svg>
          </div>
          <span class="font-semibold text-white hidden sm:block">BunSNC</span>
        </div>

        {/* Navigation Items */}
        <div class="flex items-center space-x-1">
          {items.map(item => (
            <a
              href={item.href}
              key={item.id}
              class={`
                relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                flex items-center space-x-2 group
                ${isActive(item.href)
                  ? 'bg-white/20 text-white backdrop-blur-sm'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
                }
              `}
              title={item.description}
            >
              <span class="w-4 h-4">{item.icon}</span>
              <span class="hidden md:block">{item.label}</span>

              {item.badge && (
                <span class="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full min-w-[18px] flex items-center justify-center">
                  {item.badge}
                </span>
              )}

              {/* Active indicator */}
              {isActive(item.href) && (
                <div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-white rounded-full"></div>
              )}
            </a>
          ))}
        </div>

        {/* Search Button */}
        {showSearch && (
          <button
            onclick={onSearchToggle ? `(${onSearchToggle.toString()})()` : "toggleSearch()"}
            class="glass-btn p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Search (Ctrl+K)"
          >
            <svg class="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        )}

        {/* User Menu */}
        {user && (
          <div class="relative">
            <button class="flex items-center space-x-2 glass-btn p-2 rounded-lg hover:bg-white/10 transition-colors">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} class="w-6 h-6 rounded-full" />
              ) : (
                <div class="w-6 h-6 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                  <span class="text-xs text-white font-medium">{user.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <span class="text-white/80 text-sm hidden lg:block">{user.name}</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

// Search Overlay Component
export const SearchOverlay = () => (
  <div id="search-overlay" class="search-overlay">
    <div class="search-modal">
      <div class="p-6">
        {/* Search Header */}
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Search</h3>
          <button
            onclick="closeSearch()"
            class="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div class="glass-search mb-6">
          <div class="glass-search-icon">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            class="glass-search-input"
            placeholder="Search incidents, problems, changes..."
            hx-get="/api/search"
            hx-trigger="keyup changed delay:300ms"
            hx-target="#search-results"
            hx-indicator="#search-loading"
            autofocus
          />
        </div>

        {/* Search Loading */}
        <div id="search-loading" class="htmx-indicator">
          <div class="loading-indicator visible">
            <div class="loading-spinner"></div>
            <span class="ml-3 text-white/80">Searching...</span>
          </div>
        </div>

        {/* Search Results */}
        <div id="search-results" class="search-results">
          {/* Results will be loaded here via HTMX */}
        </div>

        {/* Search Shortcuts */}
        <div class="border-t border-white/10 pt-4 mt-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <h4 class="text-white/80 font-medium mb-2">Quick Actions</h4>
              <div class="space-y-1">
                <button class="block w-full text-left text-white/60 hover:text-white py-1 px-2 rounded hover:bg-white/5 transition-colors">
                  Create Incident
                </button>
                <button class="block w-full text-left text-white/60 hover:text-white py-1 px-2 rounded hover:bg-white/5 transition-colors">
                  New Problem
                </button>
                <button class="block w-full text-left text-white/60 hover:text-white py-1 px-2 rounded hover:bg-white/5 transition-colors">
                  Change Request
                </button>
              </div>
            </div>
            <div>
              <h4 class="text-white/80 font-medium mb-2">Keyboard Shortcuts</h4>
              <div class="space-y-1 text-white/60 text-xs">
                <div>Ctrl+K - Open search</div>
                <div>Escape - Close search</div>
                <div>↑↓ - Navigate results</div>
                <div>Enter - Open item</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Navigation Icons
export const NavigationIcons = {
  Dashboard: (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
    </svg>
  ),
  Incidents: (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  ),
  Problems: (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  Changes: (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.11 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" />
    </svg>
  ),
  Analytics: (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z" />
    </svg>
  ),
  Reports: (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
    </svg>
  ),
  Settings: (
    <svg fill="currentColor" viewBox="0 0 24 24">
      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
    </svg>
  )
};

// Search and Navigation JavaScript
export const NavigationScript = () => (
  <script>
    {`
      // Global navigation functions
      window.toggleSearch = function() {
        const overlay = document.getElementById('search-overlay');
        if (overlay) {
          overlay.classList.toggle('active');
          if (overlay.classList.contains('active')) {
            const input = overlay.querySelector('input');
            if (input) setTimeout(() => input.focus(), 100);
          }
        }
      };

      window.closeSearch = function() {
        const overlay = document.getElementById('search-overlay');
        if (overlay) {
          overlay.classList.remove('active');
        }
      };

      // Keyboard shortcuts
      document.addEventListener('keydown', function(e) {
        // Ctrl+K or Cmd+K to open search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          window.toggleSearch();
        }

        // Escape to close search
        if (e.key === 'Escape') {
          window.closeSearch();
        }
      });

      // Close search when clicking outside
      document.addEventListener('click', function(e) {
        const overlay = document.getElementById('search-overlay');
        const searchModal = document.querySelector('.search-modal');

        if (overlay && overlay.classList.contains('active')) {
          if (!searchModal.contains(e.target)) {
            window.closeSearch();
          }
        }
      });

      // Handle search result navigation with arrow keys
      document.addEventListener('keydown', function(e) {
        const results = document.querySelectorAll('.search-result-item');
        const activeResult = document.querySelector('.search-result-item.active');

        if (results.length === 0) return;

        let currentIndex = -1;
        if (activeResult) {
          currentIndex = Array.from(results).indexOf(activeResult);
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % results.length;
          results.forEach(r => r.classList.remove('active'));
          results[nextIndex].classList.add('active');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? results.length - 1 : currentIndex - 1;
          results.forEach(r => r.classList.remove('active'));
          results[prevIndex].classList.add('active');
        } else if (e.key === 'Enter' && activeResult) {
          e.preventDefault();
          const link = activeResult.querySelector('a');
          if (link) link.click();
        }
      });
    `}
  </script>
);