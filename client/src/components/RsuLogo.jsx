import React from 'react';

/**
 * Componente RsuLogo.
 * Muestra el imagotipo oficial RSU (sin AMBIENTAL) junto con el texto 'Manager'
 * seleccionable en gris oscuro. Permite ocultar el texto en pantallas reducidas
 * (showText=false) para ganar espacio visual.
 */
export default function RsuLogo({
  showText = true,
  size = 'md', // 'sm' | 'md' | 'lg' | 'hero'
  inverted = false, // true para sidebar con fondo oscuro
  symbolOnly = false, // true para usar solo el isotipo de la 'S' con la hoja
  className = '',
}) {
  const heightMap = {
    sm: 26,
    md: 34,
    lg: 46,
    hero: 64,
  };

  const textClassMap = {
    sm: 'rsu-logo-text-sm',
    md: 'rsu-logo-text-md',
    lg: 'rsu-logo-text-lg',
    hero: 'rsu-logo-text-hero',
  };

  const imgHeight = heightMap[size] || 34;
  const imageSrc = symbolOnly ? '/brand/rsu-symbol.png' : '/brand/rsu-logo.png';
  const altText = symbolOnly ? 'RSU Símbolo' : 'RSU';

  return (
    <div className={`rsu-logo-container ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <img
        src={imageSrc}
        alt={altText}
        style={{
          height: `${imgHeight}px`,
          width: 'auto',
          display: 'block',
          objectFit: 'contain',
        }}
      />
      {showText && (
        <span
          className={`rsu-logo-text ${textClassMap[size] || ''}`}
          style={{
            color: inverted ? '#cbd5e1' : '#334155',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            userSelect: 'text',
          }}
        >
          Manager
        </span>
      )}
    </div>
  );
}

