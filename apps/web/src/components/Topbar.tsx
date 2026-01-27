import React from 'react';
import { Button } from 'react-bootstrap';
import { FaBell } from 'react-icons/fa';
import { supabase } from '../lib/supabase';

export default function Topbar() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="topbar">
      <div>
        <h4 className="mb-0">Collaboration Platform</h4>
      </div>
      <div className="d-flex align-items-center gap-3">
        <Button variant="link" className="position-relative">
          <FaBell size={20} />
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            3
          </span>
        </Button>
        <Button variant="outline-danger" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </div>
  );
}
