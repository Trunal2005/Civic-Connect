import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import {
  ComplaintTicket,
  PriorityBadge,
  ComplaintProgress,
  ElapsedTime,
  ComplaintShareButton,
} from './ComplaintTicket'

const t = (key) => key
afterEach(() => {
  cleanup()
})

describe('ComplaintTicket', () => {
  it('displays the complaint tracking ID', () => {
    render(
      <ComplaintTicket
        complaint={{ complaintId: 'CMP-2026-1234' }}
      >
        <p>Road damage</p>
      </ComplaintTicket>
    )

    expect(screen.getByText('CMP-2026-1234')).toBeInTheDocument()
    expect(screen.getByText('Road damage')).toBeInTheDocument()
  })

  it('displays the priority label', () => {
    render(
      <ComplaintTicket
        complaint={{
          complaintId: 'CMP-2026-1234',
          priority: 'High',
        }}
        priorityLabel="High"
      />
    )

    expect(screen.getByText('High')).toBeInTheDocument()
  })
})

describe('PriorityBadge', () => {
  it.each(['Critical', 'High', 'Medium', 'Low'])(
    'renders %s priority',
    (priority) => {
      render(<PriorityBadge priority={priority} />)

      expect(screen.getByText(priority)).toBeInTheDocument()
    }
  )

  it('supports lowercase priority values', () => {
    render(<PriorityBadge priority="high" label="High" />)

    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('supports translated labels', () => {
    render(<PriorityBadge priority="High" label="उच्च" />)

    expect(screen.getByText('उच्च')).toBeInTheDocument()
  })

  it('does not render an unknown priority', () => {
    const { container } = render(
      <PriorityBadge priority="Unknown" />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('does not render a missing priority', () => {
    const { container } = render(<PriorityBadge />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('ComplaintProgress', () => {
  it.each([
    ['Pending', 'statusPending'],
    ['In Progress', 'statusInProgress'],
    ['Resolved', 'statusResolved'],
  ])('marks %s as the current step', (status, label) => {
    render(<ComplaintProgress status={status} t={t} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    expect(
      screen.getByText(label).closest('li')
    ).toHaveAttribute('aria-current', 'step')
  })

  it('does not show misleading progress for rejected complaints', () => {
    const { container } = render(
      <ComplaintProgress status="Rejected" t={t} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('does not show linear progress for reopened complaints', () => {
    const { container } = render(
      <ComplaintProgress status="Reopened" t={t} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})

describe('ElapsedTime', () => {
  it('displays elapsed time from a Firestore timestamp', () => {
    const createdAt = {
      toDate: () => new Date(Date.now() - 2 * 3600000),
    }

    render(<ElapsedTime createdAt={createdAt} />)

    expect(screen.getByText('2 hours ago')).toBeInTheDocument()
  })

  it('supports timestamps containing seconds', () => {
    const createdAt = {
      seconds: Math.floor(Date.now() / 1000) - 3600,
    }

    render(<ElapsedTime createdAt={createdAt} />)

    expect(screen.getByText('1 hour ago')).toBeInTheDocument()
  })

  it('handles missing timestamps', () => {
    const { container } = render(<ElapsedTime />)

    expect(container).toBeEmptyDOMElement()
  })

  it('handles invalid timestamps', () => {
    const { container } = render(
      <ElapsedTime createdAt={{ toDate: () => new Date(NaN) }} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})

describe('ComplaintShareButton', () => {
  it('renders an accessible share button', () => {
    render(
      <ComplaintShareButton label="Share" onShare={vi.fn()} />
    )

    expect(
      screen.getByRole('button', { name: 'Share' })
    ).toBeInTheDocument()
  })

  it('calls the share handler when clicked', () => {
    const onShare = vi.fn()

    render(
      <ComplaintShareButton label="Share" onShare={onShare} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(onShare).toHaveBeenCalledTimes(1)
  })
})