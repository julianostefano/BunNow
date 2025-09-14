/**
 * HTMX Extensions and Custom Interactions
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// ========== Global HTMX Configuration ==========

document.addEventListener('DOMContentLoaded', function() {
  // Configure HTMX defaults
  htmx.config.defaultSwapStyle = 'innerHTML';
  htmx.config.defaultSwapDelay = 0;
  htmx.config.defaultSettleDelay = 20;
  htmx.config.includeIndicatorStyles = false;
  htmx.config.useTemplateFragments = true;

  // Add custom headers to all HTMX requests
  document.body.addEventListener('htmx:configRequest', function(evt) {
    evt.detail.headers['X-Requested-With'] = 'HTMX';
    evt.detail.headers['X-Client-Version'] = '2.0.0';
    evt.detail.headers['X-Timestamp'] = new Date().toISOString();
  });

  initializeGlobalFeatures();
});

// ========== Global Features ==========

function initializeGlobalFeatures() {
  initializeNotificationSystem();
  initializeSearchModal();
  initializeIntersectionObserver();
  initializeKeyboardShortcuts();
  initializeOfflineDetection();
  initializePerformanceMonitoring();
}

// ========== Notification System ==========

let notificationContainer = null;
let notificationId = 0;

function initializeNotificationSystem() {
  // Create notification container
  notificationContainer = document.createElement('div');
  notificationContainer.className = 'notification-container';
  notificationContainer.setAttribute('aria-live', 'polite');
  document.body.appendChild(notificationContainer);
}

window.showNotification = function(message, type = 'info', duration = 5000, title = null) {
  if (!notificationContainer) return;

  const id = ++notificationId;
  const notification = document.createElement('div');
  notification.className = `notification notification--${type}`;
  notification.setAttribute('data-notification-id', id);
  notification.setAttribute('role', 'alert');

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  notification.innerHTML = `
    <div class="notification__header">
      <div class="notification__title">
        <span style="margin-right: 8px;">${icons[type] || icons.info}</span>
        ${title || type.charAt(0).toUpperCase() + type.slice(1)}
      </div>
      <button class="notification__close" onclick="removeNotification(${id})" aria-label="Close notification">
        ×
      </button>
    </div>
    <div class="notification__body">${message}</div>
  `;

  notificationContainer.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add('notification--visible');
  }, 10);

  // Auto remove
  if (duration > 0) {
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }

  return id;
};

window.removeNotification = function(id) {
  const notification = document.querySelector(`[data-notification-id="${id}"]`);
  if (notification) {
    notification.classList.remove('notification--visible');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }
};

// ========== Search Modal ==========

let searchModal = null;
let searchInput = null;
let searchResults = null;

function initializeSearchModal() {
  // Create search modal if it doesn't exist
  if (!document.getElementById('search-modal')) {
    createSearchModal();
  }

  searchModal = document.getElementById('search-modal');
  searchInput = document.getElementById('search-input');
  searchResults = document.getElementById('search-results');

  // Add search modal events
  if (searchModal) {
    searchModal.addEventListener('click', function(e) {
      if (e.target === searchModal) {
        closeSearchModal();
      }
    });
  }

  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', function(e) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(e.target.value);
      }, 300);
    });

    searchInput.addEventListener('keydown', function(e) {
      handleSearchNavigation(e);
    });
  }
}

function createSearchModal() {
  const modal = document.createElement('div');
  modal.id = 'search-modal';
  modal.className = 'glass-modal-overlay';
  modal.innerHTML = `
    <div class="glass-modal" style="width: 600px; max-width: 90vw;">
      <div class="glass-modal__header">
        <div class="glass-modal__title">Search</div>
        <button class="glass-modal__close" onclick="closeSearchModal()" aria-label="Close search">×</button>
      </div>
      <div class="glass-modal__body">
        <div class="glass-search" style="margin-bottom: 20px;">
          <svg class="glass-search__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            id="search-input"
            class="glass-input glass-search__input"
            placeholder="Search incidents, problems, changes..."
            autocomplete="off"
          />
        </div>
        <div id="search-results" class="search-results">
          <div class="search-result">
            <div class="search-result__icon quick-action__icon--incidents">
              <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
            </div>
            <div class="search-result__content">
              <div class="search-result__title">Search for incidents, problems, or changes...</div>
              <div class="search-result__description">Start typing to see results</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.openSearchModal = function() {
  if (searchModal) {
    searchModal.classList.add('glass-modal-overlay--active');
    setTimeout(() => {
      if (searchInput) {
        searchInput.focus();
      }
    }, 150);
  }
};

window.closeSearchModal = function() {
  if (searchModal) {
    searchModal.classList.remove('glass-modal-overlay--active');
    if (searchInput) {
      searchInput.value = '';
    }
    if (searchResults) {
      searchResults.innerHTML = `
        <div class="search-result">
          <div class="search-result__icon quick-action__icon--incidents">
            <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
            </svg>
          </div>
          <div class="search-result__content">
            <div class="search-result__title">Search for incidents, problems, or changes...</div>
            <div class="search-result__description">Start typing to see results</div>
          </div>
        </div>
      `;
    }
  }
};

function performSearch(query) {
  if (!query || query.length < 2) {
    return;
  }

  // Use HTMX to perform the search
  htmx.ajax('GET', `/api/search?q=${encodeURIComponent(query)}`, {
    target: '#search-results',
    swap: 'innerHTML'
  });
}

function handleSearchNavigation(e) {
  const results = document.querySelectorAll('.search-result');
  const current = document.querySelector('.search-result--active');
  let currentIndex = current ? Array.from(results).indexOf(current) : -1;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      currentIndex = (currentIndex + 1) % results.length;
      break;
    case 'ArrowUp':
      e.preventDefault();
      currentIndex = currentIndex <= 0 ? results.length - 1 : currentIndex - 1;
      break;
    case 'Enter':
      if (current) {
        e.preventDefault();
        const link = current.querySelector('a') || current;
        if (link.href) {
          window.location.href = link.href;
        } else if (link.onclick) {
          link.onclick();
        }
        closeSearchModal();
      }
      return;
    case 'Escape':
      e.preventDefault();
      closeSearchModal();
      return;
  }

  // Update active state
  results.forEach(result => result.classList.remove('search-result--active'));
  if (results[currentIndex]) {
    results[currentIndex].classList.add('search-result--active');
  }
}

// ========== Intersection Observer for Lazy Loading ==========

let intersectionObserver = null;

function initializeIntersectionObserver() {
  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Handle fade-in animations
        if (entry.target.classList.contains('fade-in')) {
          entry.target.classList.add('fade-in--visible');
          intersectionObserver.unobserve(entry.target);
        }

        // Handle HTMX lazy loading
        if (entry.target.hasAttribute('hx-trigger') &&
            entry.target.getAttribute('hx-trigger').includes('revealed')) {
          htmx.trigger(entry.target, 'revealed');
          intersectionObserver.unobserve(entry.target);
        }
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '50px'
  });

  // Observe all fade-in elements
  document.querySelectorAll('.fade-in').forEach(el => {
    intersectionObserver.observe(el);
  });

  // Observe all elements with revealed trigger
  document.querySelectorAll('[hx-trigger*="revealed"]').forEach(el => {
    intersectionObserver.observe(el);
  });
}

// ========== Keyboard Shortcuts ==========

function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    // Global shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearchModal();
      return;
    }

    if (e.key === 'Escape') {
      closeSearchModal();
      // Close any other modals
      document.querySelectorAll('.glass-modal-overlay--active').forEach(modal => {
        modal.classList.remove('glass-modal-overlay--active');
      });
      return;
    }

    // Dashboard shortcuts
    if (e.altKey) {
      switch (e.key) {
        case '1':
          e.preventDefault();
          window.location.href = '/';
          break;
        case '2':
          e.preventDefault();
          window.location.href = '/incidents';
          break;
        case '3':
          e.preventDefault();
          window.location.href = '/problems';
          break;
        case '4':
          e.preventDefault();
          window.location.href = '/changes';
          break;
      }
    }
  });
}

// ========== Offline Detection ==========

function initializeOfflineDetection() {
  function updateOnlineStatus() {
    if (navigator.onLine) {
      showNotification('Connection restored', 'success', 3000);
    } else {
      showNotification('You are offline. Some features may not work.', 'warning', 0);
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

// ========== Performance Monitoring ==========

function initializePerformanceMonitoring() {
  // Monitor HTMX request performance
  let requestCount = 0;
  let requestTimes = [];

  document.body.addEventListener('htmx:beforeRequest', function(evt) {
    evt.detail.requestStart = performance.now();
    requestCount++;
  });

  document.body.addEventListener('htmx:afterRequest', function(evt) {
    const duration = performance.now() - evt.detail.requestStart;
    requestTimes.push(duration);

    // Log slow requests
    if (duration > 2000) {
      console.warn(`Slow HTMX request: ${evt.detail.pathInfo.requestPath} took ${duration.toFixed(2)}ms`);
    }

    // Keep only last 50 request times
    if (requestTimes.length > 50) {
      requestTimes = requestTimes.slice(-50);
    }
  });

  // Expose performance stats
  window.getHTMXPerformanceStats = function() {
    const avg = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
    const max = Math.max(...requestTimes);
    const min = Math.min(...requestTimes);

    return {
      totalRequests: requestCount,
      averageTime: avg ? avg.toFixed(2) : 0,
      maxTime: max ? max.toFixed(2) : 0,
      minTime: min ? min.toFixed(2) : 0,
      recentRequests: requestTimes.length
    };
  };
}

// ========== HTMX Event Handlers ==========

// Global HTMX event listeners
document.body.addEventListener('htmx:beforeRequest', function(evt) {
  console.log('HTMX Request:', evt.detail.pathInfo.requestPath);
});

document.body.addEventListener('htmx:afterRequest', function(evt) {
  if (!evt.detail.successful) {
    const status = evt.detail.xhr.status;
    const path = evt.detail.pathInfo.requestPath;

    let message = 'Request failed. Please try again.';
    if (status === 404) message = 'Resource not found.';
    else if (status === 500) message = 'Server error. Please try again later.';
    else if (status === 403) message = 'Access denied.';
    else if (status === 401) message = 'Authentication required.';

    showNotification(message, 'error');
    console.error('HTMX Error:', status, path);
  }
});

document.body.addEventListener('htmx:responseError', function(evt) {
  showNotification('Network error. Please check your connection.', 'error');
});

document.body.addEventListener('htmx:timeout', function(evt) {
  showNotification('Request timed out. Please try again.', 'warning');
});

// SSE connection monitoring
document.body.addEventListener('htmx:sseConnecting', function(evt) {
  console.log('SSE: Connecting to', evt.detail.source.url);
});

document.body.addEventListener('htmx:sseOpen', function(evt) {
  console.log('SSE: Connected to', evt.detail.source.url);
  showNotification('Real-time connection established', 'success', 2000);
});

document.body.addEventListener('htmx:sseClose', function(evt) {
  console.log('SSE: Disconnected from', evt.detail.source.url);
  showNotification('Real-time connection lost', 'warning');
});

document.body.addEventListener('htmx:sseError', function(evt) {
  console.error('SSE Error:', evt.detail);
  showNotification('Real-time connection error', 'error');
});

// ========== Utility Functions ==========

// Debounce function for performance
window.debounce = function(func, wait, immediate) {
  let timeout;
  return function executedFunction() {
    const context = this;
    const args = arguments;
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

// Format numbers for display
window.formatNumber = function(num, decimals = 0) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'k';
  }
  return num.toLocaleString();
};

// Format time ago
window.timeAgo = function(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
};

// Copy to clipboard
window.copyToClipboard = async function(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard', 'success', 2000);
    return true;
  } catch (err) {
    showNotification('Failed to copy to clipboard', 'error');
    return false;
  }
};

// ========== Neural Search Functions ==========

window.openNeuralSearch = function() {
  showNotification('Opening Neural Search...', 'info', 2000, 'Neural Search');

  // Create neural search modal if it doesn't exist
  if (!document.getElementById('neural-search-modal')) {
    createNeuralSearchModal();
  }

  const modal = document.getElementById('neural-search-modal');
  const input = document.getElementById('neural-search-input');

  if (modal && input) {
    modal.classList.add('glass-modal-overlay--active');
    setTimeout(() => {
      input.focus();
    }, 150);
  }
};

function createNeuralSearchModal() {
  const modal = document.createElement('div');
  modal.id = 'neural-search-modal';
  modal.className = 'glass-modal-overlay';
  modal.innerHTML = `
    <div class="glass-modal" style="width: 700px; max-width: 95vw;">
      <div class="glass-modal__header">
        <div class="glass-modal__title">
          <span class="neural-icon" style="margin-right: 0.5rem;">🧠</span>
          Neural Search
        </div>
        <button class="glass-modal__close" onclick="closeNeuralSearch()" aria-label="Close neural search">×</button>
      </div>
      <div class="glass-modal__body">
        <div class="glass-search" style="margin-bottom: 20px;">
          <svg class="glass-search__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            id="neural-search-input"
            class="glass-input glass-search__input"
            placeholder="Describe what you're looking for in natural language..."
            autocomplete="off"
          />
        </div>
        <div class="neural-search-suggestions" style="margin-bottom: 1rem;">
          <div style="font-size: 0.875rem; color: rgba(255, 255, 255, 0.6); margin-bottom: 0.5rem;">Try asking:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            <button class="neural-suggestion" onclick="setNeuralQuery(this.textContent)">Critical incidents from last week</button>
            <button class="neural-suggestion" onclick="setNeuralQuery(this.textContent)">Problems assigned to me</button>
            <button class="neural-suggestion" onclick="setNeuralQuery(this.textContent)">Changes pending approval</button>
            <button class="neural-suggestion" onclick="setNeuralQuery(this.textContent)">High priority tickets</button>
          </div>
        </div>
        <div id="neural-search-results" class="neural-search-results">
          <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🧠</div>
            <div>Neural search ready - describe what you need in natural language</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Add event listeners
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeNeuralSearch();
    }
  });

  const input = document.getElementById('neural-search-input');
  if (input) {
    let searchTimeout;
    input.addEventListener('input', function(e) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performNeuralSearch(e.target.value);
      }, 500);
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeNeuralSearch();
      }
    });
  }
}

window.closeNeuralSearch = function() {
  const modal = document.getElementById('neural-search-modal');
  if (modal) {
    modal.classList.remove('glass-modal-overlay--active');
    const input = document.getElementById('neural-search-input');
    if (input) {
      input.value = '';
    }
    const results = document.getElementById('neural-search-results');
    if (results) {
      results.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🧠</div>
          <div>Neural search ready - describe what you need in natural language</div>
        </div>
      `;
    }
  }
};

window.setNeuralQuery = function(query) {
  const input = document.getElementById('neural-search-input');
  if (input) {
    input.value = query;
    input.focus();
    performNeuralSearch(query);
  }
};

async function performNeuralSearch(query) {
  if (!query || query.length < 3) {
    return;
  }

  const results = document.getElementById('neural-search-results');
  if (!results) return;

  // Show loading state
  results.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
      <div class="glass-loading glass-loading--visible">
        <div class="glass-loading__spinner"></div>
        <span class="glass-loading__text">Processing neural query...</span>
      </div>
    </div>
  `;

  try {
    // Fetch real ServiceNow data
    const response = await fetch(`/api/neural-search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.success) {
      results.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚠️</div>
          <div>${data.message}</div>
        </div>
      `;
      return;
    }

    if (data.results.length === 0) {
      results.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍</div>
          <div>No results found for "${query}"</div>
          <div style="font-size: 0.875rem; margin-top: 0.5rem; color: rgba(255, 255, 255, 0.4);">
            Try different keywords or check your spelling
          </div>
        </div>
      `;
      return;
    }

    // Render results
    const headerHtml = `
      <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(102, 126, 234, 0.1); border-radius: 0.5rem; border: 1px solid rgba(102, 126, 234, 0.2);">
        <div style="font-size: 0.875rem; color: rgba(102, 126, 234, 0.9); font-weight: 600;">
          🧠 Neural Search Results
        </div>
        <div style="font-size: 0.75rem; color: rgba(102, 126, 234, 0.7); margin-top: 0.25rem;">
          Found ${data.total_results} matches for "${query}" • Processing time: ${data.processing_time}
        </div>
      </div>
    `;

    const resultsHtml = data.results.map(result => `
      <div class="neural-result">
        <div class="neural-result__header">
          <div class="neural-result__title">${result.title}</div>
          <div class="neural-result__type">${result.type}</div>
        </div>
        <div class="neural-result__description">${result.description}</div>
        <div class="neural-result__meta">
          <div>ID: ${result.id}</div>
          <div>Priority: ${result.priority}</div>
          <div>State: ${result.state}</div>
          ${result.assigned_to ? `<div>Assigned: ${result.assigned_to}</div>` : ''}
          <div class="neural-result__confidence">
            Confidence:
            <div class="confidence-bar">
              <div class="confidence-fill" style="width: ${Math.round(result.confidence * 100)}%"></div>
            </div>
            ${Math.round(result.confidence * 100)}%
          </div>
        </div>
      </div>
    `).join('');

    results.innerHTML = headerHtml + resultsHtml;

    // Show success notification
    showNotification(`Found ${data.total_results} results with neural search`, 'success', 3000, 'Neural Search');

  } catch (error) {
    console.error('Neural Search Error:', error);
    results.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: rgba(255, 99, 99, 0.8);">
        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">❌</div>
        <div>Search failed</div>
        <div style="font-size: 0.875rem; margin-top: 0.5rem; color: rgba(255, 99, 99, 0.6);">
          ${error.message || 'Unknown error occurred'}
        </div>
      </div>
    `;

    showNotification('Neural search failed. Please try again.', 'error', 5000, 'Neural Search');
  }
}

// ========== Filter Bar Functions ==========

window.initializeFilterBar = function() {
  // Set default active tab and states
  setActiveTab('incidents');
  loadStatesForType('incidents');
};

window.setActiveTab = function(type) {
  // Update tab indicator
  const indicator = document.querySelector('.filter-tab-indicator');
  const tabs = document.querySelectorAll('.filter-tab');

  if (indicator) {
    indicator.className = `filter-tab-indicator filter-tab-indicator--${type}`;
  }

  // Update active tab
  tabs.forEach(tab => {
    tab.classList.remove('filter-tab--active');
    if (tab.dataset.type === type) {
      tab.classList.add('filter-tab--active');
    }
  });

  // Load states for this type
  loadStatesForType(type);

  // Trigger content update
  htmx.ajax('GET', `/api/tickets/${type}?states=em-espera,novo,designado`, {
    target: '#ticket-content',
    swap: 'innerHTML'
  });
};

function loadStatesForType(type) {
  const statesContainer = document.querySelector('.filter-states');
  if (!statesContainer) return;

  // Add loading state
  statesContainer.classList.add('filter-states--loading');

  // Define states by type
  const statesByType = {
    incidents: [
      { key: 'em-espera', label: 'Em Espera', default: true },
      { key: 'novo', label: 'Novo', default: true },
      { key: 'designado', label: 'Designado', default: true },
      { key: 'em-andamento', label: 'Em Andamento', default: false },
      { key: 'resolvido', label: 'Resolvido', default: false },
      { key: 'fechado', label: 'Fechado', default: false }
    ],
    problems: [
      { key: 'em-espera', label: 'Em Espera', default: true },
      { key: 'novo', label: 'Novo', default: true },
      { key: 'designado', label: 'Designado', default: true },
      { key: 'investigando', label: 'Investigando', default: false },
      { key: 'solucionado', label: 'Solucionado', default: false }
    ],
    changes: [
      { key: 'em-espera', label: 'Em Espera', default: true },
      { key: 'novo', label: 'Novo', default: true },
      { key: 'designado', label: 'Designado', default: true },
      { key: 'em-revisao', label: 'Em Revisão', default: false },
      { key: 'aprovado', label: 'Aprovado', default: false },
      { key: 'rejeitado', label: 'Rejeitado', default: false }
    ],
    requests: [
      { key: 'em-espera', label: 'Em Espera', default: true },
      { key: 'novo', label: 'Novo', default: true },
      { key: 'designado', label: 'Designado', default: true },
      { key: 'em-progresso', label: 'Em Progresso', default: false },
      { key: 'entregue', label: 'Entregue', default: false }
    ]
  };

  const states = statesByType[type] || statesByType.incidents;

  setTimeout(() => {
    statesContainer.innerHTML = states.map(state => `
      <button class="filter-state ${state.default ? 'filter-state--default filter-state--active' : ''}"
              data-state="${state.key}"
              onclick="toggleFilterState(this, '${type}')">
        ${state.label}
      </button>
    `).join('');

    statesContainer.classList.remove('filter-states--loading');
  }, 200);
}

window.toggleFilterState = function(button, type) {
  button.classList.toggle('filter-state--active');
  button.classList.remove('filter-state--default');

  // Get all active states
  const activeStates = Array.from(document.querySelectorAll('.filter-state--active'))
    .map(btn => btn.dataset.state);

  // Update ticket content based on selected states
  if (activeStates.length > 0) {
    htmx.ajax('GET', `/api/tickets/${type}?states=${activeStates.join(',')}`, {
      target: '#ticket-content',
      swap: 'innerHTML'
    });
  }
};

// Add neural search keyboard shortcut
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    openNeuralSearch();
  }
});

// Export performance data
window.exportPerformanceData = function() {
  const data = {
    timestamp: new Date().toISOString(),
    performance: window.getHTMXPerformanceStats(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bunsnc-performance-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

console.log('🚀 HTMX Extensions loaded successfully');
console.log('💡 Available shortcuts: Ctrl+K (search), Alt+1-4 (navigation), Esc (close modals)');