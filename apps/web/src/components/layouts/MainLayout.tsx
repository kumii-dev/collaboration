import { Outlet, useNavigate } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import Sidebar from '../Sidebar';
import Topbar from '../Topbar';

// Detect if this app is running inside an iframe (e.g. Lovable)
const isIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

export default function MainLayout() {
  const navigate = useNavigate();

  if (isIframe) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F5F5F3' }}>
        {/* Slim iframe header — just a back button when navigated deep */}
        <div style={{
          height: 44,
          background: '#fff',
          borderBottom: '1px solid #E5E5E3',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          flexShrink: 0,
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#7a8567', fontWeight: 600, fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 4, padding: 0,
            }}
          >
            ← Back
          </button>
          <span style={{ color: '#E5E5E3' }}>|</span>
          <span style={{
            fontWeight: 700, fontSize: '0.85rem',
            background: 'linear-gradient(135deg,#7a8567,#c5df96)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Kumii Collaboration
          </span>
        </div>
        {/* Full-height content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <Container fluid>
            <Outlet />
          </Container>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <div className="content-area">
          <Container fluid>
            <Outlet />
          </Container>
        </div>
      </div>
    </div>
  );
}
