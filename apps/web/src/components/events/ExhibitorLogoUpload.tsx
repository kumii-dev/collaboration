import { useRef, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { BsCamera, BsX } from 'react-icons/bs';
import { FiGlobe } from 'react-icons/fi';
import { supabase } from '../../lib/supabase';

const BUCKET        = 'exhibitor-logos';
const MAX_MB        = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

interface Props {
  value:    string | undefined;
  onChange: (url: string) => void;
}

export default function ExhibitorLogoUpload({ value, onChange }: Props) {
  const inputRef           = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!inputRef.current) return;
    inputRef.current.value = ''; // reset so same file can be re-selected

    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, WebP, GIF, or SVG images are allowed.');
      return;
    }

    // Validate size
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_MB} MB.`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Build a unique path: exhibitor-logos/<timestamp>-<random>.<ext>
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err: any) {
      setError(err?.message ?? 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange('');
    setError(null);
  };

  return (
    <div>
      {/* Preview or placeholder */}
      <div
        style={{
          width:          '100%',
          height:         120,
          borderRadius:   '8px',
          border:         '1px solid #E5E5E3',
          background:     '#F5F5F3',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          overflow:       'hidden',
          marginBottom:   '0.5rem',
          position:       'relative',
        }}
      >
        {value ? (
          <>
            <img
              src={value}
              alt="Exhibitor logo"
              style={{ maxHeight: '100px', maxWidth: '100%', objectFit: 'contain', padding: '8px' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            {/* Remove button */}
            <button
              type="button"
              onClick={handleRemove}
              title="Remove image"
              style={{
                position:   'absolute',
                top:        6,
                right:      6,
                background: 'rgba(0,0,0,0.55)',
                border:     'none',
                borderRadius: '50%',
                width:      22,
                height:     22,
                display:    'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor:     'pointer',
                color:      '#fff',
                padding:    0,
              }}
            >
              <BsX size={14} />
            </button>
          </>
        ) : (
          <div className="text-center" style={{ color: '#bbb' }}>
            <FiGlobe size={28} style={{ marginBottom: '0.3rem' }} />
            <div style={{ fontSize: '0.75rem' }}>No logo</div>
          </div>
        )}

        {/* Upload overlay spinner */}
        {uploading && (
          <div style={{
            position:       'absolute', inset: 0,
            background:     'rgba(255,255,255,0.75)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
          }}>
            <Spinner animation="border" size="sm" style={{ color: '#7a8567' }} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: '0.78rem', color: '#dc3545', marginBottom: '0.4rem' }}>
          {error}
        </div>
      )}

      {/* Upload button */}
      <Button
        type="button"
        variant="outline-secondary"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        style={{ borderRadius: '6px', fontSize: '0.78rem', width: '100%' }}
      >
        {uploading
          ? <><Spinner animation="border" size="sm" className="me-1" />Uploading…</>
          : <><BsCamera size={13} className="me-1" />{value ? 'Replace Logo' : 'Upload Logo'}</>
        }
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
