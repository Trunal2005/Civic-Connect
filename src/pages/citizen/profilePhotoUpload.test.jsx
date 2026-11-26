// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProfilePage } from './ProfilePage'
import { Navbar } from '@/components/layout/Navbar'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { MAX_PROFILE_PHOTO_SIZE_BYTES } from '@/firebase/storage'

const mockUpdateUserProfile = vi.fn()
const mockUploadProfilePhoto = vi.fn()
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()

const authState = {
  user: {
    uid: 'citizen-42',
    name: 'Sara Connor',
    email: 'sara@example.com',
    role: 'citizen',
    photoURL: null,
  },
  logout: vi.fn(),
  updateUserProfile: mockUpdateUserProfile,
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/contexts/SpotlightContext', () => ({
  useSpotlightSearch: () => ({ openSearch: vi.fn() }),
}))

vi.mock('@/components/common/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  storage: {},
}))

vi.mock('@/firebase/storage', async () => {
  const actual = await vi.importActual('@/firebase/storage')
  return {
    ...actual,
    uploadProfilePhoto: (...args) => mockUploadProfilePhoto(...args),
  }
})

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
}))

vi.mock('@/firebase/notifications', () => ({
  getPushPermissionStatus: () => 'default',
  requestPushPermission: vi.fn(),
  showNativeNotification: vi.fn(),
}))

vi.mock('@/firebase/notificationPreferences', () => ({
  DEFAULT_NOTIFICATION_PREFERENCES: { sound: true, push: false, emailDigest: false },
  loadNotificationPreferences: vi.fn(() =>
    Promise.resolve({ sound: true, push: false, emailDigest: false })
  ),
  saveNotificationPreferences: vi.fn(),
}))

vi.mock('@/hooks/useCivicGamification', () => ({
  useCivicGamification: () => ({
    badges: [],
    score: null,
    level: { title: 'Civic Explorer' },
    stats: {},
    leaderboard: [],
    currentUserRank: null,
    loading: false,
  }),
}))

vi.mock('@/components/citizen/BadgesShowcaseCard', () => ({
  BadgesShowcaseCard: () => <div data-testid="badges-card" />,
}))

vi.mock('@/components/citizen/CivicChampionLeaderboardCard', () => ({
  CivicChampionLeaderboardCard: () => <div data-testid="leaderboard-card" />,
}))

vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), {
    error: (...args) => mockToastError(...args),
    success: (...args) => mockToastSuccess(...args),
  })
  return { default: fn }
})

let container = null
let root = null

async function renderComponent(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<LanguageProvider>{element}</LanguageProvider>)
  })
}

function cleanupComponent() {
  if (root) {
    act(() => {
      root.unmount()
    })
    root = null
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
    container = null
  }
}

