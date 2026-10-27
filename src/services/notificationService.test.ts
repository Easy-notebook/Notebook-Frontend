import { beforeEach, expect, it } from 'vitest';
import { useNotificationStore, type NotificationItem } from './notificationService';

const state = () => useNotificationStore.getState();
const notification = (id: string, read = false): NotificationItem => ({
  id,
  read,
  type: 'info',
  title: id,
  timestamp: 0,
});

beforeEach(() => state().clearAll());

it('counts only unread entries when adding notifications', () => {
  state().addNotification(notification('read', true));
  state().addNotification(notification('unread'));
  expect(state().unreadCount).toBe(1);
});

it('marks all matching entries read even when the first match was already read', () => {
  state().addNotification(notification('same'));
  state().addNotification(notification('same', true));
  state().markAsRead('same');
  expect(state().notifications.every((item) => item.read)).toBe(true);
  expect(state().unreadCount).toBe(0);
});

it('removes all matching entries and derives the remaining unread count', () => {
  state().addNotification(notification('same'));
  state().addNotification(notification('same'));
  state().addNotification(notification('other'));
  state().removeNotification('same');
  expect(state().notifications.map((item) => item.id)).toEqual(['other']);
  expect(state().unreadCount).toBe(1);
});

it('keeps read and removal transitions idempotent', () => {
  state().addNotification(notification('a'));
  state().addNotification(notification('b'));
  state().markAsRead('a');
  state().markAsRead('a');
  state().markAsRead('missing');
  expect(state().unreadCount).toBe(1);
  state().markAllAsRead();
  state().markAllAsRead();
  state().removeNotification('missing');
  expect(state().unreadCount).toBe(0);
  state().clearAll();
  expect(state().notifications).toEqual([]);
  expect(state().unreadCount).toBe(0);
});
