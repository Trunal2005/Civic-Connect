
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  limit,
} from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useLanguage } from '@/contexts/LanguageContext'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { formatRelativeTime } from '@/utils/relativeTime'
import { useAuth } from '@/hooks/useAuth'
import {
  applyAdminReceipts,
  subscribeAdminReceipts,
  markAdminNotificationsAsRead,
  acknowledgeAdminNotification,
} from '@/firebase/notifications'

function sortByCreatedDesc(list) {
  return [...list].sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime() || 0
    const tb = b.createdAt?.toDate?.()?.getTime() || 0
    return tb - ta
  })
}

export function AdminNotificationsPage() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()

  const [rawNotifications, setRawNotifications] = useState([])
  const [receipts, setReceipts] = useState({})
  const [receiptsReady, setReceiptsReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const pendingReads = useRef(new Set())
  const notifications = useMemo(() => applyAdminReceipts(rawNotifications, receipts), [rawNotifications, receipts])

  useEffect(() => {
    if (!user?.uid) return undefined
    return subscribeAdminReceipts(user.uid, (nextReceipts) => {
      setReceipts(nextReceipts)
      setReceiptsReady(true)
    }, (error) => console.error('Admin notification receipts error:', error))
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid || !receiptsReady || loading) return
    const unreadIds = notifications
      .filter((n) => !n.read && !pendingReads.current.has(n.id))
      .map((n) => n.id)
    if (unreadIds.length === 0) return
    unreadIds.forEach((id) => pendingReads.current.add(id))
    markAdminNotificationsAsRead(unreadIds, user.uid).catch((error) => {
      unreadIds.forEach((id) => pendingReads.current.delete(id))
      console.error('Unable to mark admin notifications as read:', error)
    })
  }, [notifications, receiptsReady, loading, user?.uid])

  const handleAcknowledge = async (event, notificationId) => {
    event.stopPropagation()
    try {
      await acknowledgeAdminNotification(notificationId, user.uid)
    } catch (error) {
      console.error('Unable to acknowledge notification:', error)
    }
  }

  const handleNotificationClick = async (n) => {
    if (!n.issueId) return

    try {
      const q = query(
        collection(db, 'issues'),
        where('complaintId', '==', n.issueId),
        limit(1)
      )
      const snap = await getDocs(q)

      if (!snap.empty) {
        navigate(`/admin/reports/${snap.docs[0].id}`)
        return
      }

      navigate(`/admin/reports/${n.issueId}`)
    } catch (err) {
      console.error('Error navigating to complaint:', err)
      navigate(`/admin/reports/${n.issueId}`)
    }
  }

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('recipientRole', '==', 'admin')
    )

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        setRawNotifications(sortByCreatedDesc(list))
        setLoading(false)
      },
      (error) => {
        console.error('AdminNotifications Firestore error:', error)
        setLoading(false)
      }
    )

    return unsub
  }, [])

  return (
    <div>
      <PageHeader
        title={t('notifications')}
        description={t('adminNotificationsDescription')}
      />

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"
              role="status"
              aria-label={t('loadingNotifications')}
            />
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bell className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />

            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {t('noNotificationsYet')}
            </p>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('adminNotificationsEmptyDescription')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                !n.read
                  ? 'bg-primary-50/50 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
              }`}
            >
              <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">
                🔔
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`text-sm font-medium ${
                      !n.read
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {n.title}
                  </p>

                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {n.message}
                </p>

                {n.issueId && (
                  <p className="text-xs font-mono text-primary-600 dark:text-primary-400 mt-1">
                    {n.issueId}
                  </p>
                )}
                {(['high', 'critical'].includes(n.priority) || ['emergency', 'sla_escalation'].includes(n.type)) && (
                  n.acknowledgedAt ? (
                    <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                      Acknowledged by you {formatRelativeTime(n.acknowledgedAt)}
                    </p>
                  ) : (
                    <button type="button" onClick={(event) => handleAcknowledge(event, n.id)} className="mt-2 rounded-md bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700">
                      Acknowledge
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
