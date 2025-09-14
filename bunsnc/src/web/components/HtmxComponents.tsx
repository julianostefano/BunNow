/**
 * HTMX Components Library - Reusable Interactive Components
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

// Stat Card Component with auto-refresh
interface StatCardProps {
  title: string;
  value: string | number;
  endpoint: string;
  refreshInterval?: number;
  icon: JSX.Element;
  color?: string;
  description?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
}

export const StatCard = ({
  title,
  value,
  endpoint,
  refreshInterval = 30,
  icon,
  color = "blue",
  description,
  trend
}: StatCardProps) => (
  <div class="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
    <div class="flex items-center justify-between">
      <div class="flex-1">
        <p class="text-sm font-medium text-gray-600 mb-1">{title}</p>
        <p
          class={`text-3xl font-bold text-${color}-600`}
          hx-get={endpoint}
          hx-trigger={`every ${refreshInterval}s`}
          hx-target="this"
        >
          {value}
        </p>
        {description && (
          <p class="text-xs text-gray-500 mt-1">{description}</p>
        )}
        {trend && (
          <div class="flex items-center text-sm mt-2">
            <span class={`text-${trend.direction === 'up' ? 'green' : trend.direction === 'down' ? 'red' : 'gray'}-600`}>
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.value}
            </span>
            <span class="text-gray-500 ml-1">vs yesterday</span>
          </div>
        )}
      </div>
      <div class={`w-12 h-12 bg-${color}-100 rounded-lg flex items-center justify-center`}>
        {icon}
      </div>
    </div>
  </div>
);

// Loading Spinner Component
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  message?: string;
}

export const LoadingSpinner = ({
  size = 'md',
  color = 'blue',
  message
}: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div class="flex items-center justify-center p-4">
      <div class={`animate-spin rounded-full ${sizeClasses[size]} border-b-2 border-${color}-600`}></div>
      {message && <span class="ml-3 text-gray-600">{message}</span>}
    </div>
  );
};

// Interactive Button Component
interface InteractiveButtonProps {
  label: string;
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  target?: string;
  indicator?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: JSX.Element;
  disabled?: boolean;
  confirmMessage?: string;
}

export const InteractiveButton = ({
  label,
  endpoint,
  method = 'POST',
  target = '#content',
  indicator = '#loading-spinner',
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  confirmMessage
}: InteractiveButtonProps) => {
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white'
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  const htmxProps = {
    'hx-get': method === 'GET' ? endpoint : undefined,
    'hx-post': method === 'POST' ? endpoint : undefined,
    'hx-put': method === 'PUT' ? endpoint : undefined,
    'hx-delete': method === 'DELETE' ? endpoint : undefined,
    'hx-target': target,
    'hx-indicator': indicator,
    'hx-confirm': confirmMessage
  };

  return (
    <button
      class={`${variantClasses[variant]} ${sizeClasses[size]} font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors`}
      disabled={disabled}
      {...htmxProps}
    >
      {icon && <span class="mr-2">{icon}</span>}
      {label}
    </button>
  );
};

// Data Table Component with HTMX
interface DataTableProps {
  title: string;
  endpoint: string;
  refreshInterval?: number;
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
  }>;
  actions?: Array<{
    label: string;
    endpoint: string;
    method?: string;
    variant?: string;
  }>;
}

export const DataTable = ({
  title,
  endpoint,
  refreshInterval = 60,
  columns,
  actions
}: DataTableProps) => (
  <div class="bg-white rounded-lg shadow overflow-hidden">
    <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
      <h3 class="text-lg font-semibold text-gray-900">{title}</h3>
      <div class="flex items-center space-x-2">
        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span class="text-sm text-gray-600">Live data</span>
      </div>
    </div>
    <div
      class="overflow-x-auto"
      hx-get={endpoint}
      hx-trigger={`load, every ${refreshInterval}s`}
      hx-target="this"
      hx-indicator="#table-loading"
    >
      <div id="table-loading" class="htmx-indicator">
        <LoadingSpinner message="Loading data..." />
      </div>
    </div>
  </div>
);

// Form Component with HTMX
interface HtmxFormProps {
  action: string;
  method?: string;
  target?: string;
  children: JSX.Element | JSX.Element[];
  onSuccess?: string;
  onError?: string;
  resetOnSuccess?: boolean;
}

export const HtmxForm = ({
  action,
  method = 'POST',
  target = '#form-result',
  children,
  onSuccess,
  onError,
  resetOnSuccess = true
}: HtmxFormProps) => (
  <form
    hx-post={method === 'POST' ? action : undefined}
    hx-get={method === 'GET' ? action : undefined}
    hx-put={method === 'PUT' ? action : undefined}
    hx-delete={method === 'DELETE' ? action : undefined}
    hx-target={target}
    hx-indicator="#form-spinner"
    hx-on={onSuccess ? `htmx:afterRequest: ${onSuccess}` : undefined}
    class="space-y-4"
  >
    {children}
    <div id="form-spinner" class="htmx-indicator">
      <LoadingSpinner message="Processing..." />
    </div>
  </form>
);

// Modal Component with HTMX
interface ModalProps {
  id: string;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: JSX.Element | JSX.Element[];
  footer?: JSX.Element;
}

export const Modal = ({
  id,
  title,
  size = 'md',
  children,
  footer
}: ModalProps) => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <div id={id} class="fixed inset-0 z-50 overflow-y-auto hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onclick={`document.getElementById('${id}').classList.add('hidden')`}></div>

        <div class={`inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle ${sizeClasses[size]} sm:w-full`}>
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                {title}
              </h3>
              <button
                type="button"
                class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-2"
                onclick={`document.getElementById('${id}').classList.add('hidden')`}
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div>{children}</div>
          </div>
          {footer && (
            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Alert Component
interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  dismissible?: boolean;
  id?: string;
}

export const Alert = ({
  type,
  title,
  message,
  dismissible = true,
  id = 'alert'
}: AlertProps) => {
  const typeClasses = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const icons = {
    success: <svg class="w-5 h-5 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>,
    error: <svg class="w-5 h-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>,
    warning: <svg class="w-5 h-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>,
    info: <svg class="w-5 h-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
  };

  return (
    <div id={id} class={`border rounded-md p-4 ${typeClasses[type]}`}>
      <div class="flex">
        <div class="flex-shrink-0">
          {icons[type]}
        </div>
        <div class="ml-3 flex-1">
          {title && (
            <h3 class="text-sm font-medium">{title}</h3>
          )}
          <div class={`text-sm ${title ? 'mt-2' : ''}`}>
            <p>{message}</p>
          </div>
        </div>
        {dismissible && (
          <div class="ml-auto pl-3">
            <div class="-mx-1.5 -my-1.5">
              <button
                type="button"
                class={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 hover:bg-${type === 'success' ? 'green' : type === 'error' ? 'red' : type === 'warning' ? 'yellow' : 'blue'}-100`}
                onclick={`document.getElementById('${id}').remove()`}
              >
                <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};