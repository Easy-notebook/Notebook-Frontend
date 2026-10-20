import { toast } from 'sonner';
import { create } from 'zustand';
import NotificationToast from '@/components/UI/NotificationToast';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: number;
  read: boolean;
}

interface NotificationStore {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (notification: NotificationItem) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  removeNotification: (id: string) => void;
}

function notificationSnapshot(
  notifications: NotificationItem[]
): Pick<NotificationStore, 'notifications' | 'unreadCount'> {
  return {
    notifications,
    unreadCount: notifications.reduce((count, item) => count + (item.read ? 0 : 1), 0),
  };
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  ...notificationSnapshot([]),
  addNotification: (notification) =>
    set((state) => notificationSnapshot([notification, ...state.notifications])),
  markAsRead: (id) =>
    set((state) => {
      if (!state.notifications.some((item) => item.id === id && !item.read)) return state;
      return notificationSnapshot(
        state.notifications.map((item) =>
          item.id === id && !item.read ? { ...item, read: true } : item
        )
      );
    }),
  markAllAsRead: () =>
    set((state) =>
      notificationSnapshot(
        state.notifications.map((item) => (item.read ? item : { ...item, read: true }))
      )
    ),
  clearAll: () => set(notificationSnapshot([])),
  removeNotification: (id) =>
    set((state) => notificationSnapshot(state.notifications.filter((item) => item.id !== id))),
}));

class NotificationService {
  private createNotification(type: NotificationType, title: string, message?: string) {
    const id = Math.random().toString(36).substring(7);
    const notification: NotificationItem = {
      id,
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
    };

    useNotificationStore.getState().addNotification(notification);
    return id;
  }

  success(title: string, message?: string) {
    this.createNotification('success', title, message);
    toast.custom(
      (id) => (
        <NotificationToast
          id={id}
          type="success"
          title={title}
          message={message}
          onDismiss={(id) => toast.dismiss(id)}
        />
      ),
      { duration: 3000 }
    );
  }

  error(title: string, message?: string) {
    this.createNotification('error', title, message);
    toast.custom(
      (id) => (
        <NotificationToast
          id={id}
          type="error"
          title={title}
          message={message}
          onDismiss={(id) => toast.dismiss(id)}
        />
      ),
      { duration: 3000 }
    );
  }

  info(title: string, message?: string) {
    this.createNotification('info', title, message);
    toast.custom(
      (id) => (
        <NotificationToast
          id={id}
          type="info"
          title={title}
          message={message}
          onDismiss={(id) => toast.dismiss(id)}
        />
      ),
      { duration: 3000 }
    );
  }

  warning(title: string, message?: string) {
    this.createNotification('warning', title, message);
    toast.custom(
      (id) => (
        <NotificationToast
          id={id}
          type="warning"
          title={title}
          message={message}
          onDismiss={(id) => toast.dismiss(id)}
        />
      ),
      { duration: 3000 }
    );
  }
}

export const notificationService = new NotificationService();
