import React from 'react';
import { Outlet } from 'react-router-dom';
import { Container } from 'react-bootstrap';
import Sidebar from '../Sidebar';
import Topbar from '../Topbar';

export default function MainLayout() {
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
