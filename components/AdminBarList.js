// Proportional horizontal bar list for the admin dashboard's device/
// browser/event breakdowns. Colors are assigned per named key (passed in
// via `colors`), never by sort rank, so a category keeps its color
// whichever position it lands in as counts change.
export default function AdminBarList({ data, colors = {}, defaultColor = "var(--ink-dim)", labels = {} }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (!entries.length) return <div className="hint">No data yet.</div>;
  return (
    <div className="admin-bar-list">
      {entries.map(([key, n]) => (
        <div key={key} className="admin-bar-row">
          <span className="label">{labels[key] || key}</span>
          <div className="admin-bar-track">
            <div className="admin-bar-fill" style={{ width: `${(n / max) * 100}%`, background: colors[key] || defaultColor }} />
          </div>
          <span className="count">{n}</span>
        </div>
      ))}
    </div>
  );
}
