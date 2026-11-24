import { Timestamp } from 'firebase/firestore'

const DB_NAME = 'civic-connect-report-query-cache'
const DB_VERSION = 1
const STORE_NAME = 'report-queries'
export const REPORT_CACHE_TTL = 10 * 60 * 1000

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function serialize(value) {
  if (value instanceof Timestamp) {
    return {
      __cacheType: 'timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    }
  }

  if (Array.isArray(value)) {
    return value.map(serialize)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)])
    )
  }

  return value
}

function deserialize(value) {
  if (Array.isArray(value)) {
    return value.map(deserialize)
  }

  if (value && typeof value === 'object') {
    if (value.__cacheType === 'timestamp') {
      return new Timestamp(value.seconds, value.nanoseconds)
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deserialize(item)])
    )
  }

  return value
}

function createCacheKey(userId) {
  return `${userId}:my-reports:v1`
}

export async function getReportQueryCache(userId) {
  if (!userId) return null

  const db = await openDatabase()

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(
        createCacheKey(userId)
      )

      request.onsuccess = () => {
        const record = request.result

        if (!record || record.userId !== userId) {
          resolve(null)
          return
        }

        if (Date.now() - record.cachedAt >= REPORT_CACHE_TTL) {
          resolve(null)
          return
        }

        resolve(deserialize(record.data))
      }

      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function setReportQueryCache(userId, reports) {
  if (!userId || !Array.isArray(reports)) return

  const db = await openDatabase()

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')

      transaction.objectStore(STORE_NAME).put({
        cacheKey: createCacheKey(userId),
        userId,
        data: serialize(reports),
        cachedAt: Date.now(),
      })

      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

export async function clearReportQueryCache(userId) {
  if (!userId) return

  const db = await openDatabase()

  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')

      transaction.objectStore(STORE_NAME).delete(createCacheKey(userId))

      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}
