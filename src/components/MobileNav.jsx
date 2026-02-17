import React from 'react';

const MobileNav = () => {
  return (
    <div className="mobile-bottom-nav d-md-none border-top bg-white fixed-bottom d-flex justify-content-around align-items-center">
      <button className="btn btn-link text-dark p-2"><i className="bi bi-house-door-fill fs-4"></i></button>
      <button className="btn btn-link text-dark p-2"><i className="bi bi-search fs-4"></i></button>
      <button className="btn btn-link text-primary p-2"><i className="bi bi-plus-square-fill fs-2"></i></button>
      <button className="btn btn-link text-dark p-2"><i className="bi bi-people fs-4"></i></button>
      <button className="btn btn-link text-dark p-2"><i className="bi bi-person-circle fs-4"></i></button>
    </div>
  );
};

export default MobileNav;