import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  getReportQueryCache,
  setReportQueryCache,
  clearReportQueryCache,
  REPORT_CACHE_TTL,
} from './reportQueryCache'
import 'fake-indexeddb/auto'

const DB_NAME = 'civic-connect-report-query-cache'

describe('reportQueryCache', () => {
  beforeEach(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
      request.onblocked = resolve
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when no cache exists', async () => {
    expect(await getReportQueryCache('user-1')).toBeNull()
  })

  it('stores and retrieves reports for the same user', async () => {
    const reports = [{ id: 'report-1', title: 'Broken road' }]

    await setReportQueryCache('user-1', reports)

    expect(await getReportQueryCache('user-1')).toEqual(reports)
  })

  it('keeps different users’ reports isolated', async () => {
    await setReportQueryCache('user-1', [{ id: 'private-1' }])
    await setReportQueryCache('user-2', [{ id: 'private-2' }])

    expect(await getReportQueryCache('user-1')).toEqual([{ id: 'private-1' }])
    expect(await getReportQueryCache('user-2')).toEqual([{ id: 'private-2' }])
  })

  it('returns null for expired cache entries', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    await setReportQueryCache('user-1', [{ id: 'report-1' }])

    vi.spyOn(Date, 'now').mockReturnValue(now + REPORT_CACHE_TTL + 1)

    expect(await getReportQueryCache('user-1')).toBeNull()
  })

  it('preserves Firestore timestamps', async () => {
    const timestamp = new Timestamp(100, 500)
    await setReportQueryCache('user-1', [{ id: 'report-1', createdAt: timestamp }])

    const result = await getReportQueryCache('user-1')

    expect(result[0].createdAt).toBeInstanceOf(Timestamp)
    expect(result[0].createdAt.seconds).toBe(100)
    expect(result[0].createdAt.nanoseconds).toBe(500)
  })

  it('clears only the selected user cache', async () => {
    await setReportQueryCache('user-1', [{ id: 'report-1' }])
    await setReportQueryCache('user-2', [{ id: 'report-2' }])

    await clearReportQueryCache('user-1')

    expect(await getReportQueryCache('user-1')).toBeNull()
    expect(await getReportQueryCache('user-2')).toEqual([{ id: 'report-2' }])
  })

  it('ignores missing user IDs and invalid report values', async () => {
    await expect(getReportQueryCache(null)).resolves.toBeNull()
    await expect(setReportQueryCache(null, [{ id: 'report-1' }])).resolves.toBeUndefined()
    await expect(setReportQueryCache('user-1', null)).resolves.toBeUndefined()
    await expect(clearReportQueryCache(null)).resolves.toBeUndefined()
  })
})
