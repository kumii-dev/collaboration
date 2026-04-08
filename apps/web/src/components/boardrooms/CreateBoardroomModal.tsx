import React, { useState } from 'react';
import { Modal, Button, Form, Spinner, Alert } from 'react-bootstrap';
import { useMutation, useQueryClient } from 'react-query';
import { createBoardroom, updateBoardroom, Boardroom, CreateBoardroomPayload } from '../../lib/boardroomApi';

interface Props {
  show:      boolean;
  onHide:    () => void;
  existing?: Boardroom | null;
}

const BTN_STYLE = { background: '#7a8567', borderColor: '#7a8567', color: 'white' };

export default function CreateBoardroomModal({ show, onHide, existing }: Props) {
  const qc        = useQueryClient();
  const isEditing = !!existing;

  const [name,        setName]        = useState(existing?.name        ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [capacity,    setCapacity]    = useState(String(existing?.capacity ?? 10));
  const [amenityStr,  setAmenityStr]  = useState((existing?.amenities ?? []).join(', '));
  const [imageUrl,    setImageUrl]    = useState(existing?.image_url   ?? '');
  const [error,       setError]       = useState<string | null>(null);

  // Reset when modal opens/existing changes
  React.useEffect(() => {
    if (show) {
      setName(existing?.name        ?? '');
      setDescription(existing?.description ?? '');
      setCapacity(String(existing?.capacity ?? 10));
      setAmenityStr((existing?.amenities ?? []).join(', '));
      setImageUrl(existing?.image_url   ?? '');
      setError(null);
    }
  }, [show, existing]);

  const mutation = useMutation(
    async (payload: CreateBoardroomPayload & { is_active?: boolean }) => {
      if (isEditing && existing) {
        return updateBoardroom(existing.id, payload);
      }
      return createBoardroom(payload);
    },
    {
      onSuccess: () => {
        qc.invalidateQueries('boardrooms');
        onHide();
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error ?? err?.message ?? 'Something went wrong');
      },
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amenities = amenityStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    mutation.mutate({
      name:        name.trim(),
      description: description.trim() || undefined,
      capacity:    Number(capacity),
      amenities,
      image_url:   imageUrl.trim() || undefined,
    });
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ color: '#7a8567', fontWeight: 700 }}>
          {isEditing ? 'Edit Boardroom' : 'Add New Boardroom'}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <Form.Group className="mb-3">
            <Form.Label>Room Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Boardroom A"
              required
              maxLength={200}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the room..."
              maxLength={1000}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Capacity</Form.Label>
            <Form.Control
              type="number"
              min={1}
              max={500}
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Amenities <span className="text-muted" style={{ fontSize: 12 }}>(comma-separated)</span></Form.Label>
            <Form.Control
              value={amenityStr}
              onChange={e => setAmenityStr(e.target.value)}
              placeholder="e.g. Projector, Whiteboard, WiFi"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Image URL <span className="text-muted" style={{ fontSize: 12 }}>(optional)</span></Form.Label>
            <Form.Control
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </Form.Group>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={mutation.isLoading}>
            Cancel
          </Button>
          <Button type="submit" style={BTN_STYLE} disabled={mutation.isLoading || !name.trim()}>
            {mutation.isLoading
              ? <><Spinner size="sm" animation="border" className="me-2" />Saving…</>
              : isEditing ? 'Save Changes' : 'Create Boardroom'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
