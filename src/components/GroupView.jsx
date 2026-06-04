import React, { useState } from 'react';

export default function GroupView({ token, userId }) {
  const [groups, setGroups] = useState([]);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Groups</h2>
      <p className="text-muted">Groups section coming soon...</p>
    </div>
  );
}
