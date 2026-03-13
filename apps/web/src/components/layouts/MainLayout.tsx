import { Outlet } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import Sidebar from '../Sidebar';
import Topbar from '../Topbar';

// Detect if this app is running inside an iframe (e.g. Lovable)
const isIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

export default function MainLayout() {

  if (isIframe) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F5F5F3' }}>
        {/* No header — the Lovable parent app provides its own sidebar/topnav */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Container fluid className="p-0">
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
