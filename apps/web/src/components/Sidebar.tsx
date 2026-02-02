import { Link } from 'react-router-dom';
import { 
  FaHome, 
  FaComments, 
  FaCalendar, 
  FaPhone, 
  FaFolder, 
  FaBriefcase,
  FaHeadphones,
  FaEllipsisH,
  FaChartLine,
  FaSearch
} from 'react-icons/fa';
import { MdGridView, MdTrendingUp } from 'react-icons/md';

export default function Sidebar() {
  const sidebarIcons = [
    { path: '/dashboard', icon: <FaHome size={20} />, label: 'Home' },
    { path: '/activity', icon: <FaChartLine size={20} />, label: 'Activity', badge: 3 },
    { path: '/chat', icon: <FaComments size={20} />, label: 'Chat' },
    { path: '/calendar', icon: <FaCalendar size={20} />, label: 'Calendar' },
    { path: '/calls', icon: <FaPhone size={20} />, label: 'Calls' },
    { path: '/folder', icon: <FaFolder size={20} />, label: 'Folder' },
    { path: '/business', icon: <FaBriefcase size={20} />, label: 'Business' },
    { path: '/community', icon: <MdGridView size={20} />, label: 'Community', active: true },
    { path: '/support', icon: <FaHeadphones size={20} />, label: 'Support' },
    { path: '/more', icon: <FaEllipsisH size={20} />, label: 'More' },
  ];

  const growthGatewayItems = [
    { id: 'access-capital', label: 'Access To Capital', path: '/growth/capital' },
    { id: 'access-market', label: 'Access To Market', path: '/growth/market' },
    { id: 'expert-advisory', label: 'Expert Advisory', path: '/growth/advisory' },
    { id: 'mentorship', label: 'Mentorship', path: '/growth/mentorship' },
    { id: 'business-tools', label: 'Business Tools', path: '/growth/tools' },
    { id: 'resources-hub-link', label: 'Resources Hub', path: '/resources', highlight: true },
  ];

  const resourcesHubItems = [
    { id: 'learning-hub', label: 'Learning Hub', path: '/resources/learning', highlight: false },
    { id: 'knowledge-library', label: 'Knowledge Library', path: '/resources/knowledge' },
    { id: 'tools-downloads', label: 'Tools & Downloads', path: '/resources/tools' },
    { id: 'community-networking', label: 'Community & Networking', path: '/forum', active: true },
    { id: 'support-help', label: 'Support & Help Center', path: '/support' },
  ];

  return (
    <div className="app-sidebar-container">
      {/* Left Icon Sidebar */}
      <div className="icon-sidebar">
        <div className="icon-sidebar-content">
          {sidebarIcons.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`icon-sidebar-item ${item.active ? 'active' : ''}`}
              title={item.label}
            >
              <div className="icon-wrapper">
                {item.icon}
                {item.badge && <span className="icon-badge">{item.badge}</span>}
              </div>
            </Link>
          ))}
        </div>
        <div className="icon-sidebar-footer">
          <div className="user-avatar">KM</div>
        </div>
      </div>

      {/* Main Content Sidebar */}
      <div className="content-sidebar shadow-lg">
        {/* Search Bar */}
        <div className="sidebar-search">
          <FaSearch className="search-icon" />
          <input 
            type="text" 
            placeholder="Search apps and more" 
            className="search-input"
          />
        </div>

        {/* Growth Gateway Section */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Growth Gateway</h3>
          <div className="sidebar-menu">
            {growthGatewayItems.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`sidebar-menu-item ${item.highlight ? 'highlight' : ''}`}
              >
                <div className="menu-item-icon">
                  <MdTrendingUp />
                </div>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Resources Hub Section */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Resources Hub</h3>
          <div className="sidebar-menu">
            {resourcesHubItems.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className={`sidebar-menu-item ${item.highlight ? 'highlight' : ''} ${item.active ? 'active' : ''}`}
              >
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
