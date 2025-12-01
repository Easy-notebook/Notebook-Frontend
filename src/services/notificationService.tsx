import { toast } from 'sonner';
import { create } from 'zustand';
import React from 'react';
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

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),
  markAsRead: (id) =>
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      if (notification && !notification.read) {
        return {
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, state.unreadCount - 1),
        };
      }
      return state;
    }),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  clearAll: () => set({ notifications: [], unreadCount: 0 }),
  removeNotification: (id) =>
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount:
          notification && !notification.read
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
      };
    }),
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
