import { useRef, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { BsImage, BsX } from 'react-icons/bs';
import { supabase } from '../../lib/supabase';

interface Props {
  value: string;          // current public URL (empty string = none)
  onChange: (url: string) => void;
}

const BUCKET = 'event-covers';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function EventImageUpload({ value, onChange }: Props) {
  const inputRef              = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError('Only JPEG, PNG, WebP or GIF images are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be under 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err: any) {
      setError(err.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      {value ? (
        /* ── Preview ── */
        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E5E5E3' }}>
          <img
            src={value}
            alt="Event cover"
            style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
          />
          <button
            type="button"
            onClick={handleRemove}
            style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(0,0,0,0.55)', border: 'none',
              borderRadius: '50%', width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff',
            }}
            aria-label="Remove image"
          >
            <BsX size={16} />
          </button>
        </div>
      ) : (
        /* ── Upload zone ── */
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          style={{
            height: '120px',
            border: '2px dashed #C8D5B9',
            borderRadius: '8px',
            background: '#FAFAF8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: uploading ? 'default' : 'pointer',
            transition: 'border-color .15s',
          }}
          onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLDivElement).style.borderColor = '#7a8567'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#C8D5B9'; }}
        >
          {uploading
            ? <Spinner animation="border" size="sm" style={{ color: '#7a8567' }} />
            : <BsImage size={28} style={{ color: '#7a8567', opacity: 0.6 }} />}
          <span style={{ fontSize: '0.78rem', color: '#888' }}>
            {uploading ? 'Uploading…' : 'Click to upload cover image'}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#bbb' }}>JPEG · PNG · WebP · GIF — max 5 MB</span>
        </div>
      )}

      {error && (
        <p style={{ fontSize: '0.78rem', color: '#dc3545', marginTop: '0.3rem', marginBottom: 0 }}>{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
