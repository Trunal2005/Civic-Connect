// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WardHealthScorecard } from './WardHealthScorecard'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (typeof globalThis.URL.createObjectURL !== 'function') {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
  globalThis.URL.revokeObjectURL = vi.fn()
}

const storageMap = new Map()
const mockLocalStorage = {
  getItem: (key) => storageMap.get(key) || null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
}
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  })
} catch {
  globalThis.localStorage = mockLocalStorage
}

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Polygon: ({ children, positions, pathOptions, eventHandlers }) => (
    <div
      data-testid="heatmap-ward-polygon"
      data-positions={JSON.stringify(positions)}
      data-pathoptions={JSON.stringify(pathOptions)}
      onClick={eventHandlers?.click}
    >
      {children}
    </div>
  ),
  Tooltip: ({ children }) => <div data-testid="map-tooltip">{children}</div>,
  Popup: ({ children }) => <div data-testid="map-popup">{children}</div>,
  Marker: ({ children }) => <div data-testid="map-marker">{children}</div>,
}))

vi.mock('@/utils/wardScorecardPdf', () => ({
  downloadWardScorecardsPdf: vi.fn(),
  generateWardScorecardsPdf: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('WardHealthScorecard Component', () => {
  let container
  let root

  const mockComplaints = [
    {
      id: 'c1',
      wardId: 'WARD-01',
      category: 'Potholes & Road Damage',
      status: 'Resolved',
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      resolvedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000),
      feedback: { rating: 5 },
    },
    {
      id: 'c2',
      wardId: 'WARD-02',
      category: 'Water Leakage',
      status: 'Pending',
      createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    container = null
    root = null
  })

  it('renders executive KPI summary metrics', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    expect(container.textContent).toContain('Municipal Health Score')
    expect(container.textContent).toContain('Avg Resolution Time (ART)')
    expect(container.textContent).toContain('SLA Compliance Rate')
    expect(container.textContent).toContain('Citizen Satisfaction (CSI)')
  })

  it('renders interactive filter controls and allows time window filtering', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    const timeSelect = container.querySelector('[data-testid="filter-time-window"]')
    expect(timeSelect).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(timeSelect, '30')
      timeSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(timeSelect.value).toBe('30')

    const categorySelect = container.querySelector('[data-testid="filter-category"]')
    expect(categorySelect).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(categorySelect, 'Water Leakage')
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(categorySelect.value).toBe('Water Leakage')
  })

  it('renders predictive heatmap canvas and scorecards for wards', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    expect(container.querySelector('[data-testid="predictive-heatmap-canvas"]')).not.toBeNull()

    const cards = container.querySelectorAll('[data-testid="ward-scorecard-card"]')
    expect(cards.length).toBeGreaterThanOrEqual(1)
  })

  it('triggers CSV and PDF export handlers when clicked', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    const csvBtn = container.querySelector('[data-testid="export-scorecards-csv-btn"]')
    expect(csvBtn).not.toBeNull()

    await act(async () => {
      csvBtn.click()
    })

    const pdfBtn = container.querySelector('[data-testid="export-scorecards-pdf-btn"]')
    expect(pdfBtn).not.toBeNull()

    await act(async () => {
      pdfBtn.click()
    })

    expect(container.textContent).toContain('Municipal Health Score')
  })

  describe('Filter Toolbar Accessibility and Reset Functionality (Issue #307)', () => {
    it('associates filter labels with select elements and provides descriptive aria-labels', async () => {
      await act(async () => {
        root.render(<WardHealthScorecard complaints={mockComplaints} />)
      })

      // Time Window
      const timeSelect = container.querySelector('#filter-time-window')
      const timeLabel = container.querySelector('label[for="filter-time-window"]')
      expect(timeSelect).not.toBeNull()
      expect(timeLabel).not.toBeNull()
      expect(timeSelect.getAttribute('data-testid')).toBe('filter-time-window')
      expect(timeSelect.getAttribute('aria-label')).toBe('Filter by time window')

      // Category
      const categorySelect = container.querySelector('#filter-category')
      const categoryLabel = container.querySelector('label[for="filter-category"]')
      expect(categorySelect).not.toBeNull()
      expect(categoryLabel).not.toBeNull()
      expect(categorySelect.getAttribute('data-testid')).toBe('filter-category')
      expect(categorySelect.getAttribute('aria-label')).toBe('Filter by category')

      // Resolution Speed
      const speedSelect = container.querySelector('#filter-resolution-speed')
      const speedLabel = container.querySelector('label[for="filter-resolution-speed"]')
      expect(speedSelect).not.toBeNull()
      expect(speedLabel).not.toBeNull()
      expect(speedSelect.getAttribute('data-testid')).toBe('filter-resolution-speed')
      expect(speedSelect.getAttribute('aria-label')).toBe('Filter by resolution speed')
    })

    it('keeps the Reset button hidden when all filters are at their default values', async () => {
      await act(async () => {
        root.render(<WardHealthScorecard complaints={mockComplaints} />)
      })

      const timeSelect = container.querySelector('#filter-time-window')
      const categorySelect = container.querySelector('#filter-category')
      const speedSelect = container.querySelector('#filter-resolution-speed')

      // Reset filters to defaults: all, All, all
      await act(async () => {
        const timeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        timeSetter.call(timeSelect, 'all')
        timeSelect.dispatchEvent(new Event('change', { bubbles: true }))

        const catSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        catSetter.call(categorySelect, 'All')
        categorySelect.dispatchEvent(new Event('change', { bubbles: true }))

        const speedSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        speedSetter.call(speedSelect, 'all')
        speedSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(timeSelect.value).toBe('all')
      expect(categorySelect.value).toBe('All')
      expect(speedSelect.value).toBe('all')

      const resetBtn = container.querySelector('[data-testid="filter-reset-btn"]')
      expect(resetBtn).toBeNull()
    })

    it('displays the Reset button when any filter is changed from its default value', async () => {
      await act(async () => {
        root.render(<WardHealthScorecard complaints={mockComplaints} />)
      })

      const timeSelect = container.querySelector('#filter-time-window')
      const categorySelect = container.querySelector('#filter-category')
      const speedSelect = container.querySelector('#filter-resolution-speed')

      // 1. Change time window only (from 'all' default)
      await act(async () => {
        const timeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        timeSetter.call(timeSelect, 'all')
        timeSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="filter-reset-btn"]')).toBeNull()

      await act(async () => {
        const timeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        timeSetter.call(timeSelect, '30')
        timeSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="filter-reset-btn"]')).not.toBeNull()

      // Reset time window back to 'all'
      await act(async () => {
        const timeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        timeSetter.call(timeSelect, 'all')
        timeSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="filter-reset-btn"]')).toBeNull()

      // 2. Change category only
      await act(async () => {
        const catSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        catSetter.call(categorySelect, 'Water Leakage')
        categorySelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="filter-reset-btn"]')).not.toBeNull()

      // Reset category back to 'All'
      await act(async () => {
        const catSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        catSetter.call(categorySelect, 'All')
        categorySelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="filter-reset-btn"]')).toBeNull()

      // 3. Change resolution speed only
      await act(async () => {
        const speedSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        speedSetter.call(speedSelect, 'fast')
        speedSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="filter-reset-btn"]')).not.toBeNull()
    })

    it('restores all filters to defaults and hides the Reset button upon clicking Reset', async () => {
      await act(async () => {
        root.render(<WardHealthScorecard complaints={mockComplaints} />)
      })

      const timeSelect = container.querySelector('#filter-time-window')
      const categorySelect = container.querySelector('#filter-category')
      const speedSelect = container.querySelector('#filter-resolution-speed')

      // Change all three to non-defaults
      await act(async () => {
        const timeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        timeSetter.call(timeSelect, '365')
        timeSelect.dispatchEvent(new Event('change', { bubbles: true }))

        const catSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        catSetter.call(categorySelect, 'Water Leakage')
        categorySelect.dispatchEvent(new Event('change', { bubbles: true }))

        const speedSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        speedSetter.call(speedSelect, 'slow')
        speedSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(timeSelect.value).toBe('365')
      expect(categorySelect.value).toBe('Water Leakage')
      expect(speedSelect.value).toBe('slow')

      const resetBtn = container.querySelector('[data-testid="filter-reset-btn"]')
      expect(resetBtn).not.toBeNull()

      await act(async () => {
        resetBtn.click()
      })

      // Verify all restored to defaults
      expect(timeSelect.value).toBe('all')
      expect(categorySelect.value).toBe('All')
      expect(speedSelect.value).toBe('all')

      // Verify Reset button disappears
      expect(container.querySelector('[data-testid="filter-reset-btn"]')).toBeNull()
    })

    it('verifies accessibility attributes on the Reset button', async () => {
      await act(async () => {
        root.render(<WardHealthScorecard complaints={mockComplaints} />)
      })

      // Default timeWindow is '90', so Reset button is visible initially
      const resetBtn = container.querySelector('[data-testid="filter-reset-btn"]')
      expect(resetBtn).not.toBeNull()
      expect(resetBtn.getAttribute('aria-label')).toBe('Reset analytics filters')
      expect(resetBtn.getAttribute('type')).toBe('button')
    })
  })
})
