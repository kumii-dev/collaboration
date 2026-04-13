import React, { useState } from 'react';
import { Modal, Button, Form, Spinner, Alert } from 'react-bootstrap';
import { useMutation, useQueryClient } from 'react-query';
import { FiLink, FiHash } from 'react-icons/fi';
import { submitPayment, Booking, formatDateSAST, formatSlotSAST } from '../../lib/boardroomApi';

interface Props {
  show:    boolean;
  onHide:  () => void;
  booking: Booking;
}

const BTN_STYLE = { background: '#7a8567', borderColor: '#7a8567', color: 'white' };

export default function PaymentSubmitModal({ show, onHide, booking }: Props) {
  const qc = useQueryClient();

  const [proofUrl,   setProofUrl]   = useState('');
  const [reference,  setReference]  = useState('');
  const [error,      setError]      = useState<string | null>(null);
  const [submitted,  setSubmitted]  = useState(false);

  const room = booking.boardrooms;

  // Reset when modal opens
  React.useEffect(() => {
    if (show) {
      setProofUrl('');
      setReference('');
      setError(null);
      setSubmitted(false);
    }
  }, [show]);

  const mutation = useMutation(
    () => submitPayment(booking.id, {
      payment_proof_url: proofUrl.trim() || undefined,
      payment_reference: reference.trim() || undefined,
    }),
    {
      onSuccess: () => {
        qc.invalidateQueries('my-bookings');
        qc.invalidateQueries('all-bookings');
        setSubmitted(true);
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error ?? err?.message ?? 'Submission failed. Please try again.');
      },
    }
  );

  const handleSubmit = () => {
    if (!proofUrl.trim() && !reference.trim()) {
      setError('Please provide either a payment proof URL or a payment reference number.');
      return;
    }
    if (proofUrl.trim()) {
      try { new URL(proofUrl.trim()); }
      catch { setError('The payment proof URL is not valid. Please enter a full URL (e.g. https://…)'); return; }
    }
    setError(null);
    mutation.mutate();
  };

  const handleClose = () => {
    setSubmitted(false);
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ color: '#7a8567', fontWeight: 700 }}>
          Submit Payment Proof
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {submitted ? (
          <div className="text-center py-3">
            <div style={{ fontSize: 44 }}>📋</div>
            <h6 className="mt-3 mb-1" style={{ color: '#7a8567' }}>Proof Received!</h6>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              An admin will review your payment and confirm your booking. You'll receive a notification once it's approved.
            </p>
          </div>
        ) : (
          <>
            {/* Booking summary */}
            <div
              style={{
                background: '#f0f4ea',
                border: '1px solid #c5df96',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              <strong style={{ color: '#7a8567' }}>{room?.name ?? 'Boardroom'}</strong>
              <div className="text-muted mt-1">
                {formatDateSAST(booking.slot_start)} · {formatSlotSAST(booking.slot_start)}
              </div>
            </div>

            {error && (
              <Alert variant="danger" onClose={() => setError(null)} dismissible className="py-2" style={{ fontSize: 13 }}>
                {error}
              </Alert>
            )}

            <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Provide at least one of the following to verify your payment:
            </p>

            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 13, fontWeight: 600 }}>
                <FiLink size={13} className="me-1" />
                Payment Proof URL <span className="text-muted fw-normal">(screenshot or receipt link)</span>
              </Form.Label>
              <Form.Control
                type="url"
                value={proofUrl}
                onChange={e => setProofUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
                style={{ fontSize: 13 }}
              />
              <Form.Text className="text-muted" style={{ fontSize: 11 }}>
                Upload your screenshot to Google Drive, Dropbox, or similar and paste the shareable link.
              </Form.Text>
            </Form.Group>

            <div className="text-center text-muted mb-3" style={{ fontSize: 12 }}>— or —</div>

            <Form.Group>
              <Form.Label style={{ fontSize: 13, fontWeight: 600 }}>
                <FiHash size={13} className="me-1" />
                Payment Reference Number
              </Form.Label>
              <Form.Control
                type="text"
                maxLength={200}
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. EFT123456789"
                style={{ fontSize: 13 }}
              />
              <Form.Text className="text-muted" style={{ fontSize: 11 }}>
                The reference or transaction ID from your bank or payment confirmation.
              </Form.Text>
            </Form.Group>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        {submitted ? (
          <Button style={BTN_STYLE} onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline-secondary" onClick={handleClose} disabled={mutation.isLoading}>
              Cancel
            </Button>
            <Button style={BTN_STYLE} onClick={handleSubmit} disabled={mutation.isLoading}>
              {mutation.isLoading
                ? <><Spinner size="sm" animation="border" className="me-2" />Submitting…</>
                : 'Submit Proof'}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
