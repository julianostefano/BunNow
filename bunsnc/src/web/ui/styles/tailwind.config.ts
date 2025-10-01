/**
 * Tailwind CSS v4 Configuration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import type { Config } from 'tailwindcss'

export default {
  content: ['./src/web/ui/**/*.{ts,html,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base - Dark Professional (Corporate Clean)
        'bg-primary': '#0a0f1a',
        'bg-secondary': '#13192b',
        'bg-tertiary': '#1c2438',
        'bg-panel': 'rgba(20, 27, 45, 0.85)',

        // Status Colors (No emojis - professional)
        'status-new': '#3b82f6',
        'status-progress': '#f59e0b',
        'status-resolved': '#10b981',
        'status-critical': '#ef4444',
        'status-waiting': '#f97316',
        'status-closed': '#6b7280',

        // Text
        'text-primary': '#e5e7eb',
        'text-secondary': '#9ca3af',
        'text-muted': '#6b7280',

        // Accents
        'accent-primary': '#3b82f6',
        'accent-success': '#10b981',
        'accent-warning': '#f59e0b',
        'accent-danger': '#ef4444',
      },
      backdropBlur: {
        'xs': '4px',
        'panel': '24px',
        'search': '16px',
        'modal': '12px',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 300ms ease-out',
        'slide-out': 'slideOut 300ms ease-in',
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-out': 'fadeOut 200ms ease-in',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideOut: {
          '0%': { transform: 'translateX(0)', opacity: '1' },
          '100%': { transform: 'translateX(-100%)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      boxShadow: {
        'panel': '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 80px rgba(59, 130, 246, 0.1)',
        'card': '0 4px 12px rgba(0, 0, 0, 0.3)',
        'modal': '0 25px 50px rgba(0, 0, 0, 0.7)',
      },
      zIndex: {
        'panel': '1000',
        'search': '900',
        'modal': '1100',
        'menu': '950',
      },
    },
  },
  plugins: [],
} satisfies Config
