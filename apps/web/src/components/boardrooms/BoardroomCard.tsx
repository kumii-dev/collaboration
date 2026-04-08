import { useState } from 'react';
import { Card, Button, Badge, Spinner } from 'react-bootstrap';
import { FiUsers, FiEdit2, FiTrash2, FiToggleLeft, FiToggleRight } from 'react-icons/fi';
import { useMutation, useQueryClient } from 'react-query';
import { Boardroom, updateBoardroom, deleteBoardroom } from '../../lib/boardroomApi';
import BookingCalendarModal from './BookingCalendarModal';
import CreateBoardroomModal from './CreateBoardroomModal';

interface Props {
  boardroom: Boardroom;
  isAdmin:   boolean;
}

const BTN_STYLE = { background: '#7a8567', borderColor: '#7a8567', color: 'white' };

export default function BoardroomCard({ boardroom, isAdmin }: Props) {
  const qc = useQueryClient();
  const [showBook,   setShowBook]   = useState(false);
  const [showEdit,   setShowEdit]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const toggleMutation = useMutation(
    () => updateBoardroom(boardroom.id, { is_active: !boardroom.is_active }),
    { onSuccess: () => qc.invalidateQueries('boardrooms') }
  );

  const deleteMutation = useMutation(
    () => deleteBoardroom(boardroom.id),
    {
      onSuccess: () => {
        qc.invalidateQueries('boardrooms');
        setConfirmDel(false);
      },
      onError: (err: any) => {
        alert(err?.response?.data?.error ?? 'Delete failed');
        setConfirmDel(false);
      },
    }
  );

  return (
    <>
      <Card
        className="h-100 shadow-sm"
        style={{
          borderRadius: 14,
          border: '1px solid #E5E5E3',
          opacity: boardroom.is_active ? 1 : 0.6,
        }}
      >
        {boardroom.image_url && (
          <Card.Img
            variant="top"
            src={boardroom.image_url}
            style={{ height: 160, objectFit: 'cover', borderRadius: '14px 14px 0 0' }}
          />
        )}
        <Card.Body className="d-flex flex-column">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <h6 className="mb-0" style={{ fontWeight: 700, color: '#3a3a3a' }}>
              {boardroom.name}
            </h6>
            {!boardroom.is_active && (
              <Badge style={{ background: '#999', fontSize: 10 }}>Inactive</Badge>
            )}
          </div>

          {boardroom.description && (
            <p className="text-muted mb-2" style={{ fontSize: 13 }}>
              {boardroom.description}
            </p>
          )}

          <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 13, color: '#666' }}>
            <FiUsers size={14} />
            <span>Capacity: {boardroom.capacity}</span>
          </div>

          {boardroom.amenities.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-3">
              {boardroom.amenities.map(a => (
                <Badge
                  key={a}
                  style={{ background: '#f0f4ea', color: '#7a8567', border: '1px solid #c5df96', fontWeight: 400, fontSize: 11 }}
                >
                  {a}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-auto d-flex gap-2 flex-wrap">
            {boardroom.is_active && (
              <Button size="sm" style={BTN_STYLE} onClick={() => setShowBook(true)}>
                Book a Slot
              </Button>
            )}

            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => setShowEdit(true)}
                  title="Edit"
                >
                  <FiEdit2 size={13} />
                </Button>

                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => toggleMutation.mutate()}
                  disabled={toggleMutation.isLoading}
                  title={boardroom.is_active ? 'Deactivate' : 'Activate'}
                >
                  {toggleMutation.isLoading
                    ? <Spinner size="sm" animation="border" />
                    : boardroom.is_active ? <FiToggleRight size={15} /> : <FiToggleLeft size={15} />}
                </Button>

                {!confirmDel ? (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => setConfirmDel(true)}
                    title="Delete"
                  >
                    <FiTrash2 size={13} />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isLoading}
                  >
                    {deleteMutation.isLoading ? <Spinner size="sm" animation="border" /> : 'Confirm Delete?'}
                  </Button>
                )}
              </>
            )}
          </div>
        </Card.Body>
      </Card>

      {showBook && (
        <BookingCalendarModal
          show={showBook}
          onHide={() => setShowBook(false)}
          boardroom={boardroom}
        />
      )}

      {showEdit && isAdmin && (
        <CreateBoardroomModal
          show={showEdit}
          onHide={() => setShowEdit(false)}
          existing={boardroom}
        />
      )}
    </>
  );
}
