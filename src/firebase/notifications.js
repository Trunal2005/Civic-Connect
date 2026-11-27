import {
  collection, collectionGroup, addDoc, doc, query, where, onSnapshot,
  serverTimestamp, updateDoc, writeBatch, runTransaction,
} from 'firebase/firestore'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import app, { db } from './services'
import firebaseConfig from './config'

function buildNotification({
  recipientUid = null,
  recipientRole,
  senderUid,
  issueId,
  type,
  title,
  message,
  priority,
}) {
  return {
    recipientUid,
    recipientRole,
    senderUid,
    issueId,
    type,
    title,
    message,
    read: false,
    createdAt: serverTimestamp(),
    ...(priority ? { priority } : {}),
  }
}

export async function createNotification(fields) {
  await addDoc(collection(db, 'notifications'), buildNotification(fields))
}

// Queues the notification on an existing writeBatch so it commits atomically with the caller's other writes.
export function addNotificationToBatch(batch, fields, customDb = db) {
  batch.set(doc(collection(customDb, 'notifications')), buildNotification(fields))
}

export async function markNotificationAsRead(notificationId, read = true, customDb = db) {
  if (!notificationId) return
  await updateDoc(doc(customDb, 'notifications', notificationId), { read })
}

export async function markAllNotificationsAsRead(notificationIds, customDb = db) {
  if (!Array.isArray(notificationIds) || notificationIds.length === 0) return
  try {
    const batch = writeBatch(customDb)
    notificationIds.forEach((id) => {
      batch.update(doc(customDb, 'notifications', id), { read: true })
    })
    await batch.commit()
  } catch (err) {
    console.warn('Batch mark all read failed, attempting individual updates:', err)
    await Promise.allSettled(
      notificationIds.map((id) =>
        updateDoc(doc(customDb, 'notifications', id), { read: true })
      )
    )
  }
}

const receiptRef = (customDb, notificationId, adminUid) =>
  doc(customDb, 'notifications', notificationId, 'receipts', adminUid)

export function applyAdminReceipts(notifications, receipts) {
  return notifications.map((notification) => {
    const receipt = receipts[notification.id]
    return {
      ...notification,
      read: Boolean(receipt?.readAt),
      acknowledgedAt: receipt?.acknowledgedAt ?? null,
      acknowledgedBy: receipt?.acknowledgedBy ?? null,
    }
  })
}

export function subscribeAdminReceipts(adminUid, onReceipts, onError, customDb = db) {
  if (!adminUid) return () => {}
  const receiptsQuery = query(
    collectionGroup(customDb, 'receipts'),
    where('adminUid', '==', adminUid)
  )
  return onSnapshot(receiptsQuery, (snapshot) => {
    const receipts = {}
    snapshot.docs.forEach((receipt) => {
      const notificationId = receipt.ref.parent.parent?.id
      if (notificationId) receipts[notificationId] = receipt.data()
    })
    onReceipts(receipts)
  }, onError)
}

export async function markAdminNotificationsAsRead(notificationIds, adminUid, customDb = db) {
  if (!adminUid || !Array.isArray(notificationIds) || notificationIds.length === 0) return
  // Firestore batches permit at most 500 writes; leave room for future metadata.
  for (let i = 0; i < notificationIds.length; i += 400) {
    const batch = writeBatch(customDb)
    notificationIds.slice(i, i + 400).forEach((id) => {
      batch.set(receiptRef(customDb, id, adminUid), {
        adminUid,
        readAt: serverTimestamp(),
      }, { merge: true })
    })
    await batch.commit()
  }
}

export async function acknowledgeAdminNotification(notificationId, adminUid, customDb = db) {
  if (!notificationId || !adminUid) return
  const ref = receiptRef(customDb, notificationId, adminUid)
  await runTransaction(customDb, async (transaction) => {
    const existing = await transaction.get(ref)
    if (existing.exists() && existing.data().acknowledgedAt) return
    transaction.set(ref, {
      adminUid,
      readAt: serverTimestamp(),
      acknowledgedAt: serverTimestamp(),
      acknowledgedBy: adminUid,
    }, { merge: true })
  })
}

let messagingPromise = null

export function _resetMessagingInstanceForTests() {
  messagingPromise = null
}

export async function getMessagingService() {
  if (typeof window === 'undefined' && typeof self === 'undefined') return null
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => {
        if (!supported) return null
        return getMessaging(app)
      })
      .catch(() => null)
  }
  return messagingPromise
}

export function getPushPermissionStatus() {
  if (typeof Notification === 'undefined') {
    return 'unsupported'
  }
  return Notification.permission
}

export function showNativeNotification({ title, message, url, issueId }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return null
  }

  const targetUrl = url || (issueId ? `/complaints/${issueId}` : '/notifications')
  try {
    const notification = new Notification(title || 'Civic-Connect Update', {
      body: message || 'Your complaint status has been updated.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: targetUrl, issueId },
    })

    notification.onclick = (event) => {
      event.preventDefault()
      if (typeof window !== 'undefined') {
        window.focus?.()
        if (window.location && window.location.pathname !== targetUrl) {
          window.location.href = targetUrl
        }
      }
      notification.close()
    }

    return notification
  } catch (err) {
    console.warn('Native notification failed:', err)
    return null
  }
}

export async function requestPushPermission(userUid) {
  if (typeof Notification === 'undefined') {
    return { status: 'unsupported' }
  }

  try {
    let currentPermission = Notification.permission
    if (currentPermission === 'default') {
      currentPermission = await Notification.requestPermission()
    }

    if (currentPermission !== 'granted') {
      return { status: currentPermission }
    }

    const messaging = await getMessagingService()
    if (!messaging) {
      return { status: 'unsupported' }
    }

    let registration = undefined
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const swParams = new URLSearchParams()
      if (firebaseConfig.messagingSenderId) swParams.set('messagingSenderId', firebaseConfig.messagingSenderId)
      if (firebaseConfig.projectId) swParams.set('projectId', firebaseConfig.projectId)
      if (firebaseConfig.appId) swParams.set('appId', firebaseConfig.appId)
      if (firebaseConfig.apiKey) swParams.set('apiKey', firebaseConfig.apiKey)

      const queryStr = swParams.toString()
      const swUrl = queryStr ? `/firebase-messaging-sw.js?${queryStr}` : '/firebase-messaging-sw.js'
      registration = await navigator.serviceWorker.register(swUrl)
    }

    const vapidKey = import.meta.env?.VITE_FIREBASE_VAPID_KEY
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      ...(vapidKey ? { vapidKey } : {}),
    })

    if (token && userUid) {
      await updateDoc(doc(db, 'users', userUid), {
        fcmToken: token,
        pushNotificationsEnabled: true,
        updatedAt: serverTimestamp(),
      })
    }

    return { status: 'granted', token }
  } catch (err) {
    console.error('Error enabling push notifications:', err)
    return { status: 'error', error: err }
  }
}

export async function setupForegroundNotificationListener(onNotification) {
  const messaging = await getMessagingService()
  if (!messaging) return () => {}

  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Civic-Connect Notification'
    const message = payload.notification?.body || payload.data?.message || 'New update received'
    const issueId = payload.data?.issueId || payload.data?.complaintId || ''
    const url = payload.data?.url || (issueId ? `/complaints/${issueId}` : '/notifications')

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      showNativeNotification({ title, message, url, issueId })
    }

    if (typeof onNotification === 'function') {
      onNotification({ title, message, url, issueId, payload })
    }
  })
}