function triggerFileSelect(input, file) {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('Profile photo upload & avatar rendering (CC-011)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = {
      uid: 'citizen-42',
      name: 'Sara Connor',
      email: 'sara@example.com',
      role: 'citizen',
      photoURL: null,
    }
    mockUpdateUserProfile.mockImplementation(async (updates) => {
      authState.user = { ...authState.user, ...updates }
    })
  })

  afterEach(() => {
    cleanupComponent()
  })

  it('shows user initials when no photoURL is set and opens file picker on button click', async () => {
    await renderComponent(<ProfilePage />)

    expect(container.textContent).toContain('SC')
    expect(container.querySelector('img')).toBeNull()

    const fileInput = container.querySelector('input[type="file"]')
    expect(fileInput).not.toBeNull()
    expect(fileInput.getAttribute('accept')).toBe('image/png,image/jpeg,image/webp')

    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {})
    const uploadBtn = container.querySelector('button[aria-label="Upload profile photo"]')
    expect(uploadBtn).not.toBeNull()

    await act(async () => {
      uploadBtn.click()
    })
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid file types with a toast error and skips upload', async () => {
    await renderComponent(<ProfilePage />)

    const fileInput = container.querySelector('input[type="file"]')
    const gifFile = new File(['GIF89a'], 'avatar.gif', { type: 'image/gif' })

    await act(async () => {
      triggerFileSelect(fileInput, gifFile)
    })

    expect(mockToastError).toHaveBeenCalledWith(
      'Invalid file format. Only PNG, JPEG, and WebP images are supported.'
    )
    expect(mockUploadProfilePhoto).not.toHaveBeenCalled()
    expect(mockUpdateUserProfile).not.toHaveBeenCalled()
  })

  it('rejects files exceeding 2MB with a toast error and skips upload', async () => {
    await renderComponent(<ProfilePage />)

    const fileInput = container.querySelector('input[type="file"]')
    const hugeFile = new File(
      [new Uint8Array(MAX_PROFILE_PHOTO_SIZE_BYTES + 1)],
      'huge.png',
      { type: 'image/png' }
    )

    await act(async () => {
      triggerFileSelect(fileInput, hugeFile)
    })

    expect(mockToastError).toHaveBeenCalledWith(
      'File size exceeds 2MB limit. Please select a smaller photo.'
    )
    expect(mockUploadProfilePhoto).not.toHaveBeenCalled()
    expect(mockUpdateUserProfile).not.toHaveBeenCalled()
  })

  it('uploads valid image, shows loading/preview state, persists photoURL, and renders photo', async () => {
    let resolveUpload
    mockUploadProfilePhoto.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve
        })
    )

    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    const createObjectURLSpy = vi.fn(() => 'blob:preview-avatar')
    const revokeObjectURLSpy = vi.fn()
    URL.createObjectURL = createObjectURLSpy
    URL.revokeObjectURL = revokeObjectURLSpy

    try {
      await renderComponent(<ProfilePage />)

      const fileInput = container.querySelector('input[type="file"]')
      const validFile = new File(['png-data'], 'avatar.png', { type: 'image/png' })

      await act(async () => {
        triggerFileSelect(fileInput, validFile)
      })

      // Preview image and loading state are visible while upload is pending
      const uploadBtn = container.querySelector('button[aria-label="Upload profile photo"]')
      expect(uploadBtn.disabled).toBe(true)
      expect(uploadBtn.getAttribute('aria-busy')).toBe('true')
      expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:preview-avatar')

      const uploadedUrl = 'https://storage.googleapis.com/test-bucket/profile-photos/citizen-42/avatar.png'
      await act(async () => {
        resolveUpload({
          downloadUrl: uploadedUrl,
          path: 'profile-photos/citizen-42/123-avatar.png',
          filename: '123-avatar.png',
        })
      })

      expect(mockUploadProfilePhoto).toHaveBeenCalledWith(validFile, 'citizen-42')
      expect(mockUpdateUserProfile).toHaveBeenCalledWith({ photoURL: uploadedUrl })
      expect(mockToastSuccess).toHaveBeenCalledWith('Profile photo updated successfully!')
      expect(uploadBtn.disabled).toBe(false)
      expect(container.querySelector('img')?.getAttribute('src')).toBe(uploadedUrl)
      expect(createObjectURLSpy).toHaveBeenCalledWith(validFile)
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:preview-avatar')
    } finally {
      URL.createObjectURL = origCreateObjectURL
      URL.revokeObjectURL = origRevokeObjectURL
    }
  })

  it('shows error toast and reverts to initials if upload fails', async () => {
    mockUploadProfilePhoto.mockRejectedValueOnce(new Error('Storage error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderComponent(<ProfilePage />)

    const fileInput = container.querySelector('input[type="file"]')
    const validFile = new File(['webp-data'], 'avatar.webp', { type: 'image/webp' })

    await act(async () => {
      triggerFileSelect(fileInput, validFile)
    })

    expect(mockToastError).toHaveBeenCalledWith(
      'Failed to upload profile photo. Please try again.'
    )
    expect(mockUpdateUserProfile).not.toHaveBeenCalled()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('SC')
    consoleSpy.mockRestore()
  })

  it('renders uploaded photo in Navbar and falls back to initials when missing or broken', async () => {
    await renderComponent(<Navbar onMenuClick={vi.fn()} />)
    expect(container.textContent).toContain('SC')
    expect(container.querySelector('img')).toBeNull()

    cleanupComponent()

    authState.user = {
      ...authState.user,
      photoURL: 'https://storage.googleapis.com/test-bucket/profile-photos/citizen-42/avatar.jpg',
    }
    await renderComponent(<Navbar onMenuClick={vi.fn()} />)

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe(
      'https://storage.googleapis.com/test-bucket/profile-photos/citizen-42/avatar.jpg'
    )

    // Broken image URL falls back cleanly to user initials
    await act(async () => {
      img.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('SC')
  })
})
