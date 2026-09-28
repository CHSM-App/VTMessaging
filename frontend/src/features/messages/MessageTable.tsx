import { Badge, Table } from '../../components/ui';
import type { Message } from '../../types';
import { fmtDate, providerLabel } from '../../utils/format';

export function MessageTable({ items, onOpen, showProject = true }: { items: Message[]; onOpen: (id: string) => void; showProject?: boolean }) {
  return (
    <Table head={['Created', ...(showProject ? ['Project'] : []), 'To', 'Type', 'Status', 'Sent via', 'Failure']} empty={!items.length}>
      {items.map((m) => (
        <tr key={m.id} className="cursor-pointer hover:text-heading" onClick={() => onOpen(m.id)}>
          <td className="whitespace-nowrap text-muted">{fmtDate(m.createdAt)}</td>
          {showProject && <td>{m.projectName}</td>}
          <td className="tabular-nums">{m.recipient}</td>
          <td className="text-xs">{m.messageType}</td>
          <td>
            <Badge>{m.status}</Badge>
          </td>
          <td className="text-xs">{m.instanceName ? `${m.instanceName} · ${providerLabel(m.provider ?? '')}` : '—'}</td>
          <td className="max-w-[16rem] truncate text-xs text-muted" title={m.failureReason ?? ''}>
            {m.failureCode ?? ''}
          </td>
        </tr>
      ))}
    </Table>
  );
}
