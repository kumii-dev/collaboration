import { useState } from 'react';
import { useQuery } from 'react-query';
import { Spinner, Alert, Badge, Form, InputGroup, Button, Table } from 'react-bootstrap';
import {
  FiSearch, FiDownload, FiUsers,
  FiCheckCircle, FiHelpCircle, FiXCircle,
} from 'react-icons/fi';
import { eventsApi, RsvpAttendee } from '../../lib/eventsApi';

interface Props {
  eventId: string;
}

type StatusKey = 'going' | 'interested' | 'not_going';

const STATUS_META: Record<StatusKey, { label: string; icon: React.ReactNode; bg: string; light: string }> = {
  going:     { label: 'Going',       icon: <FiCheckCircle size={12} />, bg: '#7a8567', light: '#f0f4ea' },
  interested:{ label: 'Interested',  icon: <FiHelpCircle  size={12} />, bg: '#e0a800', light: '#fff8e1' },
  not_going: { label: 'Not Going',   icon: <FiXCircle     size={12} />, bg: '#dc3545', light: '#fdecea' },
};

export default function EventAttendeesPanel({ eventId }: Props) {
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusKey | ''>('going');

  const { data, isLoading, error } = useQuery(
    ['event-attendees', eventId],
    () => eventsApi.getAttendees(eventId),
    { staleTime: 30_000, refetchOnWindowFocus: false }
  );

  // ── CSV export ──────────────────────────────────────────────────────────────
  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ['Full Name', 'Email', 'Industry / Sector', 'RSVP Status', 'RSVP Date'],
      ...data.attendees.map(a => [
        a.user.full_name  ?? '',
        a.user.email,
        a.user.industry   ?? '',
        a.status,
        new Date(a.created_at).toLocaleDateString('en-ZA'),
      ]),
    ];
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${(data.event_title ?? 'event').replace(/\s+/g, '_')}_attendees.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return (
    <div className="text-center py-5">
      <Spinner animation="border" style={{ color: '#7a8567' }} />
    </div>
  );

  if (error) return (
    <Alert variant="danger" style={{ borderRadius: 10 }}>
      Could not load attendees. Please try again.
    </Alert>
  );

  if (!data) return null;

  // ── filter ──────────────────────────────────────────────────────────────────
  const visible: RsvpAttendee[] = data.attendees.filter(a => {
    const matchStatus = !statusFilter || a.status === statusFilter;
    const q           = search.toLowerCase();
    const matchSearch = !search
      || (a.user.full_name ?? '').toLowerCase().includes(q)
      || a.user.email.toLowerCase().includes(q)
      || (a.user.industry ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div>
      {/* ── Summary pills ──────────────────────────────────────────────────── */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
        {(Object.keys(STATUS_META) as StatusKey[]).map(s => {
          const meta   = STATUS_META[s];
          const count  = data.counts[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(active ? '' : s)}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                padding:      '6px 14px',
                borderRadius: 20,
                border:       `1px solid ${active ? meta.bg : '#dee2e6'}`,
                background:   active ? meta.light : '#fff',
                color:        active ? meta.bg    : '#555',
                fontWeight:   active ? 600        : 400,
                fontSize:     13,
                cursor:       'pointer',
                transition:   'all 0.15s',
              }}
            >
              {meta.icon}
              <span>{meta.label}</span>
              <Badge
                style={{
                  background:   active ? meta.bg    : '#dee2e6',
                  color:        active ? '#fff'      : '#555',
                  fontSize:     11,
                  borderRadius: 10,
                  padding:      '2px 7px',
                  fontWeight:   600,
                }}
              >
                {count}
              </Badge>
            </button>
          );
        })}

        {/* Total + Export */}
        <div className="d-flex align-items-center gap-2 ms-auto flex-shrink-0">
          <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>
            <FiUsers size={13} className="me-1" />
            {data.total} total RSVP{data.total !== 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            variant="outline-secondary"
            style={{ borderRadius: 20, fontSize: 12, whiteSpace: 'nowrap' }}
            onClick={exportCSV}
            disabled={data.total === 0}
          >
            <FiDownload size={12} className="me-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <InputGroup className="mb-3" style={{ maxWidth: 380 }}>
        <InputGroup.Text style={{ background: '#fff', border: '1px solid #dee2e6', borderRight: 'none' }}>
          <FiSearch size={13} color="#aaa" />
        </InputGroup.Text>
        <Form.Control
          placeholder="Search by name, email or industry…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid #dee2e6', borderLeft: 'none', fontSize: 13 }}
        />
        {search && (
          <Button
            variant="outline-secondary"
            style={{ borderRadius: '0 8px 8px 0', fontSize: 12 }}
            onClick={() => setSearch('')}
          >
            ×
          </Button>
        )}
      </InputGroup>

      {/* ── Table / Empty state ────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div
          style={{
            textAlign:    'center',
            padding:      '2.5rem 1rem',
            border:       '1px dashed #dee2e6',
            borderRadius: 12,
            color:        '#aaa',
            fontSize:     14,
          }}
        >
          {data.total === 0
            ? "No one has RSVP'd to this event yet."
            : search
              ? 'No attendees match your search.'
              : `No "${statusFilter ? STATUS_META[statusFilter].label : 'any'}" RSVPs yet.`}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #E5E5E3' }}>
          <Table hover style={{ fontSize: 13, marginBottom: 0 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={th}>#</th>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Industry / Sector</th>
                <th style={th}>Status</th>
                <th style={th}>RSVP'd</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a, i) => {
                const meta   = STATUS_META[a.status as StatusKey];
                const initials = (a.user.full_name ?? a.user.email).charAt(0).toUpperCase();
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={td}><span style={{ color: '#bbb' }}>{i + 1}</span></td>

                    {/* Avatar + Name */}
                    <td style={td}>
                      <div className="d-flex align-items-center gap-2">
                        {a.user.avatar_url ? (
                          <img
                            src={a.user.avatar_url}
                            alt=""
                            style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'linear-gradient(135deg,#7a8567,#c5df96)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, color: '#fff', fontWeight: 700, flexShrink: 0,
                            }}
                          >
                            {initials}
                          </div>
                        )}
                        <span style={{ fontWeight: 500, color: '#2D2D2D' }}>
                          {a.user.full_name ?? <span style={{ color: '#aaa', fontStyle: 'italic' }}>No name</span>}
                        </span>
                      </div>
                    </td>

                    <td style={{ ...td, color: '#666' }}>{a.user.email}</td>

                    <td style={{ ...td, color: '#666' }}>
                      {a.user.industry
                        ? a.user.industry
                        : <span style={{ color: '#ccc', fontStyle: 'italic' }}>Not specified</span>}
                    </td>

                    <td style={td}>
                      <Badge
                        style={{
                          background:   meta?.light ?? '#eee',
                          color:        meta?.bg    ?? '#555',
                          border:       `1px solid ${meta?.bg ?? '#dee2e6'}`,
                          fontWeight:   500,
                          fontSize:     11,
                          padding:      '3px 9px',
                          borderRadius: 20,
                          display:      'inline-flex',
                          alignItems:   'center',
                          gap:          4,
                        }}
                      >
                        {meta?.icon}
                        {meta?.label ?? a.status}
                      </Badge>
                    </td>

                    <td style={{ ...td, color: '#999', whiteSpace: 'nowrap' }}>
                      {new Date(a.created_at).toLocaleDateString('en-ZA', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Row count footer */}
      {visible.length > 0 && (
        <div style={{ fontSize: 12, color: '#aaa', textAlign: 'right', marginTop: 8 }}>
          Showing {visible.length} of {data.total} attendee{data.total !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  fontWeight:    600,
  color:         '#555',
  padding:       '10px 14px',
  borderBottom:  '2px solid #E5E5E3',
  whiteSpace:    'nowrap',
};

const td: React.CSSProperties = {
  padding:      '10px 14px',
  verticalAlign: 'middle',
};
