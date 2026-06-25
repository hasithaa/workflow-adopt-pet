export default function StatusBadge({ status }) {
  const cls = ['Running', 'Completed', 'Failed', 'Canceled', 'Terminated', 'TimedOut'].includes(status)
    ? `badge badge-${status}` : 'badge badge-default';
  return <span className={cls}>{status}</span>;
}

// Role → colour, shared across the user switcher and task panels.
const ROLE_COLORS = {
  abc_shop:       '#2980b9',
  pqr_shop:       '#16a085',
  shelter_admin:  '#9b59b6',
  shelter_worker: '#e67e22',
};
export const roleColor = r => ROLE_COLORS[r] || '#607080';
