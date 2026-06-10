import React from 'react';

const ApiKeysRedirect = () => {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 80px)' }}>
      <iframe
        src="/api/projects/dashboard/keys"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '8px',
        }}
        title="API Keys Dashboard"
      />
    </div>
  );
};

export default ApiKeysRedirect;
