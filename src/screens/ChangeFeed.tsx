import { ago, type Change } from '../model.ts'

export function ChangeFeed({ changes }: { changes: Change[] }) {
  if (!changes.length) return <p className="muted">No changes yet.</p>
  return (
    <div className="stack-sm feed">
      {changes.map((c) => (
        <div key={c.at + c.text}>
          <div className="status-line">
            <span className={c.by === 'Claude' ? 'dot agent' : c.by === 'You' ? 'dot good' : 'dot'} />
            <span>
              {c.by} {c.text}
            </span>
          </div>
          <div className="caption indent">{ago(c.at)}</div>
        </div>
      ))}
    </div>
  )
}
