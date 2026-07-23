import React from 'react';

// Reproduces the dc-runtime `style-active` behavior: merges an extra style
// object while the element is pressed (mouse/touch), used for the little
// scale-down "tap" feedback on buttons throughout the app.
export function Pressable({ as = 'button', style, activeStyle, children, ...rest }) {
  const [active, setActive] = React.useState(false);
  const merged = active && activeStyle ? { ...style, ...activeStyle } : style;
  const Tag = as;
  return (
    <Tag
      {...rest}
      style={merged}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
    >
      {children}
    </Tag>
  );
}
