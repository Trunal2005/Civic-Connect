// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolutionChatDrawer } from './ResolutionChatDrawer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  return {
    sendResolutionMessage: vi.fn(async () => ({ id: 'new-msg-1' })),
    subscribeToResolutionChat: vi.fn(),
    markResolutionMessagesAsRead: vi.fn(),
  }
})

vi.mock('@/firebase/resolutionChat', () => ({
  sendResolutionMessage: mocks.sendResolutionMessage,
  subscribeToResolutionChat: mocks.subscribeToResolutionChat,
  markResolutionMessagesAsRead: mocks.markResolutionMessagesAsRead,
  QUICK_ACTION_PROMPTS: {
    officer: [
      { id: 'landmark_request', label: 'Request Landmark', text: 'Can you specify a nearby landmark?' },
      { id: 'worker_onsite', label: 'Worker On-site', text: 'A municipal worker is on-site.' },
    ],
    citizen: [
      { id: 'landmark_clarified', label: 'Landmark Provided', text: 'I provided the landmark.' },
    ],
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('ResolutionChatDrawer', () => {
  let container
  let root
  let mockUnsub

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    mockUnsub = vi.fn()
    mocks.subscribeToResolutionChat.mockImplementation((issueId, onMessages) => {
      onMessages([])
      return mockUnsub
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    container = null
    root = null
    vi.clearAllMocks()
  })

  const mockComplaint = {
    id: 'issue-100',
    complaintId: 'CMP-2026-100',
    title: 'Water Leak on Main St',
    department: 'Water',
    reportedBy: 'citizen-1',
  }

  const mockCitizen = {
    uid: 'citizen-1',
    displayName: 'Aarav Patel',
    role: 'citizen',
  }

  const mockOfficer = {
    uid: 'officer-1',
    displayName: 'Officer Verma',
    role: 'officer',
  }

  it('renders nothing when isOpen is false', () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={false}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })
    expect(container.querySelector('[data-testid="resolution-chat-drawer"]')).toBeNull()
  })

  it('renders drawer header, complaint ID, and encryption indicator when open', () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const drawer = container.querySelector('[data-testid="resolution-chat-drawer"]')
    expect(drawer).not.toBeNull()
    expect(drawer.textContent).toContain('Resolution Channel')
    expect(drawer.textContent).toContain('#CMP-2026-100')
    expect(drawer.textContent).toContain('Water Leak on Main St')
    expect(drawer.textContent).toContain('Encrypted | Contact details protected')
  })

  it('calls onClose when close button or backdrop is clicked', () => {
    const onClose = vi.fn()
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={onClose}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const closeBtn = container.querySelector('button[aria-label="Close resolution chat"]')
    act(() => {
      closeBtn.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = container.querySelector('[data-testid="chat-backdrop"]')
    act(() => {
      backdrop.click()
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders messages and marks unread messages as read', () => {
    mocks.subscribeToResolutionChat.mockImplementation((issueId, onMessages) => {
      onMessages([
        {
          id: 'm1',
          senderId: 'officer-1',
          senderName: 'Officer Verma',
          senderRole: 'officer',
          decryptedContent: 'Can you specify a nearby landmark?',
          quickActionType: 'landmark_request',
          readBy: ['officer-1'],
        },
        {
          id: 'm2',
          senderId: 'citizen-1',
          senderName: 'Aarav Patel',
          senderRole: 'citizen',
          decryptedContent: 'It is opposite the municipal water tank.',
          readBy: ['citizen-1'],
        },
      ])
      return mockUnsub
    })

    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const messages = container.querySelectorAll('[data-testid="chat-message-item"]')
    expect(messages.length).toBe(2)
    expect(container.textContent).toContain('Can you specify a nearby landmark?')
    expect(container.textContent).toContain('It is opposite the municipal water tank.')
    expect(container.querySelector('[data-testid="quick-action-badge"]')).not.toBeNull()

    // Verifies markResolutionMessagesAsRead called for m1
    expect(mocks.markResolutionMessagesAsRead).toHaveBeenCalledWith(
      'CMP-2026-100',
      ['m1'],
      'citizen-1'
    )
  })

  it('sends message when a quick action prompt is clicked', async () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockOfficer}
        />
      )
    })

    const landmarkPromptBtn = container.querySelector('[data-testid="quick-prompt-landmark_request"]')
    expect(landmarkPromptBtn).not.toBeNull()

    await act(async () => {
      landmarkPromptBtn.click()
    })

    expect(mocks.sendResolutionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'CMP-2026-100',
        senderId: 'officer-1',
        senderRole: 'officer',
        content: 'Can you specify a nearby landmark?',
        quickActionType: 'landmark_request',
      })
    )
  })

  it('sends custom message typed into the input', async () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const input = container.querySelector('[data-testid="chat-input"]')
    const sendBtn = container.querySelector('[data-testid="chat-send-btn"]')

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      if (nativeSetter) {
        nativeSetter.call(input, 'We can see the maintenance crew arriving now.')
      } else {
        input.value = 'We can see the maintenance crew arriving now.'
      }
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      sendBtn.click()
    })

    expect(mocks.sendResolutionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'CMP-2026-100',
        senderId: 'citizen-1',
        senderRole: 'citizen',
        content: 'We can see the maintenance crew arriving now.',
      })
    )
  })

  describe('Keyboard Accessibility (Issue #304)', () => {
    it('invokes onClose when Escape key is pressed while drawer is open', () => {
      const onClose = vi.fn()
      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={true}
            onClose={onClose}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not invoke onClose on Escape when drawer is closed', () => {
      const onClose = vi.fn()
      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={false}
            onClose={onClose}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(onClose).not.toHaveBeenCalled()
    })

    it('moves initial focus inside the drawer when opened', async () => {
      vi.useFakeTimers()
      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={true}
            onClose={vi.fn()}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      act(() => {
        vi.runAllTimers()
      })

      const drawer = container.querySelector('[data-testid="resolution-chat-drawer"]')
      const input = container.querySelector('[data-testid="chat-input"]')
      expect(drawer.contains(document.activeElement)).toBe(true)
      expect(document.activeElement).toBe(input)
      vi.useRealTimers()
    })

    it('wraps focus to first element when Tab is pressed on last element', () => {
      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={true}
            onClose={vi.fn()}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      const drawer = container.querySelector('[data-testid="resolution-chat-drawer"]')
      const focusable = drawer.querySelectorAll('button:not([disabled]), input:not([disabled])')
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]

      lastEl.focus()
      expect(document.activeElement).toBe(lastEl)

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true, cancelable: true })
      window.dispatchEvent(tabEvent)

      expect(tabEvent.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(firstEl)
    })

    it('wraps focus to last element when Shift+Tab is pressed on first element', () => {
      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={true}
            onClose={vi.fn()}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      const drawer = container.querySelector('[data-testid="resolution-chat-drawer"]')
      const focusable = drawer.querySelectorAll('button:not([disabled]), input:not([disabled])')
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]

      firstEl.focus()
      expect(document.activeElement).toBe(firstEl)

      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
      window.dispatchEvent(shiftTabEvent)

      expect(shiftTabEvent.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(lastEl)
    })

    it('prevents focus from escaping to outside element during Tab navigation', () => {
      const outsideButton = document.createElement('button')
      outsideButton.textContent = 'Outside Trigger'
      document.body.appendChild(outsideButton)

      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={true}
            onClose={vi.fn()}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      const drawer = container.querySelector('[data-testid="resolution-chat-drawer"]')
      const focusable = drawer.querySelectorAll('button:not([disabled]), input:not([disabled])')
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]

      // If activeElement is outside drawer, forward Tab should move to first element
      outsideButton.focus()
      expect(document.activeElement).toBe(outsideButton)

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, bubbles: true, cancelable: true })
      window.dispatchEvent(tabEvent)
      expect(tabEvent.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(firstEl)

      // If activeElement is outside drawer, Shift+Tab should move to last element
      outsideButton.focus()
      expect(document.activeElement).toBe(outsideButton)

      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
      window.dispatchEvent(shiftTabEvent)
      expect(shiftTabEvent.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(lastEl)

      outsideButton.remove()
    })

    it('restores focus to previously active trigger element upon closing', () => {
      const triggerButton = document.createElement('button')
      triggerButton.textContent = 'Open Chat'
      document.body.appendChild(triggerButton)
      triggerButton.focus()
      expect(document.activeElement).toBe(triggerButton)

      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={true}
            onClose={vi.fn()}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      // Now close the drawer
      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={false}
            onClose={vi.fn()}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      expect(document.activeElement).toBe(triggerButton)
      triggerButton.remove()
    })

    it('restores focus after Escape dismissal', () => {
      const triggerButton = document.createElement('button')
      triggerButton.textContent = 'Open Chat'
      document.body.appendChild(triggerButton)
      triggerButton.focus()
      expect(document.activeElement).toBe(triggerButton)

      let isOpen = true
      const onClose = vi.fn(() => {
        isOpen = false
        act(() => {
          root.render(
            <ResolutionChatDrawer
              isOpen={isOpen}
              onClose={onClose}
              complaint={mockComplaint}
              currentUser={mockCitizen}
            />
          )
        })
      })

      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={isOpen}
            onClose={onClose}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(triggerButton)

      triggerButton.remove()
    })

    it('close button includes the required visible focus classes', () => {
      act(() => {
        root.render(
          <ResolutionChatDrawer
            isOpen={true}
            onClose={vi.fn()}
            complaint={mockComplaint}
            currentUser={mockCitizen}
          />
        )
      })

      const closeBtn = container.querySelector('button[aria-label="Close resolution chat"]')
      expect(closeBtn.className).toContain('focus-visible:outline-none')
      expect(closeBtn.className).toContain('focus-visible:ring-2')
      expect(closeBtn.className).toContain('focus-visible:ring-primary-500')
      expect(closeBtn.className).toContain('focus-visible:ring-offset-2')
    })
  })
})
