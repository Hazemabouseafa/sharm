'use client';

import React from 'react';

export interface BrandLogoProps {
  variant?: 'horizontal' | 'horizontal-inverse' | 'stacked' | 'stacked-inverse' | 'icon' | 'icon-inverse';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Renders the official Sharm Pharaoh Travel brand logo across light and dark petrol surfaces.
 * Uses transparent PNG/WebP assets processed from the owner-supplied logo artwork (960x639, ~1.5:1 ratio).
 */
export function BrandLogo({ variant = 'horizontal', size = 'md', className = '' }: BrandLogoProps) {
  const isInverse =
    variant === 'horizontal-inverse' || variant === 'stacked-inverse' || variant === 'icon-inverse';

  if (variant === 'icon' || variant === 'icon-inverse') {
    const src = isInverse ? '/brand/logo-icon-inverse.png' : '/brand/logo-icon.png';
    const dim = size === 'sm' ? 40 : size === 'lg' ? 68 : 52;
    return (
      <img
        src={src}
        alt="Sharm Pharaoh Travel"
        width={dim}
        height={dim}
        data-no-translate="true"
        className={`object-contain shrink-0 select-none ${
          isInverse ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]' : ''
        } ${className}`}
      />
    );
  }

  const src = isInverse ? '/brand/logo-inverse.png' : '/brand/logo-normal.png';

  if (variant === 'stacked' || variant === 'stacked-inverse') {
    const height = size === 'sm' ? 76 : size === 'lg' ? 140 : 112;
    const width = Math.round(height * 1.502);
    return (
      <img
        src={src}
        alt="Sharm Pharaoh Travel"
        width={width}
        height={height}
        data-no-translate="true"
        style={{ height, width: 'auto' }}
        className={`object-contain shrink-0 select-none ${
          isInverse ? 'drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]' : ''
        } ${className}`}
      />
    );
  }

  // Horizontal lockup used in site header, admin sidebar, footer, and mobile nav drawer
  const height = size === 'sm' ? 52 : size === 'lg' ? 84 : 62;
  const width = Math.round(height * 1.502);

  return (
    <span className={`inline-flex items-center shrink-0 select-none ${className}`} data-no-translate="true">
      <img
        src={src}
        alt="Sharm Pharaoh Travel"
        width={width}
        height={height}
        style={{ height, width: 'auto' }}
        className={`object-contain shrink-0 ${
          isInverse ? 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]' : 'drop-shadow-[0_1px_4px_rgba(16,61,69,0.12)]'
        }`}
      />
    </span>
  );
}
