import { Link, useLocation } from 'react-router-dom';
import { Nav } from 'react-bootstrap';
import { FaHome, FaComments, FaFolderOpen, FaShieldAlt, FaUser } from 'react-icons/fa';

export default function Sidebar() {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: <FaHome />, label: 'Dashboard' },
    { path: '/chat', icon: <FaComments />, label: 'Chat' },
    { path: '/forum', icon: <FaFolderOpen />, label: 'Forum' },
    { path: '/moderation', icon: <FaShieldAlt />, label: 'Moderation' },
    { path: '/profile', icon: <FaUser />, label: 'Profile' },
  ];

  return (
    <div className="sidebar">
      <h3 className="mb-4">Kumii</h3>
      <Nav className="flex-column">
        {navItems.map((item) => (
          <Nav.Link
            as={Link}
            key={item.path}
            to={item.path}
            className={`d-flex align-items-center gap-2 text-white mb-2 ${
              location.pathname.startsWith(item.path) ? 'active' : ''
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Nav.Link>
        ))}
      </Nav>
    </div>
  );
}
