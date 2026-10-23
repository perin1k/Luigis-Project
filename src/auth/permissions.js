const STAFF_ACTIONS = new Set(['orders.read', 'orders.prepare', 'availability.update', 'account.password.change']);
const ADMIN_ACTIONS = new Set([
  ...STAFF_ACTIONS, 'employees.manage',
  'cancellation.decide', 'refund.approve', 'notifications.retry', 'privacy.manage',
]);
const OWNER_ACTIONS = new Set([...ADMIN_ACTIONS, 'menu.edit', 'hours.manage', 'analytics.read', 'staff.roles.change']);

/** Internal policy only: the role must come from a validated persisted session. */
export function canPerformAction(strRole, strAction) {
  if (typeof strAction !== 'string') return false;
  if (strRole === 'owner') return OWNER_ACTIONS.has(strAction);
  if (strRole === 'admin') return ADMIN_ACTIONS.has(strAction);
  if (strRole === 'employee') return STAFF_ACTIONS.has(strAction);
  return false;
}
