import React from 'react';
import './GradientText.css';

export default function GradientText({
  children,
  className = "",
  colors = ["#4caf50", "#060010","#4caf50"], // Default colors
  animationSpeed = 3, // Default speed in seconds
  showBorder = false, // Default no border
}) {
  const gradientStyle = {
    backgroundImage: `linear-gradient(to right, ${colors.join(", ")})`,
    animation: `gradient-animation ${animationSpeed}s ease infinite`,
  };

  return (
    <div
      className={`animated-gradient-text ${className} ${showBorder ? 'with-border' : ''}`}
      style={gradientStyle}
    >
      {children}
    </div>
  );
}