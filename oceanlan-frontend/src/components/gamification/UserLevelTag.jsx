import React from 'react';

const UserLevelTag = ({ level }) => {
  // Level yoksa veya 0 ise gösterme
  if (!level || level < 0) return null;

  return (
    <span style={{
      fontSize: '10px',
      fontWeight: 'bold',
      background: 'linear-gradient(45deg, #5865F2, #4752C4)', // Discord mavisi
      color: '#fff',
      padding: '1px 5px',
      borderRadius: '4px',
      marginLeft: '6px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      userSelect: 'none',
      verticalAlign: 'middle'
    }}>
      Lv{level}
    </span>
  );
};

export default UserLevelTag;